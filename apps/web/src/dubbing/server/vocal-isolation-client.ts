import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

type Pending = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type VocalIsolationStatus = {
	ready: boolean;
	device?: string;
	error?: string;
};

export type VocalIsolationResult = {
	vocalsPath: string;
	instrumentalPath: string;
	device?: string;
	model?: string;
	inferenceMs?: number;
};

const MISSING_VENV =
	"Chưa cài tách giọng. Chạy scripts/setup-vocal-isolation.ps1.";

function workspaceRoot() {
	const cwd = process.cwd();
	const candidates = [
		path.resolve(cwd, "lemyloi-dichvideo"),
		path.resolve(cwd, "..", ".."),
		cwd,
	];
	const existing = candidates.filter((candidate) =>
		fs.existsSync(path.join(candidate, "vocal_isolation_worker.py")),
	);
	if (existing.length === 0) {
		throw new Error("Không tìm thấy vocal_isolation_worker.py");
	}
	return (
		existing.find(
			(candidate) => path.basename(candidate).toLowerCase() === "lemyloi-dichvideo",
		) ?? existing[0]
	);
}

function workerScriptPath() {
	return path.join(workspaceRoot(), "vocal_isolation_worker.py");
}

export function vocalIsolationPythonPath({
	root = workspaceRoot(),
}: {
	root?: string;
} = {}): string {
	const candidates = [
		path.join(root, ".local-services", "vocal-isolation", ".venv-spleeter", "Scripts", "python.exe"),
		path.join(path.dirname(root), ".local-services", "vocal-isolation", ".venv-spleeter", "Scripts", "python.exe"),
		path.join(root, "..", ".local-services", "vocal-isolation", ".venv-spleeter", "Scripts", "python.exe"),
		path.join(root, ".local-services", "vocal-isolation", ".venv", "Scripts", "python.exe"),
		path.join(path.dirname(root), ".local-services", "vocal-isolation", ".venv", "Scripts", "python.exe"),
		path.join(root, "..", ".local-services", "vocal-isolation", ".venv", "Scripts", "python.exe"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	throw new Error(MISSING_VENV);
}

export function vocalIsolationReady(): VocalIsolationStatus {
	try {
		vocalIsolationPythonPath();
		if (!fs.existsSync(workerScriptPath())) {
			return {
				ready: false,
				error: "Không tìm thấy vocal_isolation_worker.py",
			};
		}
		return { ready: true };
	} catch (error) {
		return {
			ready: false,
			error: error instanceof Error ? error.message : MISSING_VENV,
		};
	}
}

class VocalIsolationWorker {
	private child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private pending = new Map<string, Pending>();
	private alive = true;
	private readyPromise: Promise<void>;
	private settleReady!: () => void;
	private readyError: Error | null = null;
	readonly scriptPath: string;
	readonly scriptMtime: number;
	device?: string;

	constructor() {
		const root = workspaceRoot();
		this.scriptPath = workerScriptPath();
		this.scriptMtime = fs.statSync(this.scriptPath).mtimeMs;
		this.readyPromise = new Promise((resolve) => {
			this.settleReady = resolve;
		});
		this.child = spawn(vocalIsolationPythonPath({ root }), [this.scriptPath], {
			cwd: root,
			env: {
				...process.env,
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
				new Error(
					`Worker tách giọng đã dừng (mã ${code ?? "không rõ"}).`,
				),
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
		this.rejectAll(new Error("Worker tách giọng đang khởi động lại."));
		if (!this.child.killed) this.child.kill();
	}

	async waitUntilReady() {
		await this.readyPromise;
		if (this.readyError) throw this.readyError;
	}

	run(payload: Record<string, unknown>) {
		return new Promise<Record<string, unknown>>((resolve, reject) => {
			const id = randomUUID();
			const timer = setTimeout(
				() => {
					this.pending.delete(id);
					reject(
						new Error("Tách giọng quá thời gian cho phép."),
					);
				},
				60 * 60 * 1000,
			);
			this.pending.set(id, { resolve, reject, timer });
			this.child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
		});
	}

	private onData(chunk: string) {
		this.buffer += chunk;
		const lines = this.buffer.split(/\r?\n/);
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			let decoded: unknown;
			try {
				decoded = JSON.parse(line);
			} catch {
				continue;
			}
			const parsedResult = z
				.record(z.string(), z.unknown())
				.safeParse(decoded);
			if (!parsedResult.success) continue;
			const parsed = parsedResult.data;
			if (typeof parsed.id !== "string") {
				if (parsed.ready === true) {
					this.device =
						typeof parsed.device === "string" ? parsed.device : undefined;
					this.settleReady();
				} else if (parsed.ready === false) {
					this.readyError = new Error(
						String(parsed.error || "Không thể khởi động worker tách giọng."),
					);
					this.settleReady();
				}
				continue;
			}
			const pending = this.pending.get(parsed.id);
			if (!pending) continue;
			clearTimeout(pending.timer);
			this.pending.delete(parsed.id);
			if (parsed.success !== true) {
				pending.reject(
					new Error(String(parsed.error || "Tách giọng thất bại")),
				);
				continue;
			}
			pending.resolve(parsed);
		}
	}

	private rejectAll(error: Error) {
		this.readyError = error;
		this.settleReady();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

const registry = globalThis as typeof globalThis & {
	__vocalIsolationWorker?: VocalIsolationWorker;
};

function recycleWorker() {
	const current = registry.__vocalIsolationWorker;
	if (current && typeof current.dispose === "function") {
		current.dispose();
	}
	registry.__vocalIsolationWorker = new VocalIsolationWorker();
	return registry.__vocalIsolationWorker;
}

function worker() {
	const current = registry.__vocalIsolationWorker;
	const stale =
		!current ||
		typeof current.isAlive !== "function" ||
		!current.isAlive() ||
		typeof current.matchesScript !== "function" ||
		!current.matchesScript();
	if (stale) return recycleWorker();
	return current;
}

export async function pingVocalIsolation(): Promise<VocalIsolationStatus> {
	const installed = vocalIsolationReady();
	if (!installed.ready) return installed;
	try {
		const current = worker();
		await current.waitUntilReady();
		const result = await current.run({ command: "ping" });
		return {
			ready: true,
			device:
				typeof result.device === "string"
					? result.device
					: current.device,
		};
	} catch (error) {
		return {
			ready: false,
			error: error instanceof Error ? error.message : MISSING_VENV,
		};
	}
}

export async function separateVocals({
	audioPath,
}: {
	audioPath: string;
}): Promise<VocalIsolationResult> {
	const installed = vocalIsolationReady();
	if (!installed.ready) {
		throw new Error(installed.error || MISSING_VENV);
	}
	const current = worker();
	await current.waitUntilReady();
	const result = await current.run({
		command: "separate",
		audioPath,
	});
	const vocalsPath =
		typeof result.vocalsPath === "string" ? result.vocalsPath : "";
	const instrumentalPath =
		typeof result.instrumentalPath === "string"
			? result.instrumentalPath
			: "";
	if (!vocalsPath || !instrumentalPath) {
		throw new Error("Worker tách giọng không trả đủ 2 stem.");
	}
	return {
		vocalsPath,
		instrumentalPath,
		device: typeof result.device === "string" ? result.device : undefined,
		model: typeof result.model === "string" ? result.model : undefined,
		inferenceMs:
			typeof result.inferenceMs === "number" ? result.inferenceMs : undefined,
	};
}
