import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	readdir,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ANALYSIS_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

export interface AsrAnalysisCacheOptions {
	cacheDir?: string;
	ttlMs?: number;
	maxBytes?: number;
}

export interface NormalizedAudioCacheResult {
	path: string;
	key: string;
	cacheHit: boolean;
}

export interface DiarizationCacheResult<Output> {
	output: Output;
	key: string;
	cacheHit: boolean;
}

export interface GetOrCreateNormalizedAudioOptions {
	input: Uint8Array;
	profile: string;
	version: string;
	create: (partPath: string) => Promise<void>;
}

export interface GetOrCreateDiarizationOutputOptions<Output> {
	normalizedKey: string;
	speakerCount: string | number;
	modelFingerprint: string;
	version: string;
	create: () => Promise<Output>;
}

interface CacheFile {
	path: string;
	size: number;
	modifiedAt: number;
}

function hashParts(namespace: string, parts: readonly (string | Uint8Array)[]) {
	const hash = createHash("sha256");
	hash.update(namespace);
	for (const part of parts) {
		const bytes = typeof part === "string" ? Buffer.from(part) : part;
		const length = Buffer.allocUnsafe(8);
		length.writeBigUInt64BE(BigInt(bytes.byteLength));
		hash.update(length);
		hash.update(bytes);
	}
	return hash.digest("hex");
}

function isMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

async function removeIfPresent(filePath: string) {
	try {
		await unlink(filePath);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
}

export class AsrAnalysisCache {
	readonly cacheDir: string;
	readonly ttlMs: number;
	readonly maxBytes: number;

	private readonly normalizedInFlight = new Map<
		string,
		Promise<NormalizedAudioCacheResult>
	>();
	private readonly diarizationInFlight = new Map<string, Promise<unknown>>();
	private readonly activeParts = new Set<string>();
	private cleanupTail: Promise<void> = Promise.resolve();

	constructor(options: AsrAnalysisCacheOptions = {}) {
		this.cacheDir =
			options.cacheDir ??
			process.env.LEMYLOI_DICHVIDEO_ANALYSIS_CACHE_DIR ??
			join(tmpdir(), "lemyloi-dichvideo-asr-cache");
		this.ttlMs = options.ttlMs ?? DEFAULT_ANALYSIS_CACHE_TTL_MS;
		this.maxBytes = options.maxBytes ?? DEFAULT_ANALYSIS_CACHE_MAX_BYTES;

		if (this.ttlMs < 0 || this.maxBytes <= 0) {
			throw new Error(
				"Analysis cache TTL must be non-negative and maxBytes positive.",
			);
		}
	}

	getOrCreateNormalizedAudio(
		options: GetOrCreateNormalizedAudioOptions,
	): Promise<NormalizedAudioCacheResult> {
		const key = hashParts("lemyloi-dichvideo:normalized-audio:v1", [
			options.input,
			options.profile,
			options.version,
		]);
		const running = this.normalizedInFlight.get(key);
		if (running) return running;

		const task = this.createNormalizedAudio(key, options.create).finally(() => {
			this.normalizedInFlight.delete(key);
		});
		this.normalizedInFlight.set(key, task);
		return task;
	}

	getOrCreateDiarizationOutput<Output>(
		options: GetOrCreateDiarizationOutputOptions<Output>,
	): Promise<DiarizationCacheResult<Output>> {
		const key = hashParts("lemyloi-dichvideo:diarization:v1", [
			options.normalizedKey,
			String(options.speakerCount),
			options.modelFingerprint,
			options.version,
		]);
		const running = this.diarizationInFlight.get(key) as
			| Promise<DiarizationCacheResult<Output>>
			| undefined;
		if (running) return running;

		const task = this.createDiarizationOutput(key, options.create).finally(
			() => {
				this.diarizationInFlight.delete(key);
			},
		);
		this.diarizationInFlight.set(key, task);
		return task;
	}

	private async createNormalizedAudio(
		key: string,
		create: (partPath: string) => Promise<void>,
	): Promise<NormalizedAudioCacheResult> {
		await this.cleanup();
		const finalPath = join(this.cacheDir, `${key}.wav`);
		if (await this.isFreshNonemptyFile(finalPath)) {
			return { path: finalPath, key, cacheHit: true };
		}

		const partPath = join(this.cacheDir, `${key}.${randomUUID()}.part.wav`);
		this.activeParts.add(partPath);
		try {
			await create(partPath);
			const created = await stat(partPath);
			if (!created.isFile() || created.size === 0) {
				throw new Error(
					"Normalized audio creator did not write a non-empty file.",
				);
			}
			if (created.size > this.maxBytes) {
				throw new Error(
					"Normalized audio exceeds the analysis cache byte limit.",
				);
			}
			await this.promote(partPath, finalPath);
		} catch (error) {
			await removeIfPresent(partPath);
			throw error;
		} finally {
			this.activeParts.delete(partPath);
		}

		await this.cleanup(finalPath);
		return { path: finalPath, key, cacheHit: false };
	}

	private async createDiarizationOutput<Output>(
		key: string,
		create: () => Promise<Output>,
	): Promise<DiarizationCacheResult<Output>> {
		await this.cleanup();
		const finalPath = join(this.cacheDir, `${key}.json`);
		const cached = await this.readFreshJson<Output>(finalPath);
		if (cached.found) {
			return { output: cached.output, key, cacheHit: true };
		}

		const output = await create();
		const serialized = JSON.stringify(output);
		if (serialized === undefined) {
			throw new Error("Diarization output must be JSON serializable.");
		}
		const bytes = Buffer.byteLength(serialized);
		if (bytes > this.maxBytes) {
			throw new Error(
				"Diarization output exceeds the analysis cache byte limit.",
			);
		}

		const partPath = join(this.cacheDir, `${key}.${randomUUID()}.part`);
		this.activeParts.add(partPath);
		try {
			await writeFile(partPath, serialized, { encoding: "utf8", flag: "wx" });
			await this.promote(partPath, finalPath);
		} catch (error) {
			await removeIfPresent(partPath);
			throw error;
		} finally {
			this.activeParts.delete(partPath);
		}

		await this.cleanup(finalPath);
		return { output, key, cacheHit: false };
	}

	private async promote(partPath: string, finalPath: string) {
		try {
			await rename(partPath, finalPath);
		} catch (error) {
			// Another process may have won the same content-addressed write.
			if (await this.isFreshNonemptyFile(finalPath)) {
				await removeIfPresent(partPath);
				return;
			}
			throw error;
		}
	}

	private async isFreshNonemptyFile(filePath: string): Promise<boolean> {
		try {
			const entry = await stat(filePath);
			if (
				entry.isFile() &&
				entry.size > 0 &&
				Date.now() - entry.mtimeMs <= this.ttlMs
			) {
				return true;
			}
			await removeIfPresent(filePath);
			return false;
		} catch (error) {
			if (isMissing(error)) return false;
			throw error;
		}
	}

	private async readFreshJson<Output>(
		filePath: string,
	): Promise<{ found: true; output: Output } | { found: false }> {
		if (!(await this.isFreshNonemptyFile(filePath))) return { found: false };
		try {
			return {
				found: true,
				output: JSON.parse(await readFile(filePath, "utf8")) as Output,
			};
		} catch (error) {
			await removeIfPresent(filePath);
			if (isMissing(error) || error instanceof SyntaxError)
				return { found: false };
			throw error;
		}
	}

	private cleanup(protectedPath?: string): Promise<void> {
		const next = this.cleanupTail.then(() => this.runCleanup(protectedPath));
		this.cleanupTail = next.catch(() => undefined);
		return next;
	}

	private async runCleanup(protectedPath?: string) {
		await mkdir(this.cacheDir, { recursive: true });
		const names = await readdir(this.cacheDir);
		const files: CacheFile[] = [];
		const now = Date.now();

		for (const name of names) {
			const filePath = join(this.cacheDir, name);
			if (this.activeParts.has(filePath)) continue;
			try {
				const entry = await stat(filePath);
				if (!entry.isFile()) continue;
				if (now - entry.mtimeMs > this.ttlMs || entry.size === 0) {
					await removeIfPresent(filePath);
					continue;
				}
				files.push({
					path: filePath,
					size: entry.size,
					modifiedAt: entry.mtimeMs,
				});
			} catch (error) {
				if (!isMissing(error)) throw error;
			}
		}

		let totalBytes = files.reduce((total, file) => total + file.size, 0);
		files.sort((a, b) => a.modifiedAt - b.modifiedAt);
		for (const file of files) {
			if (totalBytes <= this.maxBytes) break;
			if (file.path === protectedPath) continue;
			await removeIfPresent(file.path);
			totalBytes -= file.size;
		}
	}
}

export function createAsrAnalysisCache(options?: AsrAnalysisCacheOptions) {
	return new AsrAnalysisCache(options);
}

export const asrAnalysisCache = createAsrAnalysisCache();

export const getOrCreateNormalizedAudio =
	asrAnalysisCache.getOrCreateNormalizedAudio.bind(asrAnalysisCache);

export const getOrCreateDiarizationOutput =
	asrAnalysisCache.getOrCreateDiarizationOutput.bind(asrAnalysisCache);
