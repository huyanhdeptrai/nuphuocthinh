import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { SpeakerSegment } from "./speaker-diarization";

export interface DiarizationWorkerOutput {
	success: boolean;
	error?: string;
	device?: string;
	deviceLabel?: string;
	inferenceMs?: number;
	detectedSpeakers?: number;
	segments?: SpeakerSegment[];
}

export type SpeakerDiarizationWorkerState = "starting" | "ready" | "failed";

export interface SpeakerDiarizationWorkerStatus {
	state: SpeakerDiarizationWorkerState;
	device?: string;
	deviceLabel?: string;
	modelLoadMs?: number;
	error?: string;
}

export interface SpeakerDiarizationWorkerOptions {
	pythonPath: string;
	runnerPath: string;
}

interface PendingRequest {
	resolve: (output: DiarizationWorkerOutput) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isSpeakerSegment(value: unknown): value is SpeakerSegment {
	return (
		isRecord(value) &&
		typeof value.startTime === "number" &&
		typeof value.endTime === "number" &&
		typeof value.speaker === "string"
	);
}

class SpeakerDiarizationWorker {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly readyPromise: Promise<void>;
	private settleReady!: () => void;
	private stdoutBuffer = "";
	private stderrBuffer = "";
	private alive = true;
	private status: SpeakerDiarizationWorkerStatus = { state: "starting" };

	constructor({ pythonPath, runnerPath }: SpeakerDiarizationWorkerOptions) {
		this.readyPromise = new Promise((resolve) => {
			this.settleReady = resolve;
		});
		this.child = spawn(pythonPath, [runnerPath, "--worker"], {
			env: { ...process.env, HF_HUB_OFFLINE: "1" },
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			this.stderrBuffer = (this.stderrBuffer + chunk).slice(-8192);
		});
		this.child.stdin.on("error", (error) => this.fail(error));
		this.child.on("error", (error) => this.fail(error));
		this.child.on("exit", (code) => {
			this.alive = false;
			const stderr = this.stderrBuffer.trim();
			this.fail(
				new Error(
					`Diarization worker đã dừng (mã ${code ?? "không rõ"}).${stderr ? ` ${stderr}` : ""}`,
				),
			);
		});
	}

	isAlive() {
		return this.alive && this.status.state !== "failed";
	}

	getStatus(): SpeakerDiarizationWorkerStatus {
		return { ...this.status };
	}

	async prewarm(): Promise<SpeakerDiarizationWorkerStatus> {
		await this.waitUntilReady();
		return this.getStatus();
	}

	async run({
		audioPath,
		speakerCount,
	}: {
		audioPath: string;
		speakerCount: string;
	}): Promise<DiarizationWorkerOutput> {
		await this.waitUntilReady();
		return new Promise<DiarizationWorkerOutput>((resolve, reject) => {
			if (!this.isAlive()) {
				reject(new Error("Diarization worker chưa sẵn sàng."));
				return;
			}
			const id = randomUUID();
			const timer = setTimeout(
				() => {
					this.pending.delete(id);
					reject(new Error("Phân biệt người nói quá thời gian cho phép."));
				},
				60 * 60 * 1000,
			);
			this.pending.set(id, { resolve, reject, timer });
			this.child.stdin.write(
				`${JSON.stringify({ id, audioPath, speakerCount })}\n`,
			);
		});
	}

	private async waitUntilReady() {
		await this.readyPromise;
		if (this.status.state !== "ready") {
			throw new Error(this.status.error || "Diarization worker chưa sẵn sàng.");
		}
	}

	private handleStdout(chunk: string) {
		this.stdoutBuffer += chunk;
		const lines = this.stdoutBuffer.split(/\r?\n/);
		this.stdoutBuffer = lines.pop() || "";
		for (const line of lines) {
			if (!line.trim()) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (!isRecord(parsed)) continue;
			const id = typeof parsed.id === "string" ? parsed.id : undefined;
			const error = typeof parsed.error === "string" ? parsed.error : undefined;
			if (!id) {
				if (parsed.ready === true && this.status.state === "starting") {
					this.status = {
						state: "ready",
						device:
							typeof parsed.device === "string" ? parsed.device : undefined,
						deviceLabel:
							typeof parsed.deviceLabel === "string"
								? parsed.deviceLabel
								: undefined,
						modelLoadMs:
							typeof parsed.modelLoadMs === "number"
								? parsed.modelLoadMs
								: undefined,
					};
					this.settleReady();
				} else if (parsed.ready === false) {
					this.fail(
						new Error(error || "Không thể khởi động diarization worker."),
					);
				}
				continue;
			}
			const pending = this.pending.get(id);
			if (!pending) continue;
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.resolve({
				success: parsed.success === true,
				error,
				device: typeof parsed.device === "string" ? parsed.device : undefined,
				deviceLabel:
					typeof parsed.deviceLabel === "string"
						? parsed.deviceLabel
						: undefined,
				inferenceMs:
					typeof parsed.inferenceMs === "number"
						? parsed.inferenceMs
						: undefined,
				detectedSpeakers:
					typeof parsed.detectedSpeakers === "number"
						? parsed.detectedSpeakers
						: undefined,
				segments: Array.isArray(parsed.segments)
					? parsed.segments.filter(isSpeakerSegment)
					: undefined,
			});
		}
	}

	private fail(error: Error) {
		if (this.status.state !== "failed") {
			this.status = { ...this.status, state: "failed", error: error.message };
			this.settleReady();
		}
		this.rejectAll(error);
	}

	private rejectAll(error: Error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

const workerRegistry = globalThis as typeof globalThis & {
	__speakerDiarizationWorker?: SpeakerDiarizationWorker;
};

function getOrCreateWorker(options: SpeakerDiarizationWorkerOptions) {
	let worker = workerRegistry.__speakerDiarizationWorker;
	if (!worker?.isAlive()) {
		worker = new SpeakerDiarizationWorker(options);
		workerRegistry.__speakerDiarizationWorker = worker;
	}
	return worker;
}

export function prewarmSpeakerDiarizationWorker(
	options: SpeakerDiarizationWorkerOptions,
) {
	return getOrCreateWorker(options).prewarm();
}

export function getSpeakerDiarizationWorkerStatus(
	options: SpeakerDiarizationWorkerOptions,
): SpeakerDiarizationWorkerStatus {
	let worker = workerRegistry.__speakerDiarizationWorker;
	if (!worker) {
		worker = new SpeakerDiarizationWorker(options);
		workerRegistry.__speakerDiarizationWorker = worker;
	}
	return worker.getStatus();
}

export function runSpeakerDiarizationWorker({
	pythonPath,
	runnerPath,
	audioPath,
	speakerCount,
}: {
	pythonPath: string;
	runnerPath: string;
	audioPath: string;
	speakerCount: string;
}) {
	const worker = getOrCreateWorker({ pythonPath, runnerPath });
	return worker.run({ audioPath, speakerCount });
}
