import { encodeMonoWavBlob } from "@/lib/media/audio";
import { extractAudioSamplesFromMediaBlob } from "./remote-asr";

export const ASR_SAMPLE_RATE = 16_000;
export const ASR_AUDIO_PROFILE = "pcm-s16le-16000-mono-v1";

export async function extractAsrUploadAudio({
	blob,
	fileName,
}: {
	blob: Blob;
	fileName?: string;
}): Promise<{
	file: File;
	profile: typeof ASR_AUDIO_PROFILE;
	extractMs: number;
	byteLength: number;
}> {
	const startedAt = performance.now();
	const samples = await extractAudioSamplesFromMediaBlob({ blob });
	const wav = encodeMonoWavBlob(samples, ASR_SAMPLE_RATE);
	const safeName = `${(fileName || "audio").replace(/\.[^.]+$/, "") || "audio"}.wav`;
	const file = new File([wav], safeName, { type: "audio/wav" });
	return {
		file,
		profile: ASR_AUDIO_PROFILE,
		extractMs: performance.now() - startedAt,
		byteLength: file.size,
	};
}
