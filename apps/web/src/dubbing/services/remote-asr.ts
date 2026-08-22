import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import type { RemoteTranscriptionProvider } from "@/lib/transcription/providers/types";
import type { TranscriptionResult } from "@/types/transcription";
import type { ASREngineId, RecognitionCue } from "../types";

const OPENROUTER_HIDDEN_MODEL_IDS = new Set([
	"openai/gpt-4o-transcribe",
	"openai/gpt-4o-mini-transcribe",
]);

const REMOTE_SAMPLE_RATE = 16_000;

export function isRemoteAsrEngine({
	engine,
}: {
	engine: ASREngineId;
}): boolean {
	return engine === "groq-whisper" || engine === "openrouter";
}

export function remoteAsrProviderId({
	engine,
}: {
	engine: ASREngineId;
}): "groq" | "openrouter" | null {
	if (engine === "groq-whisper") return "groq";
	if (engine === "openrouter") return "openrouter";
	return null;
}

export function recognitionModelsFor({
	provider,
}: {
	provider: RemoteTranscriptionProvider;
}) {
	if (provider.id !== "openrouter") return provider.models;
	return provider.models.filter(
		(model) => !OPENROUTER_HIDDEN_MODEL_IDS.has(model.id),
	);
}

export async function extractAudioSamplesFromMediaBlob({
	blob,
}: {
	blob: Blob;
}): Promise<Float32Array> {
	try {
		const decoded = await decodeAudioToFloat32({
			audioBlob: blob,
			targetSampleRate: REMOTE_SAMPLE_RATE,
		});
		if (decoded.samples.length > 0) return decoded.samples;
	} catch {
		// Video containers often fail in WebAudio; fall through to mediabunny.
	}

	const file =
		blob instanceof File
			? blob
			: new File([blob], "media.bin", {
					type: blob.type || "application/octet-stream",
				});
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	const audioTrack = await input.getPrimaryAudioTrack();
	if (!audioTrack) {
		throw new Error("Không tìm thấy âm thanh trong file để nhận dạng ASR.");
	}

	const duration = await input.computeDuration();
	const totalSamples = Math.max(1, Math.ceil(duration * REMOTE_SAMPLE_RATE));
	const samples = new Float32Array(totalSamples);
	const sink = new AudioBufferSink(audioTrack);

	for await (const { buffer, timestamp } of sink.buffers(0, duration)) {
		const left = buffer.getChannelData(0);
		const right =
			buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
		const ratio = REMOTE_SAMPLE_RATE / buffer.sampleRate;
		const start = Math.floor(timestamp * REMOTE_SAMPLE_RATE);
		const outLength = Math.floor(left.length * ratio);
		const scale = buffer.numberOfChannels > 1 ? Math.SQRT1_2 : 1;

		for (let i = 0; i < outLength; i++) {
			const dest = start + i;
			if (dest < 0 || dest >= samples.length) continue;
			const sourcePos = i / ratio;
			const sourceIdx = Math.floor(sourcePos);
			if (sourceIdx >= left.length) continue;
			const fraction = sourcePos - sourceIdx;
			const nextIdx =
				sourceIdx + 1 < left.length ? sourceIdx + 1 : sourceIdx;
			const mixed0 = scale * (left[sourceIdx] + right[sourceIdx]);
			const mixed1 = scale * (left[nextIdx] + right[nextIdx]);
			samples[dest] = mixed0 + fraction * (mixed1 - mixed0);
		}
	}

	return samples;
}

export function mapTranscriptionToCues({
	result,
}: {
	result: TranscriptionResult;
}): RecognitionCue[] {
	const segments = result.segments.filter((seg) => seg.text.trim().length > 0);
	if (segments.length === 0 && result.text.trim()) {
		return [
			{
				id: "asr-1",
				startTime: 0,
				endTime: 2.5,
				text: result.text.trim(),
				confidence: 0.99,
				speaker: "Speaker 1",
			},
		];
	}

	return segments.map((seg, index) => {
		const startTime = Number(seg.start.toFixed(2));
		let endTime = Number(seg.end.toFixed(2));
		if (endTime <= startTime) {
			endTime = Number((startTime + 2.5).toFixed(2));
		}
		return {
			id: `asr-${index + 1}`,
			startTime,
			endTime,
			text: seg.text.trim(),
			confidence: 0.99,
			speaker: "Speaker 1",
		};
	});
}
