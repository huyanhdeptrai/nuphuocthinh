import { z } from "zod";
import type { RecognitionCue, SpeakerProfile } from "../types";
import type { TranslationProvider } from "../translation-store";
import { translationCueWithRole } from "./speaker-roles";

export const TRANSLATION_BATCH_SIZE = 500;

const TARGET_LANGUAGE_NAMES: Record<string, string> = {
	vi: "Tiếng Việt (Vietnamese)",
	en: "English",
	zh: "中文 (Chinese)",
	ja: "日本語 (Japanese)",
	ko: "한국어 (Korean)",
	es: "Español (Spanish)",
	fr: "Français (French)",
	de: "Deutsch (German)",
};

const translationResponseSchema = z.object({
	translations: z
		.array(z.object({ id: z.string(), text: z.string().min(1) }))
		.optional(),
});

const errorResponseSchema = z
	.object({ error: z.string().optional() })
	.passthrough();

export interface TranslationPipelineConfig {
	provider: TranslationProvider;
	endpoint?: string;
	apiKey: string;
	model: string;
	targetLanguage: string;
	stylePrompt?: string;
}

type TranslationFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function validateConfig({
	config,
}: {
	config: TranslationPipelineConfig;
}): void {
	if (!config.model.trim())
		throw new Error("Vui lòng nhập hoặc chọn model AI.");
	if (config.provider === "openrouter" && !config.apiKey.trim()) {
		throw new Error("Vui lòng nhập OpenRouter API key ở tab Dịch.");
	}
	if (config.provider === "custom" && !config.endpoint?.trim()) {
		throw new Error("Vui lòng nhập API endpoint Custom ở tab Dịch.");
	}
}

export async function translateRecognitionCues({
	cues,
	config,
	speakerProfiles = [],
	onProgress,
	fetchImpl = fetch,
}: {
	cues: RecognitionCue[];
	config: TranslationPipelineConfig;
	speakerProfiles?: SpeakerProfile[];
	onProgress?: (input: { completed: number; total: number }) => void;
	fetchImpl?: TranslationFetch;
}): Promise<Array<{ id: string; text: string }>> {
	if (cues.length === 0) throw new Error("Không có phụ đề để dịch.");
	validateConfig({ config });

	const translations: Array<{ id: string; text: string }> = [];
	for (let start = 0; start < cues.length; start += TRANSLATION_BATCH_SIZE) {
		const batch = cues.slice(start, start + TRANSLATION_BATCH_SIZE);
		const response = await fetchImpl("/api/translation", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: config.provider,
				endpoint: config.provider === "custom" ? config.endpoint : undefined,
				apiKey: config.apiKey,
				model: config.model,
				targetLanguage:
					TARGET_LANGUAGE_NAMES[config.targetLanguage] ?? config.targetLanguage,
				stylePrompt: config.stylePrompt,
				cues: batch.map((cue) =>
					translationCueWithRole({ cue, profiles: speakerProfiles }),
				),
			}),
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const parsedError = errorResponseSchema.safeParse(payload);
			throw new Error(parsedError.data?.error || `HTTP ${response.status}`);
		}

		const parsed = translationResponseSchema.parse(payload);
		if (parsed.translations?.length !== batch.length) {
			throw new Error("Model không trả về đủ bản dịch cho tất cả phụ đề.");
		}
		const translatedById = new Map(
			parsed.translations.map((item) => [item.id, item.text.trim()]),
		);
		for (const cue of batch) {
			const translatedText = translatedById.get(cue.id);
			if (!translatedText) {
				throw new Error(`Thiếu bản dịch cho phụ đề ${cue.id}.`);
			}
			translations.push({ id: cue.id, text: translatedText });
		}

		onProgress?.({
			completed: Math.min(start + batch.length, cues.length),
			total: cues.length,
		});
	}

	return translations;
}

