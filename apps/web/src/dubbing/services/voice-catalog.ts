import type { TtsProvider, VoiceCatalogItem } from "../types";

export type VoiceCatalogFilters = {
	provider: TtsProvider | "all";
	language: string;
	gender: VoiceCatalogItem["gender"] | "all";
	query: string;
};

export function filterAndSortVoices({
	voices,
	favoriteVoiceIds,
	filters,
}: {
	voices: VoiceCatalogItem[];
	favoriteVoiceIds: string[];
	filters: VoiceCatalogFilters;
}) {
	const favorites = new Set(favoriteVoiceIds);
	const normalizedQuery = filters.query.trim().toLocaleLowerCase("vi");

	return voices
		.filter((voice) => {
			if (filters.provider !== "all" && voice.provider !== filters.provider)
				return false;
			if (filters.language !== "all" && voice.lang !== filters.language)
				return false;
			if (filters.gender !== "all" && voice.gender !== filters.gender)
				return false;
			if (!normalizedQuery) return true;
			return [voice.name, voice.voiceId, voice.lang, voice.region]
				.join(" ")
				.toLocaleLowerCase("vi")
				.includes(normalizedQuery);
		})
		.sort((left, right) => {
			const favoriteDelta =
				Number(favorites.has(right.id)) - Number(favorites.has(left.id));
			if (favoriteDelta !== 0) return favoriteDelta;
			return left.name.localeCompare(right.name, "vi");
		});
}

