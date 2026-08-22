import type { TtsProvider, VoiceCatalogItem } from "../types";
import { VoicePreviewCache } from "./voice-preview-cache";

export interface SynthesizeOptions {
	provider: TtsProvider;
	voiceId: string;
	rate?: number;
	pitch?: number;
	volumeGain?: number;
	targetDuration?: number;
}

type VoiceCatalogResponse = {
	voices: VoiceCatalogItem[];
	capcutConfigured: boolean;
	vieneuConfigured: boolean;
	supertonicConfigured: boolean;
	omnivoiceConfigured: boolean;
	elevenlabsConfigured: boolean;
	geminiConfigured: boolean;
};

export type TtsProviderStatus = {
	gemini: { configured: boolean; source: "environment" | "local" | null };
	elevenlabs: { configured: boolean; source: "environment" | "local" | null };
	omnivoice: {
		enabled: boolean;
		gpuAvailable: boolean;
		installed: boolean;
		effectiveDevice: "cpu" | "gpu";
	};
};

export type PreviewCloneInput =
	| {
			provider: "gemini";
			voice: string;
			model: string;
			language: string;
			styleInstructions?: string;
			rate?: number;
			pitch?: number;
			volumeGain?: number;
			text?: string;
	  }
	| {
			provider: "vieneu" | "elevenlabs" | "omnivoice";
			audio: File;
			engine?: "v2" | "v3";
			rate?: number;
			pitch?: number;
			volumeGain?: number;
			text?: string;
	  };

let activePreview: HTMLAudioElement | null = null;
let activePreviewUrl: string | null = null;
const voicePreviewCache = new VoicePreviewCache();

function previewCacheKey({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}) {
	return JSON.stringify({
		provider: options.provider,
		voiceId: options.voiceId,
		text: text.trim(),
		rate: options.rate ?? 1,
		pitch: options.pitch ?? 0,
		volumeGain: options.volumeGain ?? 0,
		targetDuration: options.targetDuration ?? null,
	});
}

async function readApiError(response: Response) {
	const payload: unknown = await response.json().catch(() => null);
	return typeof payload === "object" &&
		payload !== null &&
		"error" in payload &&
		typeof payload.error === "string"
		? payload.error
		: `TTS HTTP error: ${response.status}`;
}

export async function fetchVoiceCatalog(): Promise<VoiceCatalogResponse> {
	const response = await fetch("/api/tts/voices", { cache: "no-store" });
	if (!response.ok) throw new Error(await readApiError(response));
	const payload: unknown = await response.json();
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("voices" in payload) ||
		!Array.isArray(payload.voices) ||
		!("capcutConfigured" in payload) ||
		typeof payload.capcutConfigured !== "boolean"
	) {
		throw new Error("Kho giọng trả về dữ liệu không hợp lệ");
	}
	return {
		voices: payload.voices,
		capcutConfigured: payload.capcutConfigured,
		vieneuConfigured:
			"vieneuConfigured" in payload && payload.vieneuConfigured === true,
		supertonicConfigured:
			"supertonicConfigured" in payload && payload.supertonicConfigured === true,
		omnivoiceConfigured:
			"omnivoiceConfigured" in payload && payload.omnivoiceConfigured === true,
		elevenlabsConfigured:
			"elevenlabsConfigured" in payload && payload.elevenlabsConfigured === true,
		geminiConfigured:
			"geminiConfigured" in payload && payload.geminiConfigured === true,
	};
}

export async function fetchTtsProviderStatus(): Promise<TtsProviderStatus> {
	const response = await fetch("/api/tts/providers", { cache: "no-store" });
	if (!response.ok) throw new Error(await readApiError(response));
	return response.json();
}

export async function saveTtsProviderKey({
	provider,
	value,
}: {
	provider: "gemini" | "elevenlabs";
	value: string | null;
}): Promise<TtsProviderStatus> {
	const response = await fetch("/api/tts/providers", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ [provider]: value }),
	});
	if (!response.ok) throw new Error(await readApiError(response));
	return response.json();
}

export async function saveOmniVoiceSettings(input: {
	enabled?: boolean;
}): Promise<TtsProviderStatus> {
	const response = await fetch("/api/tts/providers", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...(typeof input.enabled === "boolean"
				? { omnivoiceEnabled: input.enabled }
				: {}),
		}),
	});
	if (!response.ok) throw new Error(await readApiError(response));
	return response.json();
}

export async function createClonedVoice({
	name,
	audio,
	provider,
	engine,
	rate,
	pitch,
	volumeGain,
}: {
	name: string;
	audio: File;
	provider: "vieneu" | "elevenlabs" | "omnivoice";
	engine?: "v2" | "v3";
	rate?: number;
	pitch?: number;
	volumeGain?: number;
}) {
	return createVoice({
		name,
		audio,
		provider,
		engine,
		consent: true,
		rate,
		pitch,
		volumeGain,
	});
}

export async function deleteClonedVoice({
	provider,
	voiceId,
}: {
	provider: "vieneu" | "omnivoice";
	voiceId: string;
}) {
	const response = await fetch("/api/tts/clones", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ provider, voiceId }),
	});
	if (!response.ok) throw new Error(await readApiError(response));
	const payload: unknown = await response.json();
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("success" in payload) ||
		payload.success !== true
	) {
		throw new Error("Dữ liệu xóa giọng clone trả về không hợp lệ");
	}
	return payload;
}

export async function createVoice({
	name,
	audio,
	provider,
	engine,
	consent = false,
	rate,
	pitch,
	volumeGain,
}: {
	name: string;
	audio?: File;
	provider: "vieneu" | "elevenlabs" | "omnivoice";
	engine?: "v2" | "v3";
	consent?: boolean;
	rate?: number;
	pitch?: number;
	volumeGain?: number;
}) {
	const form = new FormData();
	form.set("provider", provider);
	form.set("name", name);
	form.set("consent", String(consent));
	if (provider === "vieneu") form.set("engine", engine === "v3" ? "v3" : "v2");
	if (audio) form.set("audio", audio);
	if (rate !== undefined) form.set("rate", String(rate));
	if (pitch !== undefined) form.set("pitch", String(pitch));
	if (volumeGain !== undefined) form.set("volumeGain", String(volumeGain));
	const response = await fetch("/api/tts/clones", { method: "POST", body: form });
	if (!response.ok) throw new Error(await readApiError(response));
	return response.json();
}

async function playBlobPreview({ blob }: { blob: Blob }) {
	stopVoicePreview();
	const audioUrl = URL.createObjectURL(blob);
	activePreviewUrl = audioUrl;
	const audio = new Audio(audioUrl);
	activePreview = audio;
	await new Promise<void>((resolve, reject) => {
		audio.onended = () => resolve();
		audio.onerror = () =>
			reject(new Error("Không thể phát âm thanh xem trước"));
		audio.play().catch(reject);
	});
	if (activePreview === audio) stopVoicePreview();
}

export async function previewCloneVoice(input: PreviewCloneInput): Promise<void> {
	stopVoicePreview();
	const response =
		input.provider === "gemini"
			? await fetch("/api/tts/clone-preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						provider: "gemini",
						voice: input.voice,
						model: input.model,
						language: input.language,
						styleInstructions: input.styleInstructions,
						rate: input.rate,
						pitch: input.pitch,
						volumeGain: input.volumeGain,
						text: input.text,
					}),
				})
			: await fetch("/api/tts/clone-preview", {
					method: "POST",
					body: (() => {
						const form = new FormData();
						form.set("provider", input.provider);
						form.set("audio", input.audio);
						if (input.provider === "vieneu") {
							form.set("engine", input.engine === "v3" ? "v3" : "v2");
						}
						if (input.rate !== undefined) form.set("rate", String(input.rate));
						if (input.pitch !== undefined) {
							form.set("pitch", String(input.pitch));
						}
						if (input.volumeGain !== undefined) {
							form.set("volumeGain", String(input.volumeGain));
						}
						if (input.text) form.set("text", input.text);
						return form;
					})(),
				});
	if (!response.ok) throw new Error(await readApiError(response));
	await playBlobPreview({ blob: await response.blob() });
}

export async function generateTtsAudioUrl({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}): Promise<string> {
	if (!text.trim()) return "";

	const response = await fetch("/api/tts/synthesize", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text,
			provider: options.provider,
			voiceId: options.voiceId,
			rate: options.rate,
			pitch: options.pitch,
			volumeGain: options.volumeGain,
			targetDuration: options.targetDuration,
		}),
	});
	if (!response.ok) throw new Error(await readApiError(response));

	return URL.createObjectURL(await response.blob());
}

export async function generateTtsAudioResult({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}) {
	const response = await fetch("/api/tts/synthesize", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, ...options }),
	});
	if (!response.ok) throw new Error(await readApiError(response));
	const sourceDuration = Number.parseFloat(
		response.headers.get("X-TTS-Source-Duration") ?? "",
	);
	const appliedRate = Number.parseFloat(
		response.headers.get("X-TTS-Applied-Rate") ?? "",
	);
	const outputDuration = Number.parseFloat(
		response.headers.get("X-TTS-Output-Duration") ?? "",
	);
	return {
		blob: await response.blob(),
		sourceDuration: Number.isFinite(sourceDuration) ? sourceDuration : null,
		appliedRate: Number.isFinite(appliedRate) ? appliedRate : null,
		outputDuration: Number.isFinite(outputDuration) ? outputDuration : null,
	};
}

export async function generateTtsAudioBlob({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}): Promise<Blob> {
	return (await generateTtsAudioResult({ text, options })).blob;
}

export function stopVoicePreview() {
	if (activePreview) {
		activePreview.pause();
		activePreview.src = "";
		activePreview = null;
	}
	if (activePreviewUrl) {
		URL.revokeObjectURL(activePreviewUrl);
		activePreviewUrl = null;
	}
}

export async function playVoicePreview({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}): Promise<void> {
	stopVoicePreview();
	if (!text.trim()) return;
	const preview = await voicePreviewCache.getOrCreate({
		key: previewCacheKey({ text, options }),
		load: () => generateTtsAudioBlob({ text, options }),
	});
	await playBlobPreview({ blob: preview });
}

export async function playCueAudioPreview({
	text,
	options,
}: {
	text: string;
	options: SynthesizeOptions;
}): Promise<void> {
	return playVoicePreview({ text, options });
}
