import { NextResponse } from "next/server";
import { z } from "zod";
import { getTtsEngineStatuses, installTtsEngine, removeTtsEngine } from "@/dubbing/server/tts-engine-runtime";

export const runtime = "nodejs";
const schema = z.object({ engine: z.enum(["vieneu", "supertonic", "omnivoice"]), action: z.enum(["install", "remove", "reinstall"]) });
export async function GET() { return NextResponse.json(await getTtsEngineStatuses()); }
export async function POST(request: Request) {
	const parsed = schema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
	try { if (parsed.data.action === "remove") return NextResponse.json(await removeTtsEngine(parsed.data.engine)); if (parsed.data.action === "reinstall") await removeTtsEngine(parsed.data.engine); return NextResponse.json(await installTtsEngine(parsed.data.engine)); }
	catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xử lý gói giọng." }, { status: 400 }); }
}
