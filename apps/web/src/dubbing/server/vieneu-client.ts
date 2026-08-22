import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { legacyTtsEngineRoot, ttsEngineDataRoot, ttsEngineModelsRoot, ttsEnginePython, ttsEngineRoot, ttsEngineSitePackages } from "./tts-engine-paths";

type Pending = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type VieNeuVoice = {
	name: string;
	description: string;
	gender: "male" | "female" | "unknown";
	region: string;
	style: string;
	cloned: boolean;
};

function workspaceRoot() {
	const cwd = process.cwd();
	const candidates = [
		path.resolve(cwd, "lemyloi-dichvideo"),
		path.resolve(cwd, "..", ".."),
		cwd,
	];
	const existing = candidates.filter((candidate) =>
		fs.existsSync(path.join(candidate, "vieneu_tts_worker.py")),
	);
	if (existing.length === 0) {
		throw new Error("Không tìm thấy vieneu_tts_worker.py");
	}
	return (
		existing.find(
			(candidate) => path.basename(candidate).toLowerCase() === "lemyloi-dichvideo",
		) ?? existing[0]
	);
}

function workerScriptPath() {
	return path.join(workspaceRoot(), "vieneu_tts_worker.py");
}

function pythonPath(root: string) {
	const local = ttsEnginePython(root, "vieneu");
	if (!fs.existsSync(local)) throw new Error("VieNeu chưa được cài trong .local-services/vieneu/.venv");
	return local;
}

class VieNeuWorker {
	private child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private pending = new Map<string, Pending>();
	private alive = true;
	readonly scriptPath: string;
	readonly scriptMtime: number;

	constructor() {
		const root = workspaceRoot();
		this.scriptPath = workerScriptPath();
		this.scriptMtime = fs.statSync(this.scriptPath).mtimeMs;
		this.child = spawn(pythonPath(root), [this.scriptPath], {
			cwd: root,
			env: { ...process.env, EDITKUB_TTS_ENGINE_ROOT: fs.existsSync(ttsEngineRoot(root, "vieneu")) ? ttsEngineRoot(root, "vieneu") : legacyTtsEngineRoot(root, "vieneu"), HF_HOME: ttsEngineModelsRoot(root, "vieneu"), HF_HUB_OFFLINE: "0", PYTHONPATH: ttsEngineSitePackages(root, "vieneu"), PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
		this.child.on("error", (error) => this.rejectAll(error));
		this.child.on("exit", (code) => {
			this.alive = false;
			this.rejectAll(new Error(`VieNeu worker đã dừng (mã ${code ?? "không rõ"}).`));
		});
	}

	isAlive() {
		return this.alive;
	}

	matchesScript() {
		if (!fs.existsSync(this.scriptPath)) return false;
		return this.scriptMtime === fs.statSync(this.scriptPath).mtimeMs;
	}

	dispose() {
		this.alive = false;
		this.rejectAll(new Error("VieNeu worker đang khởi động lại."));
		if (!this.child.killed) this.child.kill();
	}

	run(payload: Record<string, unknown>) {
		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const id = randomUUID();
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("VieNeu xử lý quá thời gian cho phép."));
			}, 20 * 60 * 1000);
			this.pending.set(id, { resolve, reject, timer });
			this.child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
		});
	}

	private onData(chunk: string) {
		this.buffer += chunk;
		const lines = this.buffer.split(/\r?\n/);
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			let decoded: unknown;
			try { decoded = JSON.parse(line); } catch { continue; }
			const parsedResult = z.record(z.string(), z.unknown()).safeParse(decoded);
			if (!parsedResult.success) continue;
			const parsed = parsedResult.data;
			if (typeof parsed.id !== "string") continue;
			const pending = this.pending.get(parsed.id);
			if (!pending) continue;
			clearTimeout(pending.timer);
			this.pending.delete(parsed.id);
			if (parsed.success !== true) pending.reject(new Error(String(parsed.error || "VieNeu thất bại")));
			else pending.resolve(parsed);
		}
	}

	private rejectAll(error: Error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

const registry = globalThis as typeof globalThis & { __vieneuWorker?: VieNeuWorker };

function recycleWorker() {
	const current = registry.__vieneuWorker;
	if (current && typeof current.dispose === "function") {
		current.dispose();
	}
	registry.__vieneuWorker = new VieNeuWorker();
	return registry.__vieneuWorker;
}

function worker() {
	const current = registry.__vieneuWorker;
	const stale =
		!current ||
		typeof current.isAlive !== "function" ||
		!current.isAlive() ||
		typeof current.matchesScript !== "function" ||
		!current.matchesScript();
	if (stale) return recycleWorker();
	return current;
}

function isUnknownCommand(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("không hợp lệ");
}

export function listVieNeuVoices(): VieNeuVoice[] {
	const root = workspaceRoot();
	const packageAssets = path.join(ttsEngineSitePackages(root, "vieneu"), "vieneu", "assets", "voices_v3_turbo.json");
	const customAssets = path.join(ttsEngineDataRoot(root, "vieneu"), "custom-voices.json");
	const customV2Assets = path.join(ttsEngineDataRoot(root, "vieneu"), "custom-voices-v2.json");
	const read = ({
		file,
		cloned,
		fallbackDescription,
	}: {
		file: string;
		cloned: boolean;
		fallbackDescription: string;
	}): VieNeuVoice[] => {
		if (!fs.existsSync(file)) return [];
		const decoded: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		const data = z.object({ presets: z.record(z.string(), z.record(z.string(), z.unknown())).optional() }).parse(decoded);
		return Object.entries(data.presets ?? {}).map(([name, voice]) => ({
			name,
			description: String(voice.description || fallbackDescription),
			gender: voice.gender === "male" || voice.gender === "female" ? voice.gender : "unknown",
			region: String(voice.region || (cloned ? "Tuỳ chỉnh" : "Việt Nam")),
			style: String(voice.style || "tu_nhien"),
			cloned,
		}));
	};
	return [
		...read({
			file: packageAssets,
			cloned: false,
			fallbackDescription: "VieNeu preset",
		}),
		...read({
			file: customAssets,
			cloned: true,
			fallbackDescription: "Giọng clone VieNeu v3",
		}),
		...read({
			file: customV2Assets,
			cloned: true,
			fallbackDescription: "Giọng clone VieNeu v2",
		}),
	];
}

export async function synthesizeVieNeuVoice({ text, voice }: { text: string; voice: string }) {
	const result = await worker().run({ command: "synthesize", text, voice });
	if (typeof result.audioPath !== "string") throw new Error("VieNeu không trả về file âm thanh");
	return result.audioPath;
}

export type VieNeuCloneEngine = "v2" | "v3";

function cloneEngine(engine?: VieNeuCloneEngine) {
	return engine === "v3" ? "v3" : "v2";
}

async function runPreviewClone({
	audioPath,
	text,
	engine,
}: {
	audioPath: string;
	text?: string;
	engine?: VieNeuCloneEngine;
}) {
	const result = await worker().run({
		command: "preview_clone",
		audioPath,
		engine: cloneEngine(engine),
		...(text ? { text } : {}),
	});
	if (typeof result.audioPath !== "string") {
		throw new Error("VieNeu không trả về file nghe thử");
	}
	return result.audioPath;
}

async function previewViaTempClone({
	audioPath,
	text,
	engine,
}: {
	audioPath: string;
	text?: string;
	engine?: VieNeuCloneEngine;
}) {
	const name = `__preview_${randomUUID()}`;
	try {
		await worker().run({
			command: "clone",
			name,
			audioPath,
			engine: cloneEngine(engine),
		});
		const result = await worker().run({
			command: "synthesize",
			text: text || "Xin chào, đây là giọng đọc thử cho phần thuyết minh.",
			voice: name,
		});
		if (typeof result.audioPath !== "string") {
			throw new Error("VieNeu không trả về file nghe thử");
		}
		return result.audioPath;
	} finally {
		try {
			await worker().run({ command: "delete_clone", name });
		} catch {
			// Preview must not fail just because cleanup of the temp voice failed.
		}
	}
}

export async function previewCloneVieNeuVoice({
	audioPath,
	text,
	engine,
}: {
	audioPath: string;
	text?: string;
	engine?: VieNeuCloneEngine;
}) {
	try {
		return await runPreviewClone({ audioPath, text, engine });
	} catch (error) {
		if (!isUnknownCommand(error)) throw error;
		recycleWorker();
		try {
			return await runPreviewClone({ audioPath, text, engine });
		} catch (retryError) {
			if (!isUnknownCommand(retryError)) throw retryError;
			return previewViaTempClone({ audioPath, text, engine });
		}
	}
}

export async function cloneVieNeuVoice({
	name,
	audioPath,
	engine,
}: {
	name: string;
	audioPath: string;
	engine?: VieNeuCloneEngine;
}) {
	return worker().run({
		command: "clone",
		name,
		audioPath,
		engine: cloneEngine(engine),
	});
}

export async function deleteVieNeuVoice({ name }: { name: string }) {
	return worker().run({ command: "delete_clone", name });
}
