import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { legacyTtsEngineRoot, ttsEngineModelsRoot, ttsEnginePython, ttsEngineRoot, ttsEngineSitePackages } from "./tts-engine-paths";

type Pending = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type SupertonicVoice = {
	voiceId: string;
	name: string;
	gender: "male" | "female";
	description: string;
};

const VOICES: SupertonicVoice[] = [
	...Array.from({ length: 5 }, (_, index) => ({
		voiceId: `F${index + 1}`,
		name: `Supertonic Nữ ${index + 1}`,
		gender: "female" as const,
		description: `Giọng nữ F${index + 1} · Supertonic 3 ONNX chạy CPU`,
	})),
	...Array.from({ length: 5 }, (_, index) => ({
		voiceId: `M${index + 1}`,
		name: `Supertonic Nam ${index + 1}`,
		gender: "male" as const,
		description: `Giọng nam M${index + 1} · Supertonic 3 ONNX chạy CPU`,
	})),
];

function workspaceRoot() {
	const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];
	const root = candidates.find((candidate) =>
		fs.existsSync(path.join(candidate, "supertonic_tts_worker.py")),
	);
	if (!root) throw new Error("Không tìm thấy supertonic_tts_worker.py");
	return root;
}

function pythonPath(root: string) {
	return ttsEnginePython(root, "supertonic");
}

export function supertonicConfigured() {
	try {
		return fs.existsSync(pythonPath(workspaceRoot()));
	} catch {
		return false;
	}
}

export function listSupertonicVoices() {
	return supertonicConfigured() ? VOICES : [];
}

class SupertonicWorker {
	private child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private pending = new Map<string, Pending>();
	private alive = true;

	constructor() {
		const root = workspaceRoot();
		const python = pythonPath(root);
		if (!fs.existsSync(python)) {
			throw new Error("Supertonic chưa được cài trong .local-services/supertonic/.venv");
		}
		this.child = spawn(python, [path.join(root, "supertonic_tts_worker.py")], {
			cwd: root,
			env: { ...process.env, EDITKUB_TTS_ENGINE_ROOT: fs.existsSync(ttsEngineRoot(root, "supertonic")) ? ttsEngineRoot(root, "supertonic") : legacyTtsEngineRoot(root, "supertonic"), HF_HOME: ttsEngineModelsRoot(root, "supertonic"), HF_HUB_OFFLINE: "0", PYTHONPATH: ttsEngineSitePackages(root, "supertonic"), PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
		this.child.on("error", (error) => this.rejectAll(error));
		this.child.on("exit", (code) => {
			this.alive = false;
			this.rejectAll(new Error(`Supertonic worker đã dừng (mã ${code ?? "không rõ"}).`));
		});
	}

	isAlive() { return this.alive; }

	run(payload: Record<string, unknown>) {
		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const id = randomUUID();
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Supertonic xử lý quá thời gian cho phép."));
			}, 5 * 60 * 1000);
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
			if (parsed.success !== true) pending.reject(new Error(String(parsed.error || "Supertonic thất bại")));
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

const registry = globalThis as typeof globalThis & { __supertonicWorker?: SupertonicWorker };

function worker() {
	if (!registry.__supertonicWorker?.isAlive()) registry.__supertonicWorker = new SupertonicWorker();
	return registry.__supertonicWorker;
}

export async function synthesizeSupertonicVoice({ text, voice, rate }: { text: string; voice: string; rate?: number }) {
	const result = await worker().run({ command: "synthesize", text, voice, rate });
	if (typeof result.audioPath !== "string") throw new Error("Supertonic không trả về file âm thanh");
	return result.audioPath;
}
