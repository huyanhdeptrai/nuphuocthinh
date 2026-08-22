import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyVoiceAdjustments } from "@/dubbing/server/audio-processing";
import {
	cloneElevenLabs,
	deleteElevenLabsVoice,
	synthesizeElevenLabs,
	synthesizeGemini,
} from "@/dubbing/server/cloud-tts-client";
import { previewCloneOmniVoice } from "@/dubbing/server/omnivoice-client";
import { previewCloneVieNeuVoice } from "@/dubbing/server/vieneu-client";

export const runtime = "nodejs";

const PREVIEW_TEXT = "Xin chào, đây là giọng đọc thử cho phần thuyết minh.";

const geminiSchema = z.object({
	provider: z.literal("gemini"),
	text: z.string().trim().min(1).max(1_500).optional(),
	voice: z.string().trim().min(1).max(80),
	model: z.string().trim().min(1).max(80),
	language: z.string().trim().min(2).max(20),
	styleInstructions: z.string().trim().max(1_500).optional(),
	rate: z.number().min(0.5).max(2).optional(),
	pitch: z.number().min(-12).max(12).optional(),
	volumeGain: z.number().min(-12).max(12).optional(),
});

async function readTemporaryAudio(audioPath: string) {
	try {
		return new Uint8Array(await fs.readFile(audioPath));
	} finally {
		await fs.unlink(audioPath).catch(() => undefined);
	}
}

async function adjustPreview({
	audio,
	rate,
	pitch,
	volumeGain,
}: {
	audio: Uint8Array;
	rate: number;
	pitch: number;
	volumeGain: number;
}) {
	if (
		Math.abs(rate - 1) < 0.001 &&
		Math.abs(pitch) < 0.01 &&
		Math.abs(volumeGain) < 0.01
	) {
		return audio;
	}
	return applyVoiceAdjustments({
		audio,
		rate,
		semitones: pitch,
		volumeGain,
	});
}

function audioResponse({
	audio,
	contentType,
}: {
	audio: Uint8Array;
	contentType: string;
}) {
	const body = new ArrayBuffer(audio.byteLength);
	new Uint8Array(body).set(audio);
	return new Response(body, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Type": contentType,
			"Content-Length": String(audio.byteLength),
		},
	});
}

function vieneuEngine(value: FormDataEntryValue | null) {
	return value === "v3" ? "v3" : "v2";
}

export async function POST(request: Request) {
	let tempPath: string | null = null;
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const parsed = geminiSchema.safeParse(
				await request.json().catch(() => null),
			);
			if (!parsed.success) {
				return NextResponse.json(
					{ error: "Dữ liệu nghe thử Gemini không hợp lệ." },
					{ status: 400 },
				);
			}
			const audio = await adjustPreview({
				audio: await synthesizeGemini({
					text: parsed.data.text || PREVIEW_TEXT,
					voiceId: parsed.data.voice,
					model: parsed.data.model,
					language: parsed.data.language,
					styleInstructions: parsed.data.styleInstructions,
				}),
				rate: parsed.data.rate ?? 1,
				pitch: parsed.data.pitch ?? 0,
				volumeGain: parsed.data.volumeGain ?? 0,
			});
			return audioResponse({ audio, contentType: "audio/wav" });
		}

		const form = await request.formData();
		const provider = form.get("provider");
		const file = form.get("audio");
		const text = String(form.get("text") || PREVIEW_TEXT).trim() || PREVIEW_TEXT;
		const rate = Number(form.get("rate") || 1);
		const pitch = Number(form.get("pitch") || 0);
		const volumeGain = Number(form.get("volumeGain") || 0);
		if (
			provider !== "vieneu" &&
			provider !== "elevenlabs" &&
			provider !== "omnivoice"
		) {
			return NextResponse.json(
				{ error: "Engine nghe thử clone chưa được hỗ trợ." },
				{ status: 400 },
			);
		}
		if (!(file instanceof File) || file.size === 0) {
			return NextResponse.json(
				{ error: "Vui lòng chọn file giọng mẫu trước khi nghe thử." },
				{ status: 400 },
			);
		}
		if (file.size > 20 * 1024 * 1024) {
			return NextResponse.json(
				{ error: "File giọng mẫu không được vượt quá 20 MB." },
				{ status: 400 },
			);
		}
		const extension = path.extname(file.name).toLowerCase();
		if (![".wav", ".mp3"].includes(extension)) {
			return NextResponse.json(
				{ error: "Chỉ hỗ trợ file WAV hoặc MP3." },
				{ status: 400 },
			);
		}
		if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) {
			return NextResponse.json(
				{ error: "Tốc độ nghe thử phải từ 0.5× đến 2×." },
				{ status: 400 },
			);
		}

		if (provider === "elevenlabs") {
			const cloned = await cloneElevenLabs({
				name: `preview-${randomUUID().slice(0, 8)}`,
				file,
			});
			try {
				const audio = await adjustPreview({
					audio: await synthesizeElevenLabs({
						text,
						voiceId: cloned.voiceId,
					}),
					rate,
					pitch: Number.isFinite(pitch) ? pitch : 0,
					volumeGain: Number.isFinite(volumeGain) ? volumeGain : 0,
				});
				return audioResponse({ audio, contentType: "audio/mpeg" });
			} finally {
				await deleteElevenLabsVoice({ voiceId: cloned.voiceId }).catch(
					() => undefined,
				);
			}
		}

		tempPath = path.join(
			os.tmpdir(),
			`${provider}-preview-${randomUUID()}${extension}`,
		);
		await fs.writeFile(tempPath, new Uint8Array(await file.arrayBuffer()));
		const previewPath =
			provider === "omnivoice"
				? await previewCloneOmniVoice({ audioPath: tempPath, text })
				: await previewCloneVieNeuVoice({
						audioPath: tempPath,
						text,
						engine: vieneuEngine(form.get("engine")),
					});
		const audio = await adjustPreview({
			audio: await readTemporaryAudio(previewPath),
			rate,
			pitch: Number.isFinite(pitch) ? pitch : 0,
			volumeGain: Number.isFinite(volumeGain) ? volumeGain : 0,
		});
		return audioResponse({ audio, contentType: "audio/wav" });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Không thể nghe thử giọng clone",
			},
			{ status: 422 },
		);
	} finally {
		if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
	}
}
