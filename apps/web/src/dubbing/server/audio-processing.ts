import { spawn } from "node:child_process";

function runAudioProcess({
	command,
	args,
	audio,
}: {
	command: "ffmpeg" | "ffprobe";
	args: string[];
	audio: Uint8Array;
}) {
	return new Promise<{ stdout: Buffer; stderr: string }>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		const chunks: Buffer[] = [];
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
				return;
			}
			resolve({ stdout: Buffer.concat(chunks), stderr });
		});
		child.stdin.end(Buffer.from(audio));
	});
}

async function probeNumber({
	audio,
	args,
}: {
	audio: Uint8Array;
	args: string[];
}) {
	const { stdout } = await runAudioProcess({
		command: "ffprobe",
		args,
		audio,
	});
	const value = Number.parseFloat(stdout.toString("utf8").trim().split(/\r?\n/u)[0] ?? "");
	return Number.isFinite(value) && value > 0 ? value : null;
}

export async function probeAudioDuration({ audio }: { audio: Uint8Array }) {
	// WAV from VieNeu/Gemini has no packet durations. Summing packets
	// returns 0 and then TTS fails with "Không đo được thời lượng".
	const formatDuration = await probeNumber({
		audio,
		args: [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			"pipe:0",
		],
	});
	if (formatDuration) return formatDuration;

	const streamDuration = await probeNumber({
		audio,
		args: [
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			"pipe:0",
		],
	});
	if (streamDuration) return streamDuration;

	const { stdout } = await runAudioProcess({
		command: "ffprobe",
		args: [
			"-v",
			"error",
			"-show_entries",
			"packet=duration_time",
			"-of",
			"csv=p=0",
			"pipe:0",
		],
		audio,
	});
	const duration = stdout
		.toString("utf8")
		.split(/\r?\n/u)
		.reduce((total, value) => {
			const packetDuration = Number.parseFloat(value);
			return Number.isFinite(packetDuration) ? total + packetDuration : total;
		}, 0);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Không đo được thời lượng audio TTS");
	}
	return duration;
}

/**
 * FFmpeg atempo keeps pitch while changing tempo. Each stage stays inside
 * 0.5x–2x so FFmpeg never uses the high-rate sample-skipping shortcut.
 */
export function buildAtempoFilters({ rate }: { rate: number }) {
	const filters: string[] = [];
	let remaining = rate;
	while (remaining > 2) {
		filters.push("atempo=2.000000");
		remaining /= 2;
	}
	while (remaining < 0.5) {
		filters.push("atempo=0.500000");
		remaining /= 0.5;
	}
	if (Math.abs(remaining - 1) >= 0.000_001 || filters.length === 0) {
		filters.push(`atempo=${remaining.toFixed(6)}`);
	}
	return filters;
}

export async function applyVoiceAdjustments({
	audio,
	rate,
	semitones,
	volumeGain,
	outputDuration,
}: {
	audio: Uint8Array;
	rate: number;
	semitones: number;
	volumeGain: number;
	outputDuration?: number;
}) {
	if (
		Math.abs(semitones) < 0.01 &&
		Math.abs(rate - 1) < 0.001 &&
		Math.abs(volumeGain) < 0.01 &&
		outputDuration === undefined
	) {
		return audio;
	}
	const pitchFactor = 2 ** (semitones / 12);
	const filter =
		Math.abs(semitones) < 0.01
			? buildAtempoFilters({ rate }).join(",")
			: [
					`rubberband=tempo=${rate.toFixed(6)}`,
					`pitch=${pitchFactor.toFixed(6)}`,
					"transients=smooth",
					"detector=soft",
					"phase=laminar",
					"window=long",
					"smoothing=on",
					"formant=preserved",
					"pitchq=quality",
				].join(":");
	const durationFilters =
		outputDuration !== undefined
			? [
					`apad=whole_dur=${outputDuration.toFixed(6)}`,
					`atrim=duration=${outputDuration.toFixed(6)}`,
					"afade=t=in:st=0:d=0.008",
					`afade=t=out:st=${Math.max(0, outputDuration - 0.012).toFixed(6)}:d=0.012`,
				].map((value) => `,${value}`).join("")
			: "";
	const { stdout } = await runAudioProcess({
		command: "ffmpeg",
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"pipe:0",
			"-filter:a",
			`${filter},volume=${volumeGain.toFixed(2)}dB${durationFilters}`,
			"-f",
			"wav",
			"pipe:1",
		],
		audio,
	});
	return new Uint8Array(stdout);
}

