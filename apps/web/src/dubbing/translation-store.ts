import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	DEFAULT_TRANSLATION_STYLES,
	type TranslationStylePreset,
} from "./translation-presets";

export type TranslationProvider = "openrouter" | "custom";

export interface TranslatedCueValue {
	id: string;
	text: string;
}

interface TranslationState {
	provider: TranslationProvider;
	openRouterApiKey: string;
	openRouterModel: string;
	customEndpoint: string;
	customApiKey: string;
	customModel: string;
	customModels: string[];
	targetLanguage: string;
	styles: TranslationStylePreset[];
	selectedStyleId: string;
	translations: Record<string, string>;
	setProvider: (provider: TranslationProvider) => void;
	updateConfig: (
		partial: Partial<
			Pick<
				TranslationState,
				| "openRouterApiKey"
				| "openRouterModel"
				| "customEndpoint"
				| "customApiKey"
				| "customModel"
				| "customModels"
				| "targetLanguage"
			>
		>,
	) => void;
	setSelectedStyleId: (id: string) => void;
	upsertStyle: (style: TranslationStylePreset) => void;
	deleteStyle: (id: string) => void;
	setTranslations: (values: TranslatedCueValue[]) => void;
	setTranslation: (input: { id: string; text: string }) => void;
	clearTranslations: () => void;
}

export const useTranslationStore = create<TranslationState>()(
	persist(
		(set) => ({
			provider: "openrouter",
			openRouterApiKey: "",
			openRouterModel: "openai/gpt-4o-mini",
			customEndpoint: "",
			customApiKey: "",
			customModel: "",
			customModels: [],
			targetLanguage: "vi",
			styles: DEFAULT_TRANSLATION_STYLES,
			selectedStyleId: DEFAULT_TRANSLATION_STYLES[0].id,
			translations: {},
			setProvider: (provider) => set({ provider }),
			updateConfig: (partial) => set(partial),
			setSelectedStyleId: (selectedStyleId) => set({ selectedStyleId }),
			upsertStyle: (style) =>
				set((state) => ({
					styles: state.styles.some((item) => item.id === style.id)
						? state.styles.map((item) => (item.id === style.id ? style : item))
						: [...state.styles, style],
					selectedStyleId: style.id,
				})),
			deleteStyle: (id) =>
				set((state) => {
					const styles = state.styles.filter((style) => style.id !== id);
					return {
						styles,
						selectedStyleId:
							state.selectedStyleId === id
								? (styles[0]?.id ?? "")
								: state.selectedStyleId,
					};
				}),
			setTranslations: (values) =>
				set(() => ({
					translations: values.reduce(
						(acc, item) => ({ ...acc, [item.id]: item.text }),
						{} as Record<string, string>,
					),
				})),
			setTranslation: ({ id, text }) =>
				set((state) => ({
					translations: { ...state.translations, [id]: text },
				})),
			clearTranslations: () => set({ translations: {} }),
		}),
		{ name: "translation-store" },
	),
);

