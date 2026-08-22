import { NextResponse } from "next/server";
import { z } from "zod";
import { getTtsCredentialStatus, saveTtsApiKeys } from "@/dubbing/server/tts-credentials";
import { getOmniVoiceStatus } from "@/dubbing/server/omnivoice-client";
import { saveTtsProviderConfig } from "@/dubbing/server/tts-provider-config";

export const runtime = "nodejs";

const updateSchema = z.object({
	gemini: z.string().trim().min(10).max(500).nullable().optional(),
	elevenlabs: z.string().trim().min(10).max(500).nullable().optional(),
	omnivoiceEnabled: z.boolean().optional(),
});

export function GET() {
	return NextResponse.json({
		...getTtsCredentialStatus(),
		omnivoice: getOmniVoiceStatus(),
	});
}

export async function POST(request: Request) {
	const parsed = updateSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "API key không hợp lệ." }, { status: 400 });
	saveTtsApiKeys({
		...(parsed.data.gemini !== undefined ? { gemini: parsed.data.gemini } : {}),
		...(parsed.data.elevenlabs !== undefined ? { elevenlabs: parsed.data.elevenlabs } : {}),
	});
	saveTtsProviderConfig({
		...(typeof parsed.data.omnivoiceEnabled === "boolean"
			? { omnivoiceEnabled: parsed.data.omnivoiceEnabled }
			: {}),
	});
	return NextResponse.json({
		...getTtsCredentialStatus(),
		omnivoice: getOmniVoiceStatus(),
	});
}
