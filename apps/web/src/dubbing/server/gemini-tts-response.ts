type GeminiTtsAudio = {
	data: string;
	sampleRate: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function audioFromContent({ content }: { content: unknown }): GeminiTtsAudio | null {
	if (!Array.isArray(content)) return null;

	for (const part of content) {
		if (!isRecord(part) || typeof part.data !== "string" || !part.data) continue;
		if (part.type !== undefined && part.type !== "audio") continue;
		return {
			data: part.data,
			sampleRate:
				typeof part.sample_rate === "number" && part.sample_rate > 0
					? part.sample_rate
					: 24_000,
		};
	}

	return null;
}

/** Extracts PCM audio from both the REST and SDK Interactions response shapes. */
export function extractGeminiTtsAudio({
	response,
}: {
	response: unknown;
}): GeminiTtsAudio | null {
	if (!isRecord(response)) return null;

	const outputAudio = response.output_audio;
	if (isRecord(outputAudio) && typeof outputAudio.data === "string") {
		return { data: outputAudio.data, sampleRate: 24_000 };
	}

	if (!Array.isArray(response.steps)) return null;
	for (const step of response.steps) {
		if (!isRecord(step)) continue;
		const audio = audioFromContent({ content: step.content });
		if (audio) return audio;
	}

	return null;
}

