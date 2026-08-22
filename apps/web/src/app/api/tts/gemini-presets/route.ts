import { NextResponse } from "next/server";
import { z } from "zod";
import {
	GEMINI_TTS_MODELS,
	GEMINI_TTS_VOICES,
} from "@/dubbing/gemini-tts-options";
import {
	createGeminiTtsPreset,
	deleteGeminiTtsPreset,
	listGeminiTtsPresets,
} from "@/dubbing/server/gemini-tts-presets";

export const runtime = "nodejs";

const presetSchema = z.object({
	name: z.string().trim().min(2).max(80),
	model: z.enum(GEMINI_TTS_MODELS),
	language: z.string().trim().min(2).max(20),
	voice: z.enum(GEMINI_TTS_VOICES),
	styleInstructions: z.string().trim().max(1_500),
	rate: z.number().min(0.5).max(2),
	pitch: z.number().min(-12).max(12),
	volumeGain: z.number().min(-12).max(12),
});

export function GET() {
	return NextResponse.json({ presets: listGeminiTtsPresets() });
}

export async function POST(request: Request) {
	const parsed = presetSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Preset Gemini TTS không hợp lệ." }, { status: 400 });
	}
	return NextResponse.json({ preset: createGeminiTtsPreset(parsed.data) });
}

export async function DELETE(request: Request) {
	const parsed = z
		.object({ id: z.string().uuid() })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "ID preset không hợp lệ." }, { status: 400 });
	}
	if (!deleteGeminiTtsPreset({ id: parsed.data.id })) {
		return NextResponse.json({ error: "Không tìm thấy preset Gemini TTS." }, { status: 404 });
	}
	return NextResponse.json({ success: true });
}

