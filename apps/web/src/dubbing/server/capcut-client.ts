import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type CapCutVoice = {
	voice_type: string;
	display_name: string;
	resource_id: string;
	lang: string;
	lan: string;
};

const bridgeFailureSchema = z.object({
	success: z.literal(false),
	error: z.string(),
});

const capCutVoiceSchema = z.object({
	voice_type: z.string(),
	display_name: z.string(),
	resource_id: z.string(),
	lang: z.string(),
	lan: z.string(),
});

function resolveRunnerPath() {
	const candidates = [
		path.resolve(process.cwd(), "capcut_tts_runner.py"),
		path.resolve(process.cwd(), "..", "..", "capcut_tts_runner.py"),
	];
	const runnerPath = candidates.find((candidate) => fs.existsSync(candidate));
	if (!runnerPath) throw new Error("Không tìm thấy capcut_tts_runner.py");
	return runnerPath;
}

function resolvePythonPath(runnerPath: string) {
	const workspaceRoot = path.dirname(runnerPath);
	const localPython = path.join(
		workspaceRoot,
		".local-services",
		"capcut-tts-api",
		".venv",
		"Scripts",
		"python.exe",
	);
	return (
		process.env.CAPCUT_TTS_PYTHON ||
		(fs.existsSync(localPython) ? localPython : "python")
	);
}

async function runBridge(input: Record<string, unknown>): Promise<unknown> {
	const runnerPath = resolveRunnerPath();
	const pythonPath = resolvePythonPath(runnerPath);
	const bundledPackages = path.join(path.dirname(runnerPath), "python");

	return new Promise<unknown>((resolve, reject) => {
		const child = spawn(pythonPath, [runnerPath], {
			cwd: path.dirname(runnerPath),
			env: {
				...process.env,
				PYTHONPATH: [bundledPackages, process.env.PYTHONPATH]
					.filter(Boolean)
					.join(path.delimiter),
				PYTHONIOENCODING: "utf-8",
				PYTHONUTF8: "1",
			},
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => child.kill(), 100_000);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => (stdout += chunk));
		child.stderr.on("data", (chunk: string) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", () => {
			clearTimeout(timeout);
			try {
				const output = stdout.trim();
				if (!output) {
					throw new Error(
						stderr.trim() || "CapCut TTS bridge returned no data",
					);
				}
				const result: unknown = JSON.parse(output);
				const failure = bridgeFailureSchema.safeParse(result);
				if (failure.success) throw new Error(failure.data.error);
				resolve(result);
			} catch (error) {
				reject(
					error instanceof Error
						? error
						: new Error(stderr.trim() || "CapCut TTS bridge failed"),
				);
			}
		});
		child.stdin.end(JSON.stringify(input));
	});
}

export async function listCapCutVoices(language?: string) {
	const result = await runBridge({
		command: "voices",
		language,
	});
	return z
		.object({ success: z.literal(true), voices: z.array(capCutVoiceSchema) })
		.parse(result).voices;
}

export async function synthesizeCapCutVoice(input: {
	text: string;
	voice: string;
	rate: number;
}) {
	const result = await runBridge({
		command: "synthesize",
		...input,
	});
	return z
		.object({
			success: z.literal(true),
			audio_url: z.string().url(),
			duration_ms: z.number().optional(),
		})
		.parse(result);
}
