import { NextResponse } from "next/server";
import { EdgeTTS } from "@andresaya/edge-tts";
import type { TtsProvider, VoiceCatalogItem } from "@/dubbing/types";
import { listCapCutVoices } from "@/dubbing/server/capcut-client";
import { listVieNeuVoices } from "@/dubbing/server/vieneu-client";
import { listSupertonicVoices, supertonicConfigured } from "@/dubbing/server/supertonic-client";
import { getOmniVoiceStatus, listOmniVoices } from "@/dubbing/server/omnivoice-client";
import { elevenLabsConfigured, geminiConfigured, listElevenLabsVoices } from "@/dubbing/server/cloud-tts-client";
import { listGeminiTtsPresets } from "@/dubbing/server/gemini-tts-presets";
import { getClonedVoiceSettings } from "@/dubbing/server/cloned-voice-settings";

export const runtime = "nodejs";

type EdgeVoice = {
	ShortName: string;
	LocalName?: string;
	FriendlyName?: string;
	Gender?: string;
	Locale?: string;
};

const CAPCUT_VIETNAMESE_FALLBACK: Array<{
	voiceId: string;
	name: string;
	gender: "male" | "female";
	region: string;
}> = [
	{
		voiceId: "vi_female_huong",
		name: "Hương",
		gender: "female",
		region: "Bắc",
	},
	{
		voiceId: "BV421_vivn_streaming",
		name: "Ngọt Ngào",
		gender: "female",
		region: "Nam",
	},
	{
		voiceId: "BV562_streaming",
		name: "Chí Mai",
		gender: "female",
		region: "Bắc",
	},
	{
		voiceId: "BV074_streaming",
		name: "Dễ Thương",
		gender: "female",
		region: "Nam",
	},
	{
		voiceId: "BV560_streaming",
		name: "Anh Dũng",
		gender: "male",
		region: "Bắc",
	},
	{ voiceId: "BV075_streaming", name: "Tự Tin", gender: "male", region: "Nam" },
	{ voiceId: "Trung_Caha", name: "Trung Caha", gender: "male", region: "Nam" },
	{ voiceId: "Nam_Tram", name: "Nam Trầm", gender: "male", region: "Nam" },
	{ voiceId: "Ly_Nam", name: "Ly Nam", gender: "female", region: "Nam" },
	{ voiceId: "Duy_Bac", name: "Duy Bắc", gender: "male", region: "Bắc" },
	{ voiceId: "Ha_Nu", name: "Hà Nữ", gender: "female", region: "Bắc" },
	{ voiceId: "Sai_Nu", name: "Sài Nữ", gender: "female", region: "Nam" },
];

function sampleTextForLanguage(language: string) {
	const baseLanguage = language.toLowerCase().split("-")[0];
	const samples: Record<string, string> = {
		vi: "Xin chào, đây là giọng đọc thử cho phần thuyết minh.",
		en: "Hello, this is a voice preview for your narration.",
		zh: "你好，这是用于旁白的试听声音。",
		ja: "こんにちは、これはナレーション用の音声サンプルです。",
		ko: "안녕하세요. 내레이션에 사용할 음성 미리듣기입니다.",
		fr: "Bonjour, voici un aperçu de la voix de narration.",
		de: "Hallo, dies ist eine Vorschau der Erzählerstimme.",
		es: "Hola, esta es una muestra de la voz de narración.",
	};
	return samples[baseLanguage] ?? samples.en;
}

function normalizeGender(value: string | undefined) {
	if (/female|nữ|woman|girl/i.test(value ?? "")) return "female" as const;
	if (/male|nam|man|boy/i.test(value ?? "")) return "male" as const;
	return "unknown" as const;
}

async function loadEdgeVoices(): Promise<VoiceCatalogItem[]> {
	const edgeTts = new EdgeTTS();
	const voices: EdgeVoice[] = await edgeTts.getVoices();

	return voices.map((voice) => {
		const language = voice.Locale || voice.ShortName.slice(0, 5);
		return {
			id: `edge-tts:${voice.ShortName}`,
			voiceId: voice.ShortName,
			name: voice.LocalName || voice.ShortName,
			provider: "edge-tts",
			gender: normalizeGender(voice.Gender),
			lang: language,
			region: language.split("-")[1]?.toUpperCase() || "",
			description: voice.FriendlyName || "Microsoft Edge neural voice",
			sampleText: sampleTextForLanguage(language),
			available: true,
		};
	});
}

async function loadCapCutVoices(): Promise<VoiceCatalogItem[]> {
	const speakers = (await listCapCutVoices()).filter(
		(speaker) => !/Neural$/i.test(speaker.voice_type),
	);
	return speakers.map((speaker) => {
		const voiceId = speaker.voice_type;
		const language = speaker.lang || speaker.lan || "und";
		const displayGender = normalizeGender(speaker.display_name);
		return {
			id: `capcut:${voiceId}`,
			voiceId,
			name: speaker.display_name || voiceId,
			provider: "capcut",
			gender:
				displayGender === "unknown" ? normalizeGender(voiceId) : displayGender,
			lang: language,
			region: language.split("-")[1]?.toUpperCase() || "",
			description: `CapCut AI voice · ${speaker.resource_id}`,
			sampleText: sampleTextForLanguage(language),
			available: true,
		};
	});
}

function loadVieNeuCatalog(): VoiceCatalogItem[] {
	return listVieNeuVoices().map((voice) => {
		const settings = voice.cloned
			? getClonedVoiceSettings({ provider: "vieneu", voiceId: voice.name })
			: null;
		return {
			id: `vieneu:${voice.name}`,
			voiceId: voice.name,
			name: voice.name,
			provider: "vieneu",
			gender: voice.gender,
			lang: "vi-VN",
			region: voice.region,
			description: voice.description,
			sampleText: sampleTextForLanguage("vi"),
			available: true,
			isCloned: voice.cloned,
			defaultRate: settings?.rate,
			defaultPitch: settings?.pitch,
			defaultVolumeGain: settings?.volumeGain,
		};
	});
}

function loadSupertonicCatalog(): VoiceCatalogItem[] {
	return listSupertonicVoices().map((voice) => ({
		id: `supertonic:${voice.voiceId}`,
		voiceId: voice.voiceId,
		name: voice.name,
		provider: "supertonic",
		gender: voice.gender,
		lang: "vi-VN",
		region: "Đa ngôn ngữ",
		description: voice.description,
		sampleText: sampleTextForLanguage("vi"),
		available: true,
	}));
}

function loadOmniVoiceCatalog(): VoiceCatalogItem[] {
	const status = getOmniVoiceStatus();
	const available = status.enabled && status.installed && status.gpuAvailable;
	return listOmniVoices().map((voice) => {
		const settings = voice.cloned
			? getClonedVoiceSettings({
					provider: "omnivoice",
					voiceId: voice.voiceId,
				})
			: null;
		return {
			id: `omnivoice:${voice.voiceId}`,
			voiceId: voice.voiceId,
			name: voice.name,
			provider: "omnivoice",
			gender: voice.gender,
			lang: "vi-VN",
			region: voice.cloned ? "Clone" : "Thiết kế",
			description: voice.description,
			sampleText: sampleTextForLanguage("vi"),
			available,
			isCloned: voice.cloned,
			defaultRate: settings?.rate,
			defaultPitch: settings?.pitch,
			defaultVolumeGain: settings?.volumeGain,
		};
	});
}

export async function GET(request: Request) {
	const providerParam = new URL(request.url).searchParams.get("provider");
	const requestedProvider: TtsProvider | null =
		providerParam === "edge-tts" ||
		providerParam === "capcut" ||
		providerParam === "vieneu" ||
		providerParam === "supertonic" ||
		providerParam === "omnivoice" ||
		providerParam === "elevenlabs" ||
		providerParam === "gemini"
			? providerParam
			: null;

	try {
		let capcutConnected = false;
		let capcutError: string | null = null;
		const skipEdge = requestedProvider !== null && requestedProvider !== "edge-tts";
		const skipCapCut = requestedProvider !== null && requestedProvider !== "capcut";
		const [edgeVoices, capCutVoices, elevenVoices] = await Promise.all([
			skipEdge ? Promise.resolve([]) : loadEdgeVoices(),
			skipCapCut
				? Promise.resolve([])
				: loadCapCutVoices()
						.then((voices) => {
							capcutConnected = true;
							return voices;
						})
						.catch((error) => {
							capcutError =
								error instanceof Error ? error.message : "Unknown CapCut error";
							console.error("Failed to load K07VN CapCut voice catalog", error);
							return CAPCUT_VIETNAMESE_FALLBACK.map((voice) => ({
								id: `capcut:${voice.voiceId}`,
								voiceId: voice.voiceId,
								name: voice.name,
								provider: "capcut" as const,
								gender: voice.gender,
								lang: "vi-VN",
								region: voice.region,
								description: "CapCut TTS service hiện chưa kết nối",
								sampleText: sampleTextForLanguage("vi"),
								available: false,
							}));
						}),
			requestedProvider !== null && requestedProvider !== "elevenlabs"
				? Promise.resolve([])
				: listElevenLabsVoices().catch((error) => {
						console.error("Failed to load ElevenLabs voices", error);
						return [];
					}),
		]);

		const vieneuVoices =
			requestedProvider !== null && requestedProvider !== "vieneu"
				? []
				: loadVieNeuCatalog();
		const supertonicVoices =
			requestedProvider !== null && requestedProvider !== "supertonic"
				? []
				: loadSupertonicCatalog();
		const omnivoiceVoices =
			requestedProvider !== null && requestedProvider !== "omnivoice"
				? []
				: loadOmniVoiceCatalog();
		const geminiVoices: VoiceCatalogItem[] =
			requestedProvider !== null && requestedProvider !== "gemini"
				? []
				: listGeminiTtsPresets().map((preset) => ({
						id: `gemini:${preset.id}`,
						voiceId: preset.id,
						name: preset.name,
						provider: "gemini",
						gender: "unknown",
						lang: preset.language,
						region: preset.model,
						description: preset.styleInstructions || "Gemini TTS preset",
						sampleText: sampleTextForLanguage(preset.language),
						available: geminiConfigured(),
						isCloned: true,
						defaultRate: preset.rate,
						defaultPitch: preset.pitch,
						defaultVolumeGain: preset.volumeGain,
					}));
		const elevenCatalog: VoiceCatalogItem[] = elevenVoices.map((voice) => {
			const settings = voice.isCloned
				? getClonedVoiceSettings({
						provider: "elevenlabs",
						voiceId: voice.voiceId,
					})
				: null;
			return {
				id: `elevenlabs:${voice.voiceId}`,
				voiceId: voice.voiceId,
				name: voice.name,
				provider: "elevenlabs",
				gender: voice.gender,
				lang: "vi-VN",
				region: voice.region,
				description: voice.description,
				sampleText: sampleTextForLanguage("vi"),
				available: true,
				isCloned: voice.isCloned,
				defaultRate: settings?.rate,
				defaultPitch: settings?.pitch,
				defaultVolumeGain: settings?.volumeGain,
			};
		});
		const omnivoiceStatus = getOmniVoiceStatus();
		return NextResponse.json({
			voices: [
				...edgeVoices,
				...capCutVoices,
				...vieneuVoices,
				...supertonicVoices,
				...omnivoiceVoices,
				...elevenCatalog,
				...geminiVoices,
			],
			capcutConfigured: capcutConnected,
			vieneuConfigured: vieneuVoices.length > 0,
			supertonicConfigured: supertonicConfigured(),
			omnivoiceConfigured:
				omnivoiceStatus.enabled &&
				omnivoiceStatus.installed &&
				omnivoiceStatus.gpuAvailable,
			elevenlabsConfigured: elevenLabsConfigured(),
			geminiConfigured: geminiConfigured(),
			...(process.env.NODE_ENV === "development" && capcutError
				? { capcutError }
				: {}),
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Không thể tải kho giọng",
			},
			{ status: 502 },
		);
	}
}
