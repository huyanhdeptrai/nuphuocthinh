import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const FILTERS = {
	none: null,
	"speech-band": "highpass=f=120,lowpass=f=3500",
	"speech-denoise": "highpass=f=120,lowpass=f=3500,afftdn=nr=10:nf=-30",
} as const;

type FilterPreset = keyof typeof FILTERS;

function runFfmpeg({
	input,
	output,
	preset,
}: {
	input: string;
	output: string;
	preset: FilterPreset;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = ["-y", "-i", input, "-vn"];
		const filter = FILTERS[preset];
		if (filter) args.push("-af", filter);
		args.push("-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", output);
		const child = spawn("ffmpeg", args, { windowsHide: true });
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-4000);
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`FFmpeg exited with ${code}: ${stderr}`));
		});
	});
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const runsIndex = args.indexOf("--runs");
const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
const runs = runsIndex >= 0 ? Math.max(1, Number(args[runsIndex + 1]) || 1) : 3;

if (!input) {
	throw new Error("Usage: bun run benchmark:asr-filter -- --input <media> [--runs 3]");
}

const workDir = await mkdtemp(join(tmpdir(), "lemyloi-dichvideo-asr-benchmark-"));
try {
	const results = [];
	for (const preset of Object.keys(FILTERS) as FilterPreset[]) {
		const durationsMs: number[] = [];
		let outputBytes = 0;
		for (let run = 0; run < runs; run++) {
			const output = join(workDir, `${preset}-${run}.wav`);
			const startedAt = performance.now();
			await runFfmpeg({ input, output, preset });
			durationsMs.push(performance.now() - startedAt);
			outputBytes = (await stat(output)).size;
		}
		results.push({
			preset,
			filter: FILTERS[preset],
			runs,
			meanDurationMs:
				durationsMs.reduce((total, duration) => total + duration, 0) /
				durationsMs.length,
			minDurationMs: Math.min(...durationsMs),
			maxDurationMs: Math.max(...durationsMs),
			outputBytes,
		});
	}
	process.stdout.write(`${JSON.stringify({ input: basename(input), results }, null, 2)}\n`);
} finally {
	await rm(workDir, { recursive: true, force: true });
}
