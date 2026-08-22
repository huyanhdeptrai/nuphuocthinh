import "server-only";
import { getTtsApiKey } from "./tts-credentials";
import { extractGeminiTtsAudio } from "./gemini-tts-response";
import { getGeminiTtsPreset } from "./gemini-tts-presets";

export type CloudVoice = {
	voiceId: string;
	name: string;
	description: string;
	gender: "male" | "female" | "unknown";
	region: string;
	previewUrl?: string;
	isCloned?: boolean;
};

const GEMINI_VOICES = [
	["Zephyr", "Sáng"], ["Puck", "Sôi nổi"], ["Charon", "Thông tin"], ["Kore", "Vững vàng"],
	["Fenrir", "Hào hứng"], ["Leda", "Trẻ trung"], ["Orus", "Vững vàng"], ["Aoede", "Nhẹ nhàng"],
	["Callirrhoe", "Thoải mái"], ["Autonoe", "Sáng"], ["Enceladus", "Hơi thở"], ["Iapetus", "Rõ ràng"],
	["Umbriel", "Thoải mái"], ["Algieba", "Mượt"], ["Despina", "Mượt"], ["Erinome", "Rõ ràng"],
	["Algenib", "Khàn"], ["Rasalgethi", "Thông tin"], ["Laomedeia", "Sôi nổi"], ["Achernar", "Mềm"],
	["Alnilam", "Vững vàng"], ["Schedar", "Cân bằng"], ["Gacrux", "Trưởng thành"], ["Pulcherrima", "Trực diện"],
	["Achird", "Thân thiện"], ["Zubenelgenubi", "Tự nhiên"], ["Vindemiatrix", "Dịu dàng"],
	["Sadachbia", "Sinh động"], ["Sadaltager", "Hiểu biết"], ["Sulafat", "Ấm áp"],
] as const;

function apiError({ status, body }: { status: number; body: string }) {
	let message = body.slice(0, 500);
	try {
		const decoded: unknown = JSON.parse(body);
		if (typeof decoded === "object" && decoded !== null && "detail" in decoded) message = JSON.stringify(decoded.detail);
		if (typeof decoded === "object" && decoded !== null && "error" in decoded) message = JSON.stringify(decoded.error);
	} catch { /* keep response text */ }
	return new Error(`TTS API HTTP ${status}: ${message}`);
}

export function geminiConfigured() { return Boolean(getTtsApiKey("gemini")); }
export function elevenLabsConfigured() { return Boolean(getTtsApiKey("elevenlabs")); }

export function listGeminiVoices(): CloudVoice[] {
	return GEMINI_VOICES.map(([name, style]) => ({ voiceId: name, name, description: `Gemini TTS · ${style}`, gender: "unknown", region: "Đa ngôn ngữ" }));
}

export async function listElevenLabsVoices(): Promise<CloudVoice[]> {
	const apiKey = getTtsApiKey("elevenlabs");
	if (!apiKey) return [];
	const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true", {
		headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(30_000), cache: "no-store",
	});
	const body = await response.text();
	if (!response.ok) throw apiError({ status: response.status, body });
	const decoded: unknown = JSON.parse(body);
	if (typeof decoded !== "object" || decoded === null || !("voices" in decoded) || !Array.isArray(decoded.voices)) return [];
	return decoded.voices.flatMap((item): CloudVoice[] => {
		if (typeof item !== "object" || item === null || !("voice_id" in item) || typeof item.voice_id !== "string") return [];
		const labels = "labels" in item && typeof item.labels === "object" && item.labels !== null ? item.labels : {};
		const gender = "gender" in labels && (labels.gender === "male" || labels.gender === "female") ? labels.gender : "unknown";
		const category = "category" in item && typeof item.category === "string" ? item.category : "voice";
		return [{
			voiceId: item.voice_id,
			name: "name" in item && typeof item.name === "string" ? item.name : item.voice_id,
			description: "description" in item && typeof item.description === "string" ? item.description : `ElevenLabs · ${category}`,
			gender,
			region: "accent" in labels && typeof labels.accent === "string" ? labels.accent : "Đa ngôn ngữ",
			previewUrl: "preview_url" in item && typeof item.preview_url === "string" ? item.preview_url : undefined,
			isCloned: category === "cloned" || category === "professional",
		}];
	});
}

export async function synthesizeElevenLabs({ text, voiceId }: { text: string; voiceId: string }) {
	const apiKey = getTtsApiKey("elevenlabs");
	if (!apiKey) throw new Error("Chưa cấu hình ELEVENLABS_API_KEY trong .env.local");
	const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
		method: "POST",
		headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
		signal: AbortSignal.timeout(120_000),
	});
	if (!response.ok) throw apiError({ status: response.status, body: await response.text() });
	return new Uint8Array(await response.arrayBuffer());
}

export async function cloneElevenLabs({ name, file }: { name: string; file: File }) {
	const apiKey = getTtsApiKey("elevenlabs");
	if (!apiKey) throw new Error("Chưa cấu hình ELEVENLABS_API_KEY trong .env.local");
	const form = new FormData();
	form.set("name", name);
	form.append("files", file, file.name);
	form.set("remove_background_noise", "false");
	form.set("description", "Tạo từ Kho giọng LONGTIENGVIDEO");
	const response = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": apiKey }, body: form, signal: AbortSignal.timeout(120_000) });
	const body = await response.text();
	if (!response.ok) throw apiError({ status: response.status, body });
	const decoded: unknown = JSON.parse(body);
	const voiceId =
		typeof decoded === "object" &&
		decoded !== null &&
		"voice_id" in decoded &&
		typeof decoded.voice_id === "string"
			? decoded.voice_id
			: null;
	if (!voiceId) throw new Error("ElevenLabs không trả về voice_id sau khi clone.");
	return { voiceId };
}

export async function deleteElevenLabsVoice({ voiceId }: { voiceId: string }) {
	const apiKey = getTtsApiKey("elevenlabs");
	if (!apiKey) throw new Error("Chưa cấu hình ELEVENLABS_API_KEY trong .env.local");
	const response = await fetch(
		`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
		{
			method: "DELETE",
			headers: { "xi-api-key": apiKey },
			signal: AbortSignal.timeout(30_000),
		},
	);
	if (!response.ok && response.status !== 404) {
		throw apiError({ status: response.status, body: await response.text() });
	}
}

function pcmToWav({ pcm, sampleRate = 24_000 }: { pcm: Uint8Array; sampleRate?: number }) {
	const buffer = new ArrayBuffer(44 + pcm.byteLength);
	const view = new DataView(buffer);
	const write = ({ offset, value }: { offset: number; value: string }) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
	write({ offset: 0, value: "RIFF" }); view.setUint32(4, 36 + pcm.byteLength, true); write({ offset: 8, value: "WAVE" }); write({ offset: 12, value: "fmt " });
	view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write({ offset: 36, value: "data" }); view.setUint32(40, pcm.byteLength, true);
	new Uint8Array(buffer, 44).set(pcm);
	return new Uint8Array(buffer);
}

export async function synthesizeGemini({
	text,
	voiceId,
	styleInstructions,
	language,
	model,
}: {
	text: string;
	voiceId: string;
	styleInstructions?: string;
	language?: string;
	model?: string;
}) {
	const apiKey = getTtsApiKey("gemini");
	const preset = getGeminiTtsPreset({ id: voiceId });
	const resolvedLanguage = language || preset?.language;
	const resolvedStyle =
		styleInstructions ?? preset?.styleInstructions ?? "Natural, clear narration.";
	const input = resolvedLanguage
		? `Synthesize the following transcript in ${resolvedLanguage}.\nStyle instructions: ${resolvedStyle}\n\nTranscript:\n${text}`
		: text;
	if (!apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY trong .env.local");
	const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
		method: "POST",
		headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({
			model: model || preset?.model || "gemini-3.1-flash-tts-preview",
			input,
			response_format: { type: "audio" },
			generation_config: { speech_config: [{ voice: preset?.voice ?? voiceId }] },
		}),
		signal: AbortSignal.timeout(180_000),
	});
	const body = await response.text();
	if (!response.ok) throw apiError({ status: response.status, body });
	const decoded: unknown = JSON.parse(body);
	const audio = extractGeminiTtsAudio({ response: decoded });
	if (audio) {
		const pcm = new Uint8Array(Buffer.from(audio.data, "base64"));
		if (pcm.byteLength > 0) {
			return pcmToWav({ pcm, sampleRate: audio.sampleRate });
		}
	}
	if (typeof decoded !== "object" || decoded === null || !("output_audio" in decoded) || typeof decoded.output_audio !== "object" || decoded.output_audio === null || !("data" in decoded.output_audio) || typeof decoded.output_audio.data !== "string") throw new Error("Gemini không trả về dữ liệu âm thanh");
	return pcmToWav({ pcm: new Uint8Array(Buffer.from(decoded.output_audio.data, "base64")) });
}

