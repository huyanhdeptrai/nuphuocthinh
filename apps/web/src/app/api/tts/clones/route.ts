import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	cloneOmniVoice,
	deleteOmniVoice,
} from "@/dubbing/server/omnivoice-client";
import {
	cloneVieNeuVoice,
	deleteVieNeuVoice,
} from "@/dubbing/server/vieneu-client";
import { cloneElevenLabs } from "@/dubbing/server/cloud-tts-client";
import {
	deleteClonedVoiceSettings,
	saveClonedVoiceSettings,
} from "@/dubbing/server/cloned-voice-settings";

export const runtime = "nodejs";

function readAdjustment({
	value,
	min,
	max,
	fallback,
}: {
	value: FormDataEntryValue | null;
	min: number;
	max: number;
	fallback: number;
}) {
	if (value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
	return parsed;
}

function vieneuEngine(value: FormDataEntryValue | null) {
	return value === "v3" ? "v3" : "v2";
}

export async function POST(request: Request) {
	let tempPath: string | null = null;
	try {
		const form = await request.formData();
		const provider = form.get("provider");
		const name = String(form.get("name") || "").trim();
		const file = form.get("audio");
		const rate = readAdjustment({
			value: form.get("rate"),
			min: 0.5,
			max: 2,
			fallback: 1,
		});
		const pitch = readAdjustment({
			value: form.get("pitch"),
			min: -12,
			max: 12,
			fallback: 0,
		});
		const volumeGain = readAdjustment({
			value: form.get("volumeGain"),
			min: -12,
			max: 12,
			fallback: 0,
		});
		if (
			provider !== "vieneu" &&
			provider !== "elevenlabs" &&
			provider !== "omnivoice"
		) {
			return NextResponse.json(
				{ error: "Engine clone chưa được hỗ trợ." },
				{ status: 400 },
			);
		}
		if (name.length < 2 || name.length > 80) {
			return NextResponse.json(
				{ error: "Tên giọng phải có từ 2 đến 80 ký tự." },
				{ status: 400 },
			);
		}
		if (form.get("consent") !== "true") {
			return NextResponse.json(
				{ error: "Bạn cần xác nhận quyền sử dụng giọng mẫu." },
				{ status: 400 },
			);
		}
		if (!(file instanceof File) || file.size === 0) {
			return NextResponse.json(
				{ error: "Vui lòng chọn file giọng mẫu." },
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
		if (rate === null || pitch === null || volumeGain === null) {
			return NextResponse.json(
				{ error: "Tốc độ, cao độ hoặc âm lượng không hợp lệ." },
				{ status: 400 },
			);
		}
		if (provider === "elevenlabs") {
			const result = await cloneElevenLabs({ name, file });
			saveClonedVoiceSettings({
				provider: "elevenlabs",
				voiceId: result.voiceId,
				rate,
				pitch,
				volumeGain,
			});
			return NextResponse.json({
				success: true,
				name,
				provider,
				voiceId: result.voiceId,
				rate,
				pitch,
				volumeGain,
			});
		}
		tempPath = path.join(
			os.tmpdir(),
			`${provider}-clone-${randomUUID()}${extension}`,
		);
		await fs.writeFile(tempPath, new Uint8Array(await file.arrayBuffer()));
		if (provider === "omnivoice") {
			const result = await cloneOmniVoice({ name, audioPath: tempPath });
			saveClonedVoiceSettings({
				provider: "omnivoice",
				voiceId: name,
				rate,
				pitch,
				volumeGain,
			});
			return NextResponse.json({
				success: true,
				name,
				provider,
				duration: result.duration,
				rate,
				pitch,
				volumeGain,
			});
		}
		const result = await cloneVieNeuVoice({
			name,
			audioPath: tempPath,
			engine: vieneuEngine(form.get("engine")),
		});
		saveClonedVoiceSettings({
			provider: "vieneu",
			voiceId: name,
			rate,
			pitch,
			volumeGain,
		});
		return NextResponse.json({
			success: true,
			name,
			provider,
			duration: result.duration,
			engine: result.engine,
			rate,
			pitch,
			volumeGain,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Không thể tạo giọng clone",
			},
			{ status: 422 },
		);
	} finally {
		if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
	}
}

export async function DELETE(request: Request) {
	try {
		const payload: unknown = await request.json();
		if (typeof payload !== "object" || payload === null) {
			return NextResponse.json(
				{ error: "Dữ liệu xóa giọng không hợp lệ." },
				{ status: 400 },
			);
		}
		const provider = "provider" in payload ? payload.provider : null;
		const name = "voiceId" in payload ? String(payload.voiceId || "").trim() : "";
		if (provider !== "vieneu" && provider !== "omnivoice") {
			return NextResponse.json(
				{ error: "Chỉ hỗ trợ xóa giọng clone VieNeu hoặc OmniVoice." },
				{ status: 400 },
			);
		}
		if (name.length < 2 || name.length > 80) {
			return NextResponse.json(
				{ error: "Tên giọng không hợp lệ." },
				{ status: 400 },
			);
		}
		if (provider === "omnivoice") {
			await deleteOmniVoice({ name });
			deleteClonedVoiceSettings({ provider: "omnivoice", voiceId: name });
			return NextResponse.json({ success: true, provider, name });
		}
		await deleteVieNeuVoice({ name });
		deleteClonedVoiceSettings({ provider: "vieneu", voiceId: name });
		return NextResponse.json({ success: true, provider, name });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Không thể xóa giọng clone",
			},
			{ status: 422 },
		);
	}
}
