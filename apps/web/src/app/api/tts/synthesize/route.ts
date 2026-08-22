import { EdgeTTS, Constants } from "@andresaya/edge-tts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeCapCutVoice } from "@/dubbing/server/capcut-client";
import fs from "node:fs/promises";
import { synthesizeVieNeuVoice } from "@/dubbing/server/vieneu-client";
import { synthesizeSupertonicVoice } from "@/dubbing/server/supertonic-client";
import { synthesizeOmniVoice } from "@/dubbing/server/omnivoice-client";
import { synthesizeElevenLabs, synthesizeGemini } from "@/dubbing/server/cloud-tts-client";
import { getGeminiTtsPreset } from "@/dubbing/server/gemini-tts-presets";
import { getClonedVoiceSettings } from "@/dubbing/server/cloned-voice-settings";
import {
	applyVoiceAdjustments,
	probeAudioDuration,
} from "@/dubbing/server/audio-processing";

export const runtime = "nodejs";

const requestSchema = z.object({
	provider: z.enum(["edge-tts", "capcut", "vieneu", "supertonic", "omnivoice", "elevenlabs", "gemini"]),
	voiceId: z.string().trim().min(1).max(200),
	text: z.string().trim().min(1).max(1_500),
	rate: z.number().min(0.5).max(2).optional(),
	pitch: z.number().min(-12).max(12).optional(),
	volumeGain: z.number().min(-12).max(12).optional(),
	targetDuration: z.number().min(0.1).max(3_600).optional(),
});

const MIN_AUTO_MATCH_RATE = 0.2;
const MAX_AUTO_MATCH_RATE = 5;

function clampAutoMatchRate(rate: number) {
	return Math.min(MAX_AUTO_MATCH_RATE, Math.max(MIN_AUTO_MATCH_RATE, rate));
}

function rateToEdgePercentage(rate: number | undefined) {
	const percentage = Math.round(((rate ?? 1) - 1) * 100);
	return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

async function synthesizeEdge({
	input,
	nativeRate,
}: {
	input: z.infer<typeof requestSchema>;
	nativeRate: number;
}) {
	const maxRetries = 3;
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const edgeTts = new EdgeTTS();
			await edgeTts.synthesize(input.text, input.voiceId, {
				rate: rateToEdgePercentage(nativeRate),
				outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
			});
			const buf = edgeTts.toBuffer();
			if (buf && buf.length > 0) {
				return new Uint8Array(buf);
			}
		} catch (err) {
			lastError = err;
			if (attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, 300 * attempt));
			}
		}
	}
	throw (
		lastError ||
		new Error("Không thể kết nối máy chủ Edge TTS. Vui lòng thử lại.")
	);
}

async function synthesizeCapCut({
	input,
	nativeRate,
}: {
	input: z.infer<typeof requestSchema>;
	nativeRate: number;
}) {
	const result = await synthesizeCapCutVoice({
		text: input.text,
		voice: input.voiceId,
		rate: nativeRate,
	});
	const audioUrl = new URL(result.audio_url);
	if (audioUrl.protocol !== "https:") {
		throw new Error("CapCut returned an invalid audio URL");
	}
	const response = await fetch(audioUrl, {
		signal: AbortSignal.timeout(60_000),
	});
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300);
		throw new Error(
			`CapCut TTS returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
		);
	}
	return new Uint8Array(await response.arrayBuffer());
}

async function readTemporaryAudio(audioPath: string) {
	try {
		return new Uint8Array(await fs.readFile(audioPath));
	} finally {
		await fs.unlink(audioPath).catch(() => undefined);
	}
}

async function synthesizeAtRate({
	input,
	nativeRate,
}: {
	input: z.infer<typeof requestSchema>;
	nativeRate: number;
}): Promise<{ audio: Uint8Array; contentType: string }> {
	if (input.provider === "edge-tts") {
		return {
			audio: await synthesizeEdge({ input, nativeRate }),
			contentType: "audio/mpeg",
		};
	}
	if (input.provider === "capcut") {
		return {
			audio: await synthesizeCapCut({ input, nativeRate }),
			contentType: "audio/mpeg",
		};
	}
	if (input.provider === "vieneu") {
		return {
			audio: await readTemporaryAudio(
				await synthesizeVieNeuVoice({ text: input.text, voice: input.voiceId }),
			),
			contentType: "audio/wav",
		};
	}
	if (input.provider === "supertonic") {
		return {
			audio: await readTemporaryAudio(
				await synthesizeSupertonicVoice({
					text: input.text,
					voice: input.voiceId,
					rate: nativeRate,
				}),
			),
			contentType: "audio/wav",
		};
	}
	if (input.provider === "omnivoice") {
		return {
			audio: await readTemporaryAudio(
				await synthesizeOmniVoice({ text: input.text, voice: input.voiceId }),
			),
			contentType: "audio/wav",
		};
	}
	if (input.provider === "elevenlabs") {
		return {
			audio: await synthesizeElevenLabs({
				text: input.text,
				voiceId: input.voiceId,
			}),
			contentType: "audio/mpeg",
		};
	}
	return {
		audio: await synthesizeGemini({
			text: input.text,
			voiceId: input.voiceId,
		}),
		contentType: "audio/wav",
	};
}

function nativeRateRange(provider: z.infer<typeof requestSchema>["provider"]) {
	if (provider === "supertonic") return { min: 0.7, max: 2 };
	return null;
}

function clamp({ value, min, max }: { value: number; min: number; max: number }) {
	return Math.min(max, Math.max(min, value));
}

export async function POST(request: Request) {
	const startedAt = performance.now();
	const parsed = requestSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Dữ liệu tạo giọng không hợp lệ" },
			{ status: 400 },
		);
	}

	const cleanVoiceId = parsed.data.voiceId.replace(
		/^(edge-tts|capcut|vieneu|supertonic|omnivoice|elevenlabs|gemini):/,
		"",
	);
	const sanitizedInput = {
		...parsed.data,
		voiceId: cleanVoiceId,
	};

	const geminiPreset =
		sanitizedInput.provider === "gemini"
			? getGeminiTtsPreset({ id: sanitizedInput.voiceId })
			: null;
	const clonedSettings = getClonedVoiceSettings({
		provider: sanitizedInput.provider,
		voiceId: sanitizedInput.voiceId,
	});
	const rate = sanitizedInput.rate ?? geminiPreset?.rate ?? clonedSettings?.rate ?? 1;
	const pitch =
		sanitizedInput.pitch ?? geminiPreset?.pitch ?? clonedSettings?.pitch ?? 0;
	const volumeGain =
		sanitizedInput.volumeGain ??
		geminiPreset?.volumeGain ??
		clonedSettings?.volumeGain ??
		0;

	try {
		let { audio, contentType } = await synthesizeAtRate({
			input: sanitizedInput,
			nativeRate: 1,
		});
		let sourceDuration: number | undefined;
		let outputDuration: number | undefined;
		let appliedRate = rate;
		let nativeRateUsed = 1;
		let postProcessRate = rate;
		if (sanitizedInput.targetDuration !== undefined) {
			sourceDuration = await probeAudioDuration({ audio });
			appliedRate = clampAutoMatchRate(
				sourceDuration / sanitizedInput.targetDuration,
			);
			outputDuration = sourceDuration / appliedRate;
			const nativeRange = nativeRateRange(sanitizedInput.provider);
			if (nativeRange) {
				nativeRateUsed = clamp({
					value: appliedRate,
					min: nativeRange.min,
					max: nativeRange.max,
				});
				if (Math.abs(nativeRateUsed - 1) >= 0.001) {
					const nativeSynthesis = await synthesizeAtRate({
						input: sanitizedInput,
						nativeRate: nativeRateUsed,
					});
					audio = nativeSynthesis.audio;
					contentType = nativeSynthesis.contentType;
				}
				const nativeDuration = await probeAudioDuration({ audio });
				postProcessRate = nativeDuration / outputDuration;
			} else {
				postProcessRate = appliedRate;
			}
		}
		if (
			Math.abs(pitch) >= 0.01 ||
			Math.abs(postProcessRate - 1) >= 0.001 ||
			Math.abs(volumeGain) >= 0.01 ||
			outputDuration !== undefined
		) {
			audio = await applyVoiceAdjustments({
				audio,
				rate: postProcessRate,
				semitones: pitch,
				volumeGain,
				outputDuration,
			});
			contentType = "audio/wav";
		}

		const responseBody = new ArrayBuffer(audio.byteLength);
		new Uint8Array(responseBody).set(audio);
			return new Response(responseBody, {
				headers: {
				"Cache-Control": "private, no-store",
				"Content-Type": contentType,
				"Content-Length": String(audio.byteLength),
				"Server-Timing": `tts;dur=${(performance.now() - startedAt).toFixed(0)}`,
				...(sourceDuration !== undefined
					? {
							"X-TTS-Source-Duration": sourceDuration.toFixed(6),
							"X-TTS-Applied-Rate": appliedRate.toFixed(6),
							"X-TTS-Output-Duration": outputDuration?.toFixed(6) ?? "",
							"X-TTS-Native-Rate": nativeRateUsed.toFixed(6),
							"X-TTS-Post-Rate": postProcessRate.toFixed(6),
						}
					: {}),
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Không thể tạo giọng đọc",
			},
			{ status: 502 },
		);
	}
}
