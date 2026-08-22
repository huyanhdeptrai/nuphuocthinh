import "server-only";

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyCudaOverlay } from "./cuda-overlay";
import { concatFiles } from "./file-concat";
import { gpuManifestUrl } from "./gpu-manifest-url";
import { componentsRoot as resolveComponentsRoot } from "./runtime-paths";

export type GpuManifestPart = {
	name: string;
	url: string;
	sha256: string;
	size: number;
};

export type GpuManifest = {
	id: string;
	version: string;
	minVramMb: number;
	size: number;
	sha256: string;
	parts: GpuManifestPart[];
};

export type GpuJobState =
	| "idle"
	| "downloading"
	| "verifying"
	| "extracting"
	| "done"
	| "error";

export type GpuJob = {
	state: GpuJobState;
	received: number;
	total: number;
	version?: string;
	error?: string;
};

export type GpuRuntimeStatus = {
	gpuAvailable: boolean;
	gpuName: string | null;
	vramMb: number | null;
	sourceConfigured: boolean;
	manifest: { version: string; size: number; partCount: number } | null;
	localCuda: boolean;
	packInstalled: boolean;
	installedVersion: string | null;
	ready: boolean;
	job: GpuJob | null;
};

type Probe = {
	gpuAvailable: boolean;
	gpuName: string | null;
	vramMb: number | null;
};

const USER_AGENT = "Lemyloi-dichvideo-GPU-Runtime";
let cachedProbe: { at: number; value: Probe } | null = null;
let cachedManifest: { at: number; url: string; value: GpuManifest | null; error?: string } | null = null;
let job: GpuJob | null = null;
let running = false;

function workspaceRoot() {
	const cwd = process.cwd();
	const candidates = [
		path.resolve(cwd, "lemyloi-dichvideo"),
		path.resolve(cwd, "..", ".."),
		cwd,
	];
	return (
		candidates.find((candidate) =>
			fs.existsSync(path.join(candidate, "apps", "web")),
		) ?? cwd
	);
}

function componentsRoot() {
	return resolveComponentsRoot({ developmentRoot: workspaceRoot() });
}

function currentMarkerPath() {
	return path.join(componentsRoot(), "runtime-ml-cuda", "current.json");
}

function localTorchCudaDll() {
	const root = workspaceRoot();
	return [
		path.join(root, ".venv-diarization", "Lib", "site-packages", "torch", "lib", "torch_cuda.dll"),
		path.join(path.dirname(root), ".venv-diarization", "Lib", "site-packages", "torch", "lib", "torch_cuda.dll"),
	].find((candidate) => fs.existsSync(candidate));
}

export { gpuManifestUrl } from "./gpu-manifest-url";

function probeGpu(): Probe {
	const now = Date.now();
	if (cachedProbe && now - cachedProbe.at < 30_000) return cachedProbe.value;
	const empty: Probe = { gpuAvailable: false, gpuName: null, vramMb: null };
	try {
		const output = execFileSync(
			"nvidia-smi",
			["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
			{ encoding: "utf8", timeout: 3_000, windowsHide: true },
		);
		const lines = output
			.trim()
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		let best: Probe = empty;
		for (const line of lines) {
			const split = line.split(",");
			const name = split[0]?.trim() || null;
			const vramMb = Number(split[1]?.trim());
			if (!Number.isFinite(vramMb)) continue;
			if (!best.gpuAvailable || vramMb > (best.vramMb ?? 0)) {
				best = {
					gpuAvailable: vramMb >= 4096,
					gpuName: name,
					vramMb,
				};
			}
		}
		cachedProbe = { at: now, value: best };
		return best;
	} catch {
		cachedProbe = { at: now, value: empty };
		return empty;
	}
}

function readInstalledVersion() {
	const marker = currentMarkerPath();
	if (!fs.existsSync(marker)) return null;
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(marker, "utf8"));
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"version" in parsed &&
			typeof parsed.version === "string"
		) {
			return parsed.version;
		}
	} catch {
		return null;
	}
	return null;
}

async function fetchManifest(): Promise<GpuManifest | null> {
	const url = gpuManifestUrl();
	if (!url) return null;
	const now = Date.now();
	if (cachedManifest && cachedManifest.url === url && now - cachedManifest.at < 60_000) {
		return cachedManifest.value;
	}
	try {
		const response = await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
			cache: "no-store",
			redirect: "follow",
			signal: AbortSignal.timeout(20_000),
		});
		if (!response.ok) {
			cachedManifest = { at: now, url, value: null, error: `HTTP ${response.status}` };
			return null;
		}
		const parsed: unknown = await response.json();
		if (!isManifest(parsed)) {
			cachedManifest = { at: now, url, value: null, error: "manifest không hợp lệ" };
			return null;
		}
		cachedManifest = { at: now, url, value: parsed };
		return parsed;
	} catch {
		cachedManifest = { at: now, url, value: null, error: "không tải được manifest" };
		return null;
	}
}

function isManifest(value: unknown): value is GpuManifest {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.version === "string" &&
		typeof record.minVramMb === "number" &&
		typeof record.size === "number" &&
		typeof record.sha256 === "string" &&
		Array.isArray(record.parts) &&
		record.parts.every((part) => {
			if (typeof part !== "object" || part === null) return false;
			const item = part as Record<string, unknown>;
			return (
				typeof item.name === "string" &&
				typeof item.url === "string" &&
				typeof item.sha256 === "string" &&
				typeof item.size === "number"
			);
		})
	);
}

export async function getGpuRuntimeStatus(): Promise<GpuRuntimeStatus> {
	const probe = probeGpu();
	const manifest = await fetchManifest();
	const localCuda = Boolean(localTorchCudaDll());
	const installedVersion = readInstalledVersion();
	const packInstalled = Boolean(installedVersion);
	return {
		gpuAvailable: probe.gpuAvailable,
		gpuName: probe.gpuName,
		vramMb: probe.vramMb,
		sourceConfigured: Boolean(gpuManifestUrl()),
		manifest: manifest
			? {
					version: manifest.version,
					size: manifest.size,
					partCount: manifest.parts.length,
				}
			: null,
		localCuda,
		packInstalled,
		installedVersion,
		ready: localCuda || packInstalled,
		job,
	};
}

export async function startGpuRuntimeInstall() {
	const status = await getGpuRuntimeStatus();
	if (status.ready) {
		return status;
	}
	if (!status.gpuAvailable) {
		throw new Error("Máy không có NVIDIA GPU ≥ 4 GB. Không tải gói CUDA.");
	}
	if (!status.sourceConfigured) {
		throw new Error("Chưa xác định được nguồn tải gói CUDA.");
	}
	if (!status.manifest) {
		throw new Error(
			cachedManifest?.error
				? `Không đọc được manifest GPU: ${cachedManifest.error}`
				: "Không đọc được manifest GPU từ GitHub.",
		);
	}
	if (running) return getGpuRuntimeStatus();
	running = true;
	const manifest = await fetchManifest();
	if (!manifest) {
		running = false;
		throw new Error("Không đọc được manifest GPU từ GitHub.");
	}
	job = {
		state: "downloading",
		received: 0,
		total: manifest.size,
		version: manifest.version,
	};
	void runInstall(manifest).catch((error) => {
		job = {
			state: "error",
			received: job?.received ?? 0,
			total: manifest.size,
			version: manifest.version,
			error: error instanceof Error ? error.message : String(error),
		};
	}).finally(() => {
		running = false;
	});
	return getGpuRuntimeStatus();
}

async function runInstall(manifest: GpuManifest) {
	const destRoot = path.join(componentsRoot(), "runtime-ml-cuda", manifest.version);
	const downloadDir = path.join(componentsRoot(), "runtime-ml-cuda", "downloads", manifest.version);
	fs.mkdirSync(downloadDir, { recursive: true });
	fs.mkdirSync(destRoot, { recursive: true });

	const partPaths: string[] = [];
	let received = 0;
	for (const part of manifest.parts) {
		const partPath = path.join(downloadDir, part.name);
		await downloadPart(part, partPath, (delta) => {
			received += delta;
			job = {
				state: "downloading",
				received,
				total: manifest.size,
				version: manifest.version,
			};
		});
		job = { state: "verifying", received, total: manifest.size, version: manifest.version };
		const actual = await hashFile(partPath);
		if (actual !== part.sha256.toLowerCase()) {
			throw new Error(`Sai checksum phần ${part.name}. Tải lại từ GitHub.`);
		}
		partPaths.push(partPath);
	}

	const zipPath = path.join(downloadDir, `runtime-ml-cuda-${manifest.version}.zip`);
	if (partPaths.length === 1) {
		if (path.resolve(partPaths[0]) !== path.resolve(zipPath)) {
			fs.copyFileSync(partPaths[0], zipPath);
		}
	} else {
		await concatFiles(partPaths, zipPath);
	}

	job = { state: "verifying", received: manifest.size, total: manifest.size, version: manifest.version };
	const zipHash = await hashFile(zipPath);
	if (zipHash !== manifest.sha256.toLowerCase()) {
		throw new Error("Sai checksum gói GPU sau khi ghép file.");
	}

	job = { state: "extracting", received: manifest.size, total: manifest.size, version: manifest.version };
	await extractZip(zipPath, destRoot);
	applyCudaOverlay(destRoot, workspaceRoot());

	fs.writeFileSync(
		currentMarkerPath(),
		`${JSON.stringify({ version: manifest.version, installedAt: new Date().toISOString() }, null, 2)}\n`,
		"utf8",
	);
	job = {
		state: "done",
		received: manifest.size,
		total: manifest.size,
		version: manifest.version,
	};
}

async function downloadPart(
	part: GpuManifestPart,
	dest: string,
	onBytes: (delta: number) => void,
) {
	const existing = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
	if (existing === part.size) {
		onBytes(existing);
		return;
	}
	if (existing > part.size) {
		fs.rmSync(dest, { force: true });
	}
	const start = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
	const headers: Record<string, string> = { "User-Agent": USER_AGENT };
	if (start > 0) headers.Range = `bytes=${start}-`;
	const response = await fetch(part.url, { headers, redirect: "follow" });
	if (!response.ok || !response.body) {
		throw new Error(`Không tải được ${part.name} từ GitHub (HTTP ${response.status}).`);
	}
	const resume = start > 0 && response.status === 206;
	if (resume) onBytes(start);
	else if (start > 0) fs.rmSync(dest, { force: true });
	const file = fs.createWriteStream(dest, { flags: resume ? "a" : "w" });
	try {
		for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
			file.write(Buffer.from(chunk));
			onBytes(chunk.byteLength);
		}
	} finally {
		await new Promise<void>((resolve, reject) => {
			file.end((error: Error | null | undefined) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}
	const finalSize = fs.statSync(dest).size;
	if (finalSize !== part.size) {
		throw new Error(`${part.name} tải chưa đủ (${finalSize}/${part.size} byte).`);
	}
}

async function hashFile(filePath: string) {
	const hash = createHash("sha256");
	const stream = fs.createReadStream(filePath);
	for await (const chunk of stream) hash.update(chunk);
	return hash.digest("hex");
}

function extractZip(zipPath: string, dest: string) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn("tar", ["-xf", zipPath, "-C", dest], {
			windowsHide: true,
			stdio: "ignore",
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Giải nén gói GPU thất bại (mã ${code ?? "không rõ"}).`));
		});
	});
}
