import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { prepareVideoOcrRegions } from "@/dubbing/services/ocr-regions";
import type {
	RecognitionCue,
	SpeakerCountSetting,
	SpeakerProfile,
} from "@/dubbing/types";
import {
	assignSpeakersToCues,
	type SpeakerSegment,
} from "@/dubbing/services/speaker-diarization";
import { runSpeakerDiarizationWorker } from "@/dubbing/services/speaker-diarization-worker";

const execAsync = promisify(exec);
const LOCAL_OCR_ENGINES = ["paddleocr", "rapidocr", "rapidocr-tiny", "easyocr"];

interface DiarizationOutput {
	success: boolean;
	error?: string;
	segments?: SpeakerSegment[];
}

interface DiarizationTaskResult {
	output?: DiarizationOutput;
	error?: Error;
}

async function runSpeakerDiarization({
	audioPath,
	speakerCount,
}: {
	audioPath: string;
	speakerCount: SpeakerCountSetting;
}) {
	const runnerCandidates = [
		path.join(process.cwd(), "speaker_diarization_runner.py"),
		path.join(process.cwd(), "..", "..", "speaker_diarization_runner.py"),
	];
	const runnerPath = runnerCandidates.find((candidate) => fs.existsSync(candidate));
	if (!runnerPath) {
		throw new Error("Không tìm thấy speaker_diarization_runner.py.");
	}
	const pythonCandidates = [
		path.join(path.dirname(runnerPath), ".venv-diarization", "Scripts", "python.exe"),
		path.join(path.dirname(runnerPath), "..", ".venv-diarization", "Scripts", "python.exe"),
		path.join(process.cwd(), "..", "..", "..", ".venv-diarization", "Scripts", "python.exe"),
	];
	const output: DiarizationOutput = await runSpeakerDiarizationWorker({
		pythonPath:
			process.env.DIARIZATION_PYTHON ||
			pythonCandidates.find((candidate) => fs.existsSync(candidate)) ||
			"python",
		runnerPath,
		audioPath,
		speakerCount: String(speakerCount),
	});
	if (!output.success) {
		throw new Error(output.error || "Không thể phân biệt người nói.");
	}
	return output;
}

function isVideoFile(buf: Buffer, fileName: string): boolean {
	const ext = path.extname(fileName).toLowerCase();
	if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext)) return true;
	if (buf && buf.length > 12) {
		const headHex = buf.subarray(0, 16).toString("hex");
		const headStr = buf.subarray(0, 16).toString("binary");
		if (headHex.startsWith("1a45dfa3")) return true; // WebM / MKV
		if (headStr.includes("ftyp")) return true; // MP4 / MOV
		if (headHex.startsWith("52494646") && headStr.includes("AVI")) return true; // AVI
	}
	return false;
}

export async function POST(req: Request) {
	let inputTempPath = "";
	let frameDir = "";
	let diarizationAudioPath = "";
	let diarizationTask: Promise<DiarizationTaskResult> | null = null;

	try {
		let engine = "rapidocr";
		let language = "auto";
		let googleApiKey = "";
		let baiduApiKey = "";
		let ocrSpaceApiKey = "";
		let rois = "";
		let mode = "ocr";
		let imageBuffer: Buffer | null = null;
		let fileName = "video.mp4";
		let speakerDiarizationEnabled = false;
		let speakerCount: SpeakerCountSetting = "auto";

		const contentType = req.headers.get("content-type") || "";

		if (contentType.includes("multipart/form-data")) {
			const formData = await req.formData();
			engine = (formData.get("engine") as string) || "rapidocr";
			language = (formData.get("language") as string) || "auto";
			googleApiKey = (formData.get("googleApiKey") as string) || "";
			baiduApiKey = (formData.get("baiduApiKey") as string) || "";
			ocrSpaceApiKey = (formData.get("ocrSpaceApiKey") as string) || "";
			rois = (formData.get("rois") as string) || "";
			mode = (formData.get("mode") as string) || "ocr";
			speakerDiarizationEnabled =
				formData.get("speakerDiarizationEnabled") === "true";
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
				imageBuffer = Buffer.from(bytes);
				fileName = file.name || "video.mp4";
			}
		} else {
			const body = await req.json();
			engine = body.engine || "rapidocr";
			language = body.language || "auto";
			googleApiKey = body.googleApiKey || "";
			baiduApiKey = body.baiduApiKey || "";
			ocrSpaceApiKey = body.ocrSpaceApiKey || "";
			rois = body.rois || "";
			mode = body.mode || "ocr";
			fileName = body.fileName || "video.mp4";
			speakerDiarizationEnabled = body.speakerDiarizationEnabled === true;
			speakerCount = body.speakerCount || "auto";
		}

		if (!imageBuffer) {
			return NextResponse.json({ error: "Không tìm thấy file hình ảnh hoặc video" }, { status: 400 });
		}

		const tempDir = os.tmpdir();
		const safeExt = path.extname(fileName) || ".mp4";
		inputTempPath = path.join(tempDir, `ocr_input_${Date.now()}${safeExt}`);
		fs.writeFileSync(inputTempPath, imageBuffer);

		const isLocalEngine = LOCAL_OCR_ENGINES.includes(engine);
		const inputIsVideo = isVideoFile(imageBuffer, fileName);
		const detectOnly = mode === "detect-only";
		if (detectOnly && !inputIsVideo) {
			return NextResponse.json(
				{ error: "Quét phụ đề gốc chỉ nhận video." },
				{ status: 400 },
			);
		}
		let targetPath = inputTempPath;
		let isDirectoryScan = false;

		if (speakerDiarizationEnabled && !detectOnly) {
			if (!inputIsVideo) {
				return NextResponse.json(
					{ error: "Phân biệt người nói trong OCR cần đầu vào là video có âm thanh." },
					{ status: 400 },
				);
			}
			diarizationAudioPath = path.join(
				tempDir,
				`ocr_diarization_${Date.now()}.wav`,
			);
			// Audio extraction + diarization begins immediately and runs alongside OCR.
			diarizationTask = (async () => {
				await execAsync(
					`ffmpeg -y -i "${inputTempPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${diarizationAudioPath}"`,
				);
				return runSpeakerDiarization({
					audioPath: diarizationAudioPath,
					speakerCount,
				});
			})()
				.then((output) => ({ output }))
				.catch((error: unknown) => ({
					error:
						error instanceof Error
							? error
							: new Error("Không thể phân biệt người nói."),
				}));
		}

		const mergeSpeakerLabels = async (
			cues: RecognitionCue[],
		): Promise<{ cues: RecognitionCue[]; speakers: SpeakerProfile[] }> => {
			if (!speakerDiarizationEnabled) return { cues, speakers: [] };
			if (!diarizationTask) {
				throw new Error("Không thể khởi động phân biệt người nói cho OCR.");
			}
			const result = await diarizationTask;
			if (result.error) throw result.error;
			return assignSpeakersToCues({
				cues,
				segments: result.output?.segments || [],
				mode: "lookbehind",
			});
		};

		// If input is a video file, extract timestamped sequential frames.
		// Six frames per second keeps subtitle timing reasonably close to ASR
		// while keeping local OCR processing practical.
		if (inputIsVideo && !isLocalEngine) {
			frameDir = path.join(tempDir, `ocr_frames_${Date.now()}`);
			fs.mkdirSync(frameDir, { recursive: true });
			try {
				await execAsync(`ffmpeg -y -i "${inputTempPath}" -vf "fps=6" -q:v 2 "${frameDir}/frame_%06d.png"`);
				const frameFiles = fs.readdirSync(frameDir).filter((f) => f.endsWith(".png"));
				if (frameFiles.length > 0) {
					isDirectoryScan = true;
					targetPath = frameDir;
				}
			} catch (ffmpegErr) {
				console.warn("FFmpeg video frames extraction warning:", ffmpegErr);
			}
		}

		// 1, 2, 3: Local Offline OCR Engines (PaddleOCR, RapidOCR, EasyOCR)
		if (LOCAL_OCR_ENGINES.includes(engine)) {
			try {
				const scriptCandidates = [
					path.join(process.cwd(), "ocr_runner.py"),
					path.resolve(process.cwd(), "..", "..", "ocr_runner.py"),
				];
				const scriptPath = scriptCandidates.find((candidate) => fs.existsSync(candidate));
				if (!scriptPath) {
					throw new Error("ocr_runner.py not found in the project workspace");
				}
				const langCode = language;
				const mediaArgument = inputIsVideo ? "--video" : "--image";
				
				let runnerRois = rois;
				if (inputIsVideo) {
					try {
						const parsedRois = JSON.parse(rois || "[]");
						if (Array.isArray(parsedRois)) {
							runnerRois = JSON.stringify(
								prepareVideoOcrRegions(parsedRois),
							);
						}
					} catch {
						// The Python runner will return the existing validation error.
					}
				}
				const roisBase64 = Buffer.from(runnerRois, "utf8").toString("base64");
				const detectOnlyArgs = detectOnly
					? " --detect-only --detector-fps 8 --stability-ms 80 --missing-grace-ms 180"
					: "";
				const { stdout } = await execAsync(
					`python "${scriptPath}" --engine ${engine} ${mediaArgument} "${inputTempPath}" --lang ${langCode} --rois-base64 ${roisBase64}${detectOnlyArgs}`,
					{ maxBuffer: 1024 * 1024 * 50 }
				);
				const resData = JSON.parse(stdout);

				if (resData.success) {
					const merged = await mergeSpeakerLabels(resData.cues || []);
					return NextResponse.json({
						success: true,
						engine: resData.engine || engine,
						provider: "Offline Python Core",
						cues: merged.cues,
						speakers: merged.speakers,
						speakerDiarizationEnabled,
						text: resData.text || "",
						srt: resData.srt || "",
						metrics: resData.metrics || null,
						originalSubtitleCues: detectOnly ? resData.cues || [] : undefined,
					});
				} else {
					return NextResponse.json({ error: resData.error || "Lỗi xử lý OCR Offline" }, { status: 400 });
				}
			} catch (err: any) {
				console.error("Local OCR Error:", err);
				return NextResponse.json(
					{ error: `Lỗi Engine ${engine.toUpperCase()}: ${err.message || "Không thể thực thi OCR"}` },
					{ status: 500 },
				);
			}
		}

		// 4: Google Vision / Gemini 2.5 Vision API (Cloud)
		if (engine === "google-vision") {
			const apiKey = googleApiKey.trim() || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
			if (!apiKey) {
				return NextResponse.json(
					{ error: "Vui lòng nhập Google Vision / Gemini API Key để sử dụng Cloud OCR này." },
					{ status: 400 },
				);
			}

			try {
				let samplePath = targetPath;
				if (isDirectoryScan && frameDir) {
					const files = fs.readdirSync(frameDir).filter((f) => f.endsWith(".png")).sort();
					if (files.length > 0) samplePath = path.join(frameDir, files[0]);
				}
				const finalImageBuffer = fs.readFileSync(samplePath);
				const base64Image = finalImageBuffer.toString("base64");
				const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

				const res = await fetch(apiUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [
							{
								parts: [
									{
										text: "Read and extract all subtitle text/captions in this image. Return a JSON array of strings containing lines of text found in order. Format: [\"line 1\", \"line 2\"]. Do not add Markdown code fences.",
									},
									{
										inline_data: {
											mime_type: "image/png",
											data: base64Image,
										},
									},
								],
							},
						],
					}),
				});

				if (!res.ok) {
					const errText = await res.text();
					throw new Error(`Google API Error (${res.status}): ${errText}`);
				}

				const geminiRes = await res.json();
				const textOutput = geminiRes.candidates?.[0]?.content?.parts?.[0]?.text || "";
				
				let parsedLines: string[] = [];
				try {
					const cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
					parsedLines = JSON.parse(cleanJson);
				} catch (_) {
					parsedLines = textOutput.split("\n").map((l: string) => l.trim()).filter(Boolean);
				}

				const cues = parsedLines.map((line: string, idx: number) => ({
					id: `google-${idx + 1}`,
					startTime: idx * 3.0 + 0.5,
					endTime: idx * 3.0 + 3.0,
					text: line,
					confidence: 0.99,
				}));
				const merged = await mergeSpeakerLabels(cues);

				return NextResponse.json({
					success: true,
					engine: "Google Cloud Vision / Gemini 2.5 API",
					provider: "Google AI Cloud",
					cues: merged.cues,
					speakers: merged.speakers,
					speakerDiarizationEnabled,
					text: parsedLines.join(" "),
				});
			} catch (err: any) {
				return NextResponse.json({ error: `Google Vision OCR Error: ${err.message}` }, { status: 500 });
			}
		}

		// 5: Baidu AI Cloud OCR API (Cloud)
		if (engine === "baidu-ocr") {
			const apiKey = baiduApiKey.trim();
			if (!apiKey) {
				return NextResponse.json(
					{ error: "Vui lòng nhập Baidu OCR API Key để sử dụng Cloud OCR này." },
					{ status: 400 },
				);
			}

			try {
				let samplePath = targetPath;
				if (isDirectoryScan && frameDir) {
					const files = fs.readdirSync(frameDir).filter((f) => f.endsWith(".png")).sort();
					if (files.length > 0) samplePath = path.join(frameDir, files[0]);
				}
				const finalImageBuffer = fs.readFileSync(samplePath);
				const base64Image = encodeURIComponent(finalImageBuffer.toString("base64"));
				const apiUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${apiKey}`;

				const res = await fetch(apiUrl, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: `image=${base64Image}`,
				});

				const data = await res.json();
				if (data.words_result) {
					const cues = data.words_result.map((item: any, idx: number) => ({
						id: `baidu-${idx + 1}`,
						startTime: idx * 3.0 + 0.5,
						endTime: idx * 3.0 + 3.0,
						text: item.words || "",
						confidence: 0.99,
					}));
					const merged = await mergeSpeakerLabels(cues);
					return NextResponse.json({
						success: true,
						engine: "Baidu AI Cloud OCR API",
						provider: "Baidu Cloud",
						cues: merged.cues,
						speakers: merged.speakers,
						speakerDiarizationEnabled,
					});
				} else {
					throw new Error(data.error_msg || "Baidu OCR API Error");
				}
			} catch (err: any) {
				return NextResponse.json({ error: `Baidu OCR Error: ${err.message}` }, { status: 500 });
			}
		}

		// 6: OCR.Space Cloud API (Cloud)
		if (engine === "ocr-space") {
			const apiKey = ocrSpaceApiKey.trim() || "helloworld";
			try {
				let samplePath = targetPath;
				if (isDirectoryScan && frameDir) {
					const files = fs.readdirSync(frameDir).filter((f) => f.endsWith(".png")).sort();
					if (files.length > 0) samplePath = path.join(frameDir, files[0]);
				}
				const finalImageBuffer = fs.readFileSync(samplePath);
				const base64Image = `data:image/png;base64,${finalImageBuffer.toString("base64")}`;
				const formData = new URLSearchParams();
				formData.append("apikey", apiKey);
				formData.append("base64Image", base64Image);
				formData.append("language", language === "zh" ? "chs" : language === "vi" ? "vie" : "eng");

				const res = await fetch("https://api.ocr.space/parse/image", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: formData.toString(),
				});

				const data = await res.json();
				if (data.ParsedResults && data.ParsedResults.length > 0) {
					const parsedText = data.ParsedResults[0].ParsedText || "";
					const lines = parsedText.split("\r\n").map((l: string) => l.trim()).filter(Boolean);
					const cues = lines.map((line: string, idx: number) => ({
						id: `ocrspace-${idx + 1}`,
						startTime: idx * 3.0 + 0.5,
						endTime: idx * 3.0 + 3.0,
						text: line,
						confidence: 0.95,
					}));
					const merged = await mergeSpeakerLabels(cues);

					return NextResponse.json({
						success: true,
						engine: "OCR.Space Cloud API",
						provider: "OCR.Space Cloud",
						cues: merged.cues,
						speakers: merged.speakers,
						speakerDiarizationEnabled,
						text: parsedText,
					});
				} else {
					throw new Error(data.ErrorMessage?.[0] || "OCR.Space returned no text");
				}
			} catch (err: any) {
				return NextResponse.json({ error: `OCR.Space Error: ${err.message}` }, { status: 500 });
			}
		}

		return NextResponse.json({ error: "Unknown OCR engine" }, { status: 400 });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || "Failed to process OCR" }, { status: 500 });
	} finally {
		if (diarizationTask) {
			await diarizationTask;
		}
		if (inputTempPath && fs.existsSync(inputTempPath)) {
			try {
				fs.unlinkSync(inputTempPath);
			} catch (_) {}
		}
		if (frameDir && fs.existsSync(frameDir)) {
			try {
				fs.rmSync(frameDir, { recursive: true, force: true });
			} catch (_) {}
		}
		if (diarizationAudioPath && fs.existsSync(diarizationAudioPath)) {
			try {
				fs.unlinkSync(diarizationAudioPath);
			} catch (_) {}
		}
	}
}
