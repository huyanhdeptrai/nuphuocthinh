import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ttsEngineRoot, type TtsEngineId } from "./tts-engine-paths";
import { removeCompletedDownloadArtifacts } from "./download-artifacts";

const USER_AGENT = "Lemyloi-dichvideo-TTS-Engines";
const ENGINES: TtsEngineId[] = ["vieneu", "supertonic", "omnivoice"];
const DEFAULT_URLS: Record<TtsEngineId, string> = {
	vieneu: "https://github.com/Lexombien/editkub-gpu-runtime/releases/download/tts-vieneu-1.0.1/vieneu-manifest.json",
	supertonic: "https://github.com/Lexombien/editkub-gpu-runtime/releases/download/tts-supertonic-1.0.0/supertonic-manifest.json",
	omnivoice: "https://github.com/Lexombien/editkub-gpu-runtime/releases/download/tts-omnivoice-1.0.0/omnivoice-manifest.json",
};

export type TtsEngineManifest = { id: string; engine: TtsEngineId; version: string; size: number; sha256: string; parts: { name: string; url: string; sha256: string; size: number }[] };
export type TtsEngineJob = { state: "downloading" | "verifying" | "extracting" | "done" | "error"; received: number; total: number; version?: string; error?: string };
export type TtsEngineStatus = { engine: TtsEngineId; installed: boolean; installedVersion: string | null; manifest: { version: string; size: number; partCount: number } | null; job: TtsEngineJob | null };

function workspaceRoot() {
	const cwd = process.cwd();
	return [path.resolve(cwd, "lemyloi-dichvideo"), path.resolve(cwd, "..", ".."), cwd].find((candidate) => fs.existsSync(path.join(candidate, "apps", "web"))) ?? cwd;
}
function urlFor(engine: TtsEngineId) {
	return process.env[`EDITKUB_TTS_${engine.toUpperCase()}_MANIFEST_URL`]?.trim() || DEFAULT_URLS[engine];
}
const jobs = new Map<TtsEngineId, TtsEngineJob>();
const running = new Set<TtsEngineId>();

function marker(engine: TtsEngineId) { return path.join(ttsEngineRoot(workspaceRoot(), engine), "current.json"); }
function installedVersion(engine: TtsEngineId) {
	try { const value = JSON.parse(fs.readFileSync(marker(engine), "utf8")); return typeof value.version === "string" ? value.version : null; } catch { return null; }
}
function validManifest(value: unknown): value is TtsEngineManifest {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return typeof item.id === "string" && typeof item.engine === "string" && ENGINES.includes(item.engine as TtsEngineId) && typeof item.version === "string" && typeof item.size === "number" && typeof item.sha256 === "string" && Array.isArray(item.parts) && item.parts.every((part) => { const p = part as Record<string, unknown>; return p && typeof p.name === "string" && typeof p.url === "string" && typeof p.sha256 === "string" && typeof p.size === "number"; });
}
async function fetchManifest(engine: TtsEngineId) {
	const response = await fetch(urlFor(engine), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
	if (!response.ok) throw new Error(`Không đọc được manifest ${engine} (HTTP ${response.status}).`);
	const parsed: unknown = await response.json();
	if (!validManifest(parsed) || parsed.engine !== engine) throw new Error(`Manifest ${engine} không hợp lệ.`);
	return parsed;
}
export async function getTtsEngineStatuses(): Promise<TtsEngineStatus[]> {
	return Promise.all(ENGINES.map(async (engine) => { const version = installedVersion(engine); if (version) removeCompletedDownloadArtifacts(path.join(ttsEngineRoot(workspaceRoot(), engine), "downloads", version)); let manifest: TtsEngineManifest | null = null; try { manifest = await fetchManifest(engine); } catch { /* offline status is still useful */ } return { engine, installed: Boolean(version), installedVersion: version, manifest: manifest ? { version: manifest.version, size: manifest.size, partCount: manifest.parts.length } : null, job: jobs.get(engine) ?? null }; }));
}
export async function installTtsEngine(engine: TtsEngineId) {
	if (running.has(engine)) return getTtsEngineStatuses();
	const manifest = await fetchManifest(engine);
	running.add(engine);
	jobs.set(engine, { state: "downloading", received: 0, total: manifest.size, version: manifest.version });
	void runInstall(engine, manifest).catch((error) => jobs.set(engine, { state: "error", received: jobs.get(engine)?.received ?? 0, total: manifest.size, version: manifest.version, error: error instanceof Error ? error.message : String(error) })).finally(() => running.delete(engine));
	return getTtsEngineStatuses();
}
export async function removeTtsEngine(engine: TtsEngineId) {
	if (running.has(engine)) throw new Error(`${engine} đang cài đặt.`);
	const root = ttsEngineRoot(workspaceRoot(), engine);
	if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
	jobs.delete(engine);
	return getTtsEngineStatuses();
}
async function runInstall(engine: TtsEngineId, manifest: TtsEngineManifest) {
	const root = ttsEngineRoot(workspaceRoot(), engine); const downloads = path.join(root, "downloads", manifest.version); fs.mkdirSync(downloads, { recursive: true });
	const paths: string[] = []; let received = 0;
	for (const part of manifest.parts) { const dest = path.join(downloads, part.name); await download(part, dest, (delta) => { received += delta; jobs.set(engine, { state: "downloading", received, total: manifest.size, version: manifest.version }); }); const actual = await hash(dest); if (actual !== part.sha256.toLowerCase()) throw new Error(`Sai checksum phần ${part.name}.`); paths.push(dest); }
	const zip = path.join(downloads, `${engine}-${manifest.version}.zip`); if (paths.length === 1) fs.copyFileSync(paths[0], zip); else { const { concatFiles } = await import("./file-concat"); await concatFiles(paths, zip); }
	if (await hash(zip) !== manifest.sha256.toLowerCase()) throw new Error(`Sai checksum gói ${engine}.`);
	jobs.set(engine, { state: "extracting", received: manifest.size, total: manifest.size, version: manifest.version });
	const staging = path.join(root, "staging"); if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); fs.mkdirSync(staging, { recursive: true }); await extract(zip, staging);
	const extractedRoot = path.join(staging, `tts-${engine}`);
	const sourceRoot = fs.existsSync(extractedRoot) ? extractedRoot : staging;
	for (const entry of fs.readdirSync(sourceRoot)) fs.renameSync(path.join(sourceRoot, entry), path.join(root, entry)); fs.rmSync(staging, { recursive: true, force: true });
	fs.writeFileSync(marker(engine), `${JSON.stringify({ engine, version: manifest.version, installedAt: new Date().toISOString() }, null, 2)}\n`);
	removeCompletedDownloadArtifacts(downloads);
	jobs.set(engine, { state: "done", received: manifest.size, total: manifest.size, version: manifest.version });
}
async function download(part: TtsEngineManifest["parts"][number], dest: string, onBytes: (delta: number) => void) { if (fs.existsSync(dest) && fs.statSync(dest).size === part.size) { onBytes(part.size); return; } if (fs.existsSync(dest)) fs.rmSync(dest, { force: true }); const response = await fetch(part.url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" }); if (!response.ok || !response.body) throw new Error(`Không tải được ${part.name} (HTTP ${response.status}).`); const file = fs.createWriteStream(dest); for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) { file.write(Buffer.from(chunk)); onBytes(chunk.byteLength); } await new Promise<void>((resolve, reject) => file.end((error: Error | null) => error ? reject(error) : resolve())); if (fs.statSync(dest).size !== part.size) throw new Error(`Tải chưa đủ ${part.name}.`); }
async function hash(filePath: string) { const h = createHash("sha256"); for await (const chunk of fs.createReadStream(filePath)) h.update(chunk); return h.digest("hex"); }
function extract(zip: string, dest: string) { return new Promise<void>((resolve, reject) => { const child = spawn("tar", ["-xf", zip, "-C", dest], { windowsHide: true, stdio: "ignore" }); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Giải nén gói ${path.basename(zip)} thất bại.`))); }); }
