import "server-only";

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getTtsProviderConfig } from "./tts-provider-config";
import { legacyTtsEngineRoot, ttsEngineDataRoot, ttsEngineModelsRoot, ttsEnginePython, ttsEngineRoot, ttsEngineSitePackages } from "./tts-engine-paths";

type Pending = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type OmniVoiceItem = {
	voiceId: string;
	name: string;
	gender: "male" | "female" | "unknown";
	description: string;
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
		fs.existsSync(path.join(candidate, "omnivoice_tts_worker.py")),
	);
	if (existing.length === 0) {
		throw new Error("Không tìm thấy omnivoice_tts_worker.py");
	}
	return (
		existing.find(
			(candidate) => path.basename(candidate).toLowerCase() === "lemyloi-dichvideo",
		) ?? existing[0]
	);
}

function workerScriptPath() {
	return path.join(workspaceRoot(), "omnivoice_tts_worker.py");
}

function pythonPath(root: string) {
	return ttsEnginePython(root, "omnivoice");
}

function hasNvidiaGpu() {
	try {
		const output = execFileSync(
			"nvidia-smi",
			["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
			{
				encoding: "utf8",
				timeout: 3_000,
				windowsHide: true,
			},
		);
		return output
			.trim()
			.split(/\r?\n/)
			.some((value) => Number(value.trim()) >= 4_096);
	} catch {
		return false;
	}
}

export function getOmniVoiceStatus() {
	const config = getTtsProviderConfig();
	let installed = false;
	try {
		installed = fs.existsSync(pythonPath(workspaceRoot()));
	} catch {
		installed = false;
	}
	const gpuAvailable = installed && hasNvidiaGpu();
	return {
		enabled: config.omnivoiceEnabled,
		gpuAvailable,
		installed,
		effectiveDevice: gpuAvailable ? ("gpu" as const) : ("cpu" as const),
	};
}

class OmniVoiceWorker {
	private child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private pending = new Map<string, Pending>();
	private alive = true;
	readonly scriptPath: string;
	readonly scriptMtime: number;

	constructor() {
		const root = workspaceRoot();
		const python = pythonPath(root);
		if (!fs.existsSync(python)) {
			throw new Error("OmniVoice chưa được cài trong .local-services/omnivoice/.venv");
		}
		this.scriptPath = workerScriptPath();
		this.scriptMtime = fs.statSync(this.scriptPath).mtimeMs;
		this.child = spawn(python, [this.scriptPath], {
			cwd: root,
			env: {
				...process.env,
				EDITKUB_TTS_ENGINE_ROOT: fs.existsSync(ttsEngineRoot(root, "omnivoice")) ? ttsEngineRoot(root, "omnivoice") : legacyTtsEngineRoot(root, "omnivoice"),
				HF_HOME: ttsEngineModelsRoot(root, "omnivoice"),
				HF_HUB_OFFLINE: "0",
				PYTHONPATH: ttsEngineSitePackages(root, "omnivoice"),
				PYTHONIOENCODING: "utf-8",
				PYTHONUTF8: "1",
			},
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
		this.child.on("error", (error) => this.rejectAll(error));
		this.child.on("exit", (code) => {
			this.alive = false;
			this.rejectAll(
				new Error(`OmniVoice worker đã dừng (mã ${code ?? "không rõ"}).`),
			);
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
		this.rejectAll(new Error("OmniVoice worker đang khởi động lại."));
		if (!this.child.killed) this.child.kill();
	}

	run(payload: Record<string, unknown>) {
		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const id = randomUUID();
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("OmniVoice xử lý quá thời gian cho phép."));
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
			try {
				decoded = JSON.parse(line);
			} catch {
				continue;
			}
			const parsedResult = z.record(z.string(), z.unknown()).safeParse(decoded);
			if (!parsedResult.success) continue;
			const parsed = parsedResult.data;
			if (typeof parsed.id !== "string") continue;
			const pending = this.pending.get(parsed.id);
			if (!pending) continue;
			clearTimeout(pending.timer);
			this.pending.delete(parsed.id);
			if (parsed.success !== true) {
				pending.reject(new Error(String(parsed.error || "OmniVoice thất bại")));
			} else {
				pending.resolve(parsed);
			}
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

const registry = globalThis as typeof globalThis & {
	__omnivoiceWorker?: OmniVoiceWorker;
};

function recycleWorker() {
	const current = registry.__omnivoiceWorker;
	if (current && typeof current.dispose === "function") {
		current.dispose();
	}
	registry.__omnivoiceWorker = new OmniVoiceWorker();
	return registry.__omnivoiceWorker;
}

function worker() {
	const current = registry.__omnivoiceWorker;
	const stale =
		!current ||
		typeof current.isAlive !== "function" ||
		!current.isAlive() ||
		typeof current.matchesScript !== "function" ||
		!current.matchesScript();
	if (stale) return recycleWorker();
	return current;
}

function requireEnabled() {
	const status = getOmniVoiceStatus();
	if (!status.enabled) {
		throw new Error("OmniVoice đang bị tắt trong Cấu hình TTS");
	}
	if (!status.installed) {
		throw new Error("OmniVoice chưa được cài trên máy");
	}
	if (!status.gpuAvailable) {
		throw new Error("OmniVoice cần NVIDIA GPU ≥ 4 GB");
	}
}

const catalogVoiceSchema = z.object({
	voiceId: z.string(),
	name: z.string(),
	gender: z.enum(["male", "female", "unknown"]).or(z.string()),
	description: z.string().optional(),
	cloned: z.boolean().optional(),
});

export function listOmniVoices(): OmniVoiceItem[] {
	const file = path.join(
		ttsEngineDataRoot(workspaceRoot(), "omnivoice"),
		"voices.json",
	);
	const designs: OmniVoiceItem[] = [
		{
			voiceId: "nu_tre",
			name: "Omni Nữ Trẻ",
			gender: "female",
			description: "Giọng nữ trẻ, tự nhiên",
			cloned: false,
		},
		{
			voiceId: "nu_tram",
			name: "Omni Nữ Trầm",
			gender: "female",
			description: "Giọng nữ trầm, ấm",
			cloned: false,
		},
		{
			voiceId: "nu_thi_tham",
			name: "Omni Nữ Thì Thầm",
			gender: "female",
			description: "Giọng nữ thì thầm",
			cloned: false,
		},
		{
			voiceId: "nam_tram",
			name: "Omni Nam Trầm",
			gender: "male",
			description: "Giọng nam trầm",
			cloned: false,
		},
		{
			voiceId: "nam_tre",
			name: "Omni Nam Trẻ",
			gender: "male",
			description: "Giọng nam trẻ",
			cloned: false,
		},
		{
			voiceId: "thieu_nien",
			name: "Omni Thiếu Niên",
			gender: "male",
			description: "Giọng thiếu niên",
			cloned: false,
		},
	];
	if (!fs.existsSync(file)) return designs;
	try {
		const decoded: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		const data = z
			.object({
				voices: z.array(z.record(z.string(), z.unknown())).optional(),
			})
			.parse(decoded);
		const cloned = (data.voices ?? [])
			.map((voice) => catalogVoiceSchema.safeParse(voice))
			.filter((result) => result.success)
			.map((result) => ({
				voiceId: result.data.voiceId,
				name: result.data.name,
				gender: (result.data.gender === "male" ||
				result.data.gender === "female"
					? result.data.gender
					: "unknown") as "unknown" | "male" | "female",
				description: result.data.description || "Giọng clone OmniVoice",
				cloned: true,
			}));
		return [...designs, ...cloned];
	} catch {
		return designs;
	}
}

export async function synthesizeOmniVoice({
	text,
	voice,
}: {
	text: string;
	voice: string;
}) {
	requireEnabled();
	const result = await worker().run({ command: "synthesize", text, voice });
	if (typeof result.audioPath !== "string") {
		throw new Error("OmniVoice không trả về file âm thanh");
	}
	return result.audioPath;
}

export async function previewCloneOmniVoice({
	audioPath,
	text,
}: {
	audioPath: string;
	text?: string;
}) {
	requireEnabled();
	const result = await worker().run({
		command: "preview_clone",
		audioPath,
		...(text ? { text } : {}),
	});
	if (typeof result.audioPath !== "string") {
		throw new Error("OmniVoice không trả về file nghe thử");
	}
	return result.audioPath;
}

export async function cloneOmniVoice({
	name,
	audioPath,
}: {
	name: string;
	audioPath: string;
}) {
	requireEnabled();
	return worker().run({ command: "clone", name, audioPath });
}

export async function deleteOmniVoice({ name }: { name: string }) {
	requireEnabled();
	return worker().run({ command: "delete_clone", name });
}
