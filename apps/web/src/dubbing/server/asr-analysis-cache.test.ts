import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));

const { createAsrAnalysisCache } = await import("./asr-analysis-cache");

const testDirectories: string[] = [];

async function makeCache(options: { ttlMs?: number; maxBytes?: number } = {}) {
	const cacheDir = await mkdtemp(join(tmpdir(), "lemyloi-dichvideo-cache-test-"));
	testDirectories.push(cacheDir);
	return createAsrAnalysisCache({ cacheDir, ...options });
}

afterEach(async () => {
	await Promise.all(
		testDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("AsrAnalysisCache", () => {
	test("persists normalized audio misses and hits", async () => {
		const cache = await makeCache();
		let creates = 0;
		const options = {
			input: Buffer.from("source audio"),
			profile: "speech-16khz-mono",
			version: "ffmpeg-v1",
			create: async (partPath: string) => {
				creates += 1;
				await writeFile(partPath, "normalized wav");
			},
		};

		const miss = await cache.getOrCreateNormalizedAudio(options);
		const hit = await cache.getOrCreateNormalizedAudio(options);

		expect(miss.cacheHit).toBe(false);
		expect(hit.cacheHit).toBe(true);
		expect(hit.key).toBe(miss.key);
		expect(hit.path).toBe(miss.path);
		expect(await readFile(hit.path, "utf8")).toBe("normalized wav");
		expect(creates).toBe(1);
	});

	test("invalidates keys when profiles or diarization inputs change", async () => {
		const cache = await makeCache();
		const normalized = (profile: string, version: string) =>
			cache.getOrCreateNormalizedAudio({
				input: Buffer.from("same input"),
				profile,
				version,
				create: (partPath) => writeFile(partPath, `${profile}:${version}`),
			});

		const first = await normalized("profile-a", "v1");
		const profileChanged = await normalized("profile-b", "v1");
		const versionChanged = await normalized("profile-a", "v2");
		expect(
			new Set([first.key, profileChanged.key, versionChanged.key]).size,
		).toBe(3);

		const diarize = (speakerCount: string, modelFingerprint: string) =>
			cache.getOrCreateDiarizationOutput({
				normalizedKey: first.key,
				speakerCount,
				modelFingerprint,
				version: "pipeline-v1",
				create: async () => ({ segments: [] }),
			});
		const diarization = await diarize("auto", "model-a");
		const speakersChanged = await diarize("2", "model-a");
		const modelChanged = await diarize("auto", "model-b");
		expect(
			new Set([diarization.key, speakersChanged.key, modelChanged.key]).size,
		).toBe(3);
	});

	test("expires persistent entries after the TTL", async () => {
		const cache = await makeCache({ ttlMs: 100 });
		let creates = 0;
		const options = {
			input: Buffer.from("expiring input"),
			profile: "profile",
			version: "v1",
			create: async (partPath: string) => {
				creates += 1;
				await writeFile(partPath, `audio-${creates}`);
			},
		};
		const first = await cache.getOrCreateNormalizedAudio(options);
		const old = new Date(Date.now() - 1_000);
		await utimes(first.path, old, old);

		const expired = await cache.getOrCreateNormalizedAudio(options);
		expect(expired.cacheHit).toBe(false);
		expect(creates).toBe(2);
		expect(await readFile(expired.path, "utf8")).toBe("audio-2");
	});

	test("deduplicates concurrent normalized audio creation", async () => {
		const cache = await makeCache();
		let creates = 0;
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const creationStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const options = {
			input: Buffer.from("concurrent input"),
			profile: "profile",
			version: "v1",
			create: async (partPath: string) => {
				creates += 1;
				started();
				await gate;
				await writeFile(partPath, "audio");
			},
		};

		const first = cache.getOrCreateNormalizedAudio(options);
		await creationStarted;
		const second = cache.getOrCreateNormalizedAudio(options);
		release();
		const [firstResult, secondResult] = await Promise.all([first, second]);

		expect(creates).toBe(1);
		expect(secondResult).toEqual(firstResult);
	});

	test("does not cache creator failures", async () => {
		const cache = await makeCache();
		const base = {
			normalizedKey: "normalized-key",
			speakerCount: "auto",
			modelFingerprint: "model",
			version: "v1",
		};

		expect(
			cache.getOrCreateDiarizationOutput({
				...base,
				create: async () => {
					throw new Error("worker failed");
				},
			}),
		).rejects.toThrow("worker failed");

		const recovered = await cache.getOrCreateDiarizationOutput({
			...base,
			create: async () => ({ success: true, segments: [] }),
		});
		expect(recovered.cacheHit).toBe(false);
		expect(recovered.output).toEqual({ success: true, segments: [] });
	});

	test("evicts older entries to enforce maxBytes", async () => {
		const cache = await makeCache({ maxBytes: 12 });
		const create = (input: string) =>
			cache.getOrCreateNormalizedAudio({
				input: Buffer.from(input),
				profile: "profile",
				version: "v1",
				create: (partPath) => writeFile(partPath, "12345678"),
			});

		const older = await create("older");
		const newer = await create("newer");
		expect(await Bun.file(older.path).exists()).toBe(false);
		expect(await Bun.file(newer.path).exists()).toBe(true);
	});
});
