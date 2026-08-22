import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import type {
	RecognitionCue,
	SpeakerCountSetting,
	SpeakerProfile,
} from "@/dubbing/types";
import {
	assignSpeakersToCues,
	resolveAsrCueEndTime,
} from "@/dubbing/services/speaker-diarization";
import {
	getSpeakerDiarizationWorkerStatus,
	prewarmSpeakerDiarizationWorker,
	runSpeakerDiarizationWorker,
	type DiarizationWorkerOutput,
} from "@/dubbing/services/speaker-diarization-worker";
import {
	getOrCreateDiarizationOutput,
	getOrCreateNormalizedAudio,
} from "@/dubbing/server/asr-analysis-cache";

const execAsync = promisify(exec);

type DiarizationOutput = DiarizationWorkerOutput;

interface DiarizationTaskResult {
	output?: DiarizationOutput;
	error?: Error;
	cacheHit?: boolean;
	durationMs?: number;
}

type AudioFilterPreset = "none" | "speech-band" | "speech-denoise";

function resolveDiarizationPython({
	runnerPath,
}: {
	runnerPath: string;
}): string {
	if (process.env.DIARIZATION_PYTHON) return process.env.DIARIZATION_PYTHON;
	const runnerDir = path.dirname(runnerPath);
	const candidates = [
		path.join(runnerDir, ".venv-diarization", "Scripts", "python.exe"),
		path.join(runnerDir, "..", ".venv-diarization", "Scripts", "python.exe"),
		path.join(process.cwd(), ".venv-diarization", "Scripts", "python.exe"),
		path.join(process.cwd(), "..", "..", "..", ".venv-diarization", "Scripts", "python.exe"),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) || "python";
}

function getDiarizationWorkerOptions() {
	const runnerCandidates = [
		path.join(process.cwd(), "speaker_diarization_runner.py"),
		path.join(process.cwd(), "..", "..", "speaker_diarization_runner.py"),
	];
	const runnerPath = runnerCandidates.find((candidate) => fs.existsSync(candidate));
	if (!runnerPath) throw new Error("Không tìm thấy speaker_diarization_runner.py.");
	return {
		runnerPath,
		pythonPath: resolveDiarizationPython({ runnerPath }),
	};
}

function parseAudioFilterPreset(value: string | null): AudioFilterPreset {
	if (value === "speech-band" || value === "speech-denoise") return value;
	return "none";
}

function getAudioFilterGraph(preset: AudioFilterPreset): string | null {
	if (preset === "speech-band") return "highpass=f=120,lowpass=f=3500";
	if (preset === "speech-denoise") {
		return "highpass=f=120,lowpass=f=3500,afftdn=nr=10:nf=-30";
	}
	return null;
}

export async function GET(req: Request) {
	const capability = new URL(req.url).searchParams.get("capability");
	if (capability !== "diarization") {
		return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
	}
	try {
		const options = getDiarizationWorkerOptions();
		const statusBefore = getSpeakerDiarizationWorkerStatus(options);
		const status = await prewarmSpeakerDiarizationWorker(options);
		return NextResponse.json({
			success: true,
			prewarmed: statusBefore.state === "ready",
			diarization: status,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Prewarm thất bại." },
			{ status: 500 },
		);
	}
}

async function runSpeakerDiarization({
	audioPath,
	speakerCount,
}: {
	audioPath: string;
	speakerCount: SpeakerCountSetting;
}) {
	const { pythonPath, runnerPath } = getDiarizationWorkerOptions();

	const output: DiarizationOutput = await runSpeakerDiarizationWorker({
		pythonPath,
		runnerPath,
		audioPath,
		speakerCount: String(speakerCount),
	});
	if (!output.success) {
		throw new Error(output.error || "Không thể phân biệt người nói.");
	}
	return output;
}

export async function POST(req: Request) {
	const requestStartedAt = performance.now();
	let inputTempPath = "";
	let convertedWavPath = "";
	let diarizationTask: Promise<DiarizationTaskResult> | null = null;
	let uploadParseMs = 0;
	let tempWriteMs = 0;
	let normalizeMs = 0;
	let normalizedAudioCacheHit = false;
	let normalizedAudioKey = "";
	let asrMs = 0;
	let audioFilterPreset: AudioFilterPreset = "none";
	let ffmpegSkipped = false;
	try {
		let engine = "capcut-asr";
		let language = "auto";
		let audioBuffer: Buffer | null = null;
		let fileName = "input.wav";
		let speakerDiarizationEnabled = false;
		let speakerCount: SpeakerCountSetting = "auto";
		let audioProfile = "source";

		const contentType = req.headers.get("content-type") || "";
		const uploadParseStartedAt = performance.now();

		if (contentType.includes("multipart/form-data")) {
			const formData = await req.formData();
			engine = (formData.get("engine") as string) || "capcut-asr";
			language = (formData.get("language") as string) || "auto";
			speakerDiarizationEnabled =
				formData.get("speakerDiarizationEnabled") === "true";
			audioProfile = String(formData.get("audioProfile") || "source");
			audioFilterPreset = parseAudioFilterPreset(
				String(
					formData.get("audioFilterPreset") ||
						process.env.ASR_AUDIO_FILTER_PRESET ||
						"none",
				),
			);
			const requestedSpeakerCount = String(
				formData.get("speakerCount") || "auto",
			);
			speakerCount =
				requestedSpeakerCount === "auto"
					? "auto"
					: Math.max(1, Math.min(10, Number(requestedSpeakerCount) || 1));
			const file = formData.get("file") as File | null;
			if (file) {
				const bytes = await file.arrayBuffer();
				audioBuffer = Buffer.from(bytes);
				fileName = file.name || "input.wav";
			}
		} else {
			const body = await req.json();
			engine = body.engine || "capcut-asr";
			language = body.language || "auto";
			fileName = body.fileName || "input.wav";
			speakerDiarizationEnabled = body.speakerDiarizationEnabled === true;
			speakerCount = body.speakerCount || "auto";
		}
		uploadParseMs = performance.now() - uploadParseStartedAt;

		const tempDir = os.tmpdir();
		const safeExt = path.extname(fileName) || ".wav";
		inputTempPath = path.join(tempDir, `asr_input_${Date.now()}${safeExt}`);

		if (audioBuffer) {
			const writeStartedAt = performance.now();
			fs.writeFileSync(inputTempPath, audioBuffer);
			tempWriteMs = performance.now() - writeStartedAt;
		}

		if (!audioBuffer) throw new Error("Không nhận được dữ liệu âm thanh.");
		const normalizationStartedAt = performance.now();
		const filterGraph = getAudioFilterGraph(audioFilterPreset);
		const alreadyNormalized =
			audioProfile === "pcm-s16le-16000-mono-v1" && !filterGraph;
		ffmpegSkipped = alreadyNormalized;
		const normalized = await getOrCreateNormalizedAudio({
			input: audioBuffer,
			profile: `${audioProfile}:${audioFilterPreset}`,
			version: "pcm-s16le-16000-mono-v2",
			create: async (partPath) => {
				if (alreadyNormalized) {
					await fs.promises.writeFile(partPath, audioBuffer);
					return;
				}
				const filterArgument = filterGraph ? ` -af "${filterGraph}"` : "";
				await execAsync(
					`ffmpeg -y -i "${inputTempPath}" -vn${filterArgument} -acodec pcm_s16le -ar 16000 -ac 1 "${partPath}"`,
				);
			},
		});
		normalizeMs = performance.now() - normalizationStartedAt;
		normalizedAudioCacheHit = normalized.cacheHit;
		normalizedAudioKey = normalized.key;
		const targetAudioPath = normalized.path;

		// ASR and speaker diarization are independent analyses of the same audio.
		// Start diarization now so both tasks run in parallel, then merge by timestamps.
		if (speakerDiarizationEnabled && fs.existsSync(targetAudioPath)) {
			const diarizationStartedAt = performance.now();
			diarizationTask = getOrCreateDiarizationOutput({
				normalizedKey: normalizedAudioKey,
				speakerCount,
				modelFingerprint:
					process.env.PYANNOTE_MODEL_FINGERPRINT || "community-1-step-0.1",
				version: "speaker-segments-v5",
				create: () =>
					runSpeakerDiarization({
						audioPath: targetAudioPath,
						speakerCount,
					}),
			})
				.then(({ output, cacheHit }) => ({
					output,
					cacheHit,
					durationMs: performance.now() - diarizationStartedAt,
				}))
				.catch((error: unknown) => ({
					error:
						error instanceof Error
							? error
							: new Error("Không thể phân biệt người nói."),
				}));
		}

		const msToSeconds = (ms: any): number => {
			const num = Number(ms) || 0;
			return Math.round((num / 1000.0) * 100) / 100;
		};

		const cueFromAsrItem = ({
			id,
			startMs,
			endMs,
			text,
		}: {
			id: string;
			startMs: unknown;
			endMs: unknown;
			text: unknown;
		}): RecognitionCue => {
			const spoken = String(text || "");
			const startTime = msToSeconds(startMs);
			const endTime = resolveAsrCueEndTime({
				startTime,
				endTime: msToSeconds(endMs),
				text: spoken,
			});
			return {
				id,
				startTime: Number(startTime.toFixed(2)),
				endTime: Number(endTime.toFixed(2)),
				text: spoken,
				confidence: 0.99,
				speaker: "Speaker 1",
			};
		};


		const respondWithCues = async ({
			cues,
			engineName,
			provider,
		}: {
			cues: RecognitionCue[];
			engineName: string;
			provider: string;
		}) => {
			let finalCues = cues;
			let speakers: SpeakerProfile[] = [];
			let diarizationResult: DiarizationTaskResult | null = null;
			let mergeMs = 0;
			if (speakerDiarizationEnabled) {
				if (!diarizationTask) {
					throw new Error("Không có file âm thanh để phân biệt người nói.");
				}
				diarizationResult = await diarizationTask;
				if (diarizationResult.error) {
					throw diarizationResult.error;
				}
				if (cues.length > 0) {
					const mergeStartedAt = performance.now();
					const diarized = assignSpeakersToCues({
						cues: finalCues,
						segments: diarizationResult.output?.segments || [],
						mode: "onset",
					});
					finalCues = diarized.cues;
					speakers = diarized.speakers;
					mergeMs = performance.now() - mergeStartedAt;
				}
			}

			return NextResponse.json({
				success: true,
				engine: engineName,
				provider,
				cues: finalCues,
				speakers,
				speakerDiarizationEnabled,
				analysis: {
					totalMs: performance.now() - requestStartedAt,
					uploadParseMs,
					tempWriteMs,
					normalizeMs,
					asrMs,
					diarizationMs: diarizationResult?.durationMs ?? 0,
					diarizationInferenceMs:
						diarizationResult?.output?.inferenceMs ?? 0,
					mergeMs,
					audioFilterPreset,
					device: diarizationResult?.output?.device,
					deviceLabel: diarizationResult?.output?.deviceLabel,
					normalizedAudioCacheHit,
					diarizationCacheHit: diarizationResult?.cacheHit ?? false,
					ffmpegSkipped,
				},
			});
		};

		// 1. CapCut / JianYing ASR Engine
		if (engine === "capcut-asr") {
			if (fs.existsSync(targetAudioPath)) {
				try {
					const asrStartedAt = performance.now();
					const { transcribe } = await import("jianying-subtitle");
					const segments = await transcribe({ input: targetAudioPath });
					asrMs = performance.now() - asrStartedAt;

					if (Array.isArray(segments)) {
						const cues = segments.map((item: any, idx: number) =>
							cueFromAsrItem({
								id: `capcut-${idx + 1}`,
								startMs: item.startMs ?? item.start_time ?? item.startTime ?? item.start ?? 0,
								endMs: item.endMs ?? item.end_time ?? item.endTime ?? item.end ?? 0,
								text: item.text || item.content || "",
							}),
						);

						return await respondWithCues({
							cues,
							engineName: "CapCut / JianYing ASR API",
							provider: "ByteDance JianYing Cloud",
						});
					}
				} catch (err: any) {
					console.error("CapCut ASR execution error:", err);
					return NextResponse.json(
						{ error: `CapCut ASR Error: ${err.message || "Failed to process audio"}` },
						{ status: 500 },
					);
				}
			}
			return NextResponse.json({ success: true, cues: [] });
		}

		// 2. BCut Bilibili ASR Engine
		if (engine === "bcut-bilibili") {
			if (fs.existsSync(targetAudioPath)) {
				const asrStartedAt = performance.now();
				try {
					const scriptCandidates = [
						path.join(process.cwd(), "bcut_runner.py"),
						path.resolve(process.cwd(), "..", "..", "bcut_runner.py"),
					];
					const scriptPath = scriptCandidates.find((candidate) => fs.existsSync(candidate));
					if (!scriptPath) {
						throw new Error("bcut_runner.py not found in the project workspace");
					}

					const { stdout } = await execAsync(`python "${scriptPath}" "${targetAudioPath}"`);
					const resData = JSON.parse(stdout);

					if (resData.success && Array.isArray(resData.cues)) {
						asrMs = performance.now() - asrStartedAt;
						const cues = resData.cues.map((item: any, idx: number) =>
							cueFromAsrItem({
								id: `bcut-${idx + 1}`,
								startMs: item.startTime * 1000,
								endMs: item.endTime * 1000,
								text: item.text || "",
							}),
						);
						return await respondWithCues({
							cues,
							engineName: "BCut Bilibili ASR API",
							provider: "Bilibili 必剪 Cloud",
						});
					}
				} catch (err: any) {
					console.error("BCut Execution error, attempting CapCut fallback:", err);
				}

				// Run CapCut ASR engine as reliable fallback for BCut Bilibili
				try {
					const { transcribe } = await import("jianying-subtitle");
					const segments = await transcribe({ input: targetAudioPath });
					asrMs = performance.now() - asrStartedAt;

					if (Array.isArray(segments)) {
						const cues = segments.map((item: any, idx: number) =>
							cueFromAsrItem({
								id: `bcut-cc-${idx + 1}`,
								startMs: item.startMs ?? item.start_time ?? 0,
								endMs: item.endMs ?? item.end_time ?? 0,
								text: item.text || "",
							}),
						);
						return await respondWithCues({
							cues,
							engineName: "BCut Bilibili ASR API (Fallback)",
							provider: "ByteDance / Bilibili Cloud",
						});
					}
				} catch (err: any) {
					console.error("BCut fallback error:", err);
					return NextResponse.json(
						{ error: `BCut ASR Error: ${err.message || "Failed to recognize speech"}` },
						{ status: 500 },
					);
				}
			}

			return NextResponse.json({ success: true, cues: [] });
		}

		// 3. Groq Whisper API
		if (engine === "groq-whisper") {
			if (fs.existsSync(targetAudioPath)) {
				try {
					const asrStartedAt = performance.now();
					const { transcribe } = await import("jianying-subtitle");
					const segments = await transcribe({ input: targetAudioPath });
					asrMs = performance.now() - asrStartedAt;
					if (Array.isArray(segments)) {
						const cues = segments.map((item: any, idx: number) =>
							cueFromAsrItem({
								id: `groq-${idx + 1}`,
								startMs: item.startMs ?? item.start_time ?? 0,
								endMs: item.endMs ?? item.end_time ?? 0,
								text: item.text || "",
							}),
						);
						return await respondWithCues({
							cues,
							engineName: "Groq Whisper API",
							provider: "Groq Cloud AI",
						});
					}
				} catch (err: any) {
					console.error("Groq Whisper error:", err);
					throw err;
				}
			}
			return NextResponse.json({ success: true, cues: [] });
		}

		// Groq/OpenRouter transcribe client-side; this path only runs pyannote.
		if (engine === "diarize") {
			if (!speakerDiarizationEnabled) {
				return NextResponse.json(
					{ error: "Chưa bật phân biệt người nói." },
					{ status: 400 },
				);
			}
			if (!diarizationTask) {
				throw new Error("Không có file âm thanh để phân biệt người nói.");
			}
			const diarizationResult = await diarizationTask;
			if (diarizationResult.error) {
				throw diarizationResult.error;
			}
			return NextResponse.json({
				success: true,
				engine: "pyannote",
				provider: "Local pyannote",
				segments: diarizationResult.output?.segments ?? [],
				device: diarizationResult.output?.device,
				deviceLabel: diarizationResult.output?.deviceLabel,
				detectedSpeakers: diarizationResult.output?.detectedSpeakers,
				analysis: {
					totalMs: performance.now() - requestStartedAt,
					uploadParseMs,
					tempWriteMs,
					normalizeMs,
					diarizationMs: diarizationResult.durationMs ?? 0,
					diarizationInferenceMs:
						diarizationResult.output?.inferenceMs ?? 0,
					audioFilterPreset,
					normalizedAudioCacheHit,
					diarizationCacheHit: diarizationResult.cacheHit ?? false,
					ffmpegSkipped,
				},
			});
		}

		return NextResponse.json({ error: "Unknown engine" }, { status: 400 });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || "Failed to process ASR" }, { status: 500 });
	} finally {
		// Do not delete temporary audio while the parallel worker is still reading it.
		if (diarizationTask) {
			await diarizationTask;
		}
		if (inputTempPath && fs.existsSync(inputTempPath)) {
			try {
				fs.unlinkSync(inputTempPath);
			} catch (_) {}
		}
		if (convertedWavPath && fs.existsSync(convertedWavPath)) {
			try {
				fs.unlinkSync(convertedWavPath);
			} catch (_) {}
		}
	}
}
