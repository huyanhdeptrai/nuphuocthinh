import { Input, ALL_FORMATS, BlobSource, AudioBufferSink } from "mediabunny";
import { collectAudioMixSources } from "@/lib/media/audio";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";

export async function getVideoInfo({
	videoFile,
}: {
	videoFile: File;
}): Promise<{
	duration: number;
	width: number;
	height: number;
	fps: number;
}> {
	const input = new Input({
		source: new BlobSource(videoFile),
		formats: ALL_FORMATS,
	});

	const duration = await input.computeDuration();
	const videoTrack = await input.getPrimaryVideoTrack();

	if (!videoTrack) {
		throw new Error("No video track found in the file");
	}

	const packetStats = await videoTrack.computePacketStats(100);
	const fps = packetStats.averagePacketRate;

	return {
		duration,
		width: videoTrack.displayWidth,
		height: videoTrack.displayHeight,
		fps,
	};
}

export const extractTimelineAudio = async ({
	tracks,
	mediaAssets,
	totalDuration,
	onProgress,
	sampleRate = 44100,
	numberOfChannels = 2,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	totalDuration: number;
	onProgress?: (progress: number) => void;
	sampleRate?: number;
	numberOfChannels?: 1 | 2;
}): Promise<Blob> => {
	if (totalDuration === 0) {
		return createWavBlob({
			samples: new Float32Array(sampleRate * 0.1 * numberOfChannels),
			sampleRate,
			numberOfChannels,
		});
	}

	const audioMixSources = await collectAudioMixSources({
		tracks,
		mediaAssets,
	});

	if (audioMixSources.length === 0) {
		const silentDuration = Math.max(1, totalDuration);
		const silentSamples = new Float32Array(
			Math.ceil(silentDuration * sampleRate) * numberOfChannels,
		);
		return createWavBlob({
			samples: silentSamples,
			sampleRate,
			numberOfChannels,
		});
	}

	const totalSamples = Math.ceil(totalDuration * sampleRate);
	const mixBuffers = Array.from(
		{ length: numberOfChannels },
		() => new Float32Array(totalSamples),
	);

	for (let i = 0; i < audioMixSources.length; i++) {
		const source = audioMixSources[i];

		if (onProgress) {
			onProgress((i / audioMixSources.length) * 90);
		}

		try {
			await decodeAndMixAudioSource({
				source,
				mixBuffers,
				totalSamples,
				sampleRate,
				numberOfChannels,
			});
		} catch (error) {
			console.warn(
				`Failed to process audio source ${source.file.name}:`,
				error,
			);
		}
	}

	// clamp to prevent clipping
	for (const channel of mixBuffers) {
		for (let i = 0; i < channel.length; i++) {
			channel[i] = Math.max(-1, Math.min(1, channel[i]));
		}
	}

	// interleave channels for wav output
	const interleavedSamples = new Float32Array(
		totalSamples * numberOfChannels,
	);
	for (let i = 0; i < totalSamples; i++) {
		for (let channel = 0; channel < numberOfChannels; channel++) {
			interleavedSamples[i * numberOfChannels + channel] =
				mixBuffers[channel][i];
		}
	}

	if (onProgress) {
		onProgress(100);
	}

	return createWavBlob({
		samples: interleavedSamples,
		sampleRate,
		numberOfChannels,
	});
};

async function decodeAndMixAudioSource({
	source,
	mixBuffers,
	totalSamples,
	sampleRate,
	numberOfChannels,
}: {
	source: {
		file: File;
		startTime: number;
		duration: number;
		trimStart: number;
		volume: number;
		playbackRate: number;
	};
	mixBuffers: Float32Array[];
	totalSamples: number;
	sampleRate: number;
	numberOfChannels: 1 | 2;
}): Promise<void> {
	const input = new Input({
		source: new BlobSource(source.file),
		formats: ALL_FORMATS,
	});

	const audioTrack = await input.getPrimaryAudioTrack();
	if (!audioTrack) return;

	const rate = source.playbackRate;
	const sink = new AudioBufferSink(audioTrack);
	const sourceDuration = source.duration * rate;
	const trimEnd = source.trimStart + sourceDuration;

	for await (const { buffer, timestamp } of sink.buffers(
		source.trimStart,
		trimEnd,
	)) {
		// map source time → timeline time accounting for playback rate
		const relativeSourceTime = timestamp - source.trimStart;
		const relativeTimelineTime = relativeSourceTime / rate;
		const outputStartSample = Math.floor(
			(source.startTime + relativeTimelineTime) * sampleRate,
		);

		// resample ratio includes both sample rate conversion and speed change
		const resampleRatio = (sampleRate / buffer.sampleRate) / rate;
		const resampledLength = Math.floor(buffer.length * resampleRatio);

		for (let ch = 0; ch < numberOfChannels; ch++) {
			const sourceChannel = Math.min(ch, buffer.numberOfChannels - 1);
			const outputChannel = mixBuffers[ch];
			const sourceChannels =
				numberOfChannels === 1
					? Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
							buffer.getChannelData(channel),
						)
					: [buffer.getChannelData(sourceChannel)];

			for (let i = 0; i < resampledLength; i++) {
				const outputIdx = outputStartSample + i;
				if (outputIdx < 0 || outputIdx >= totalSamples) continue;

				const sourcePos = i / resampleRatio;
				const sourceIdx = Math.floor(sourcePos);
				const fraction = sourcePos - sourceIdx;
				let sample = 0;

				for (const channelData of sourceChannels) {
					if (sourceIdx >= channelData.length) continue;
					const sample0 = channelData[sourceIdx];
					const sample1 =
						sourceIdx + 1 < channelData.length
							? channelData[sourceIdx + 1]
							: sample0;
					sample += sample0 + fraction * (sample1 - sample0);
				}

				outputChannel[outputIdx] +=
					(sample / sourceChannels.length) * source.volume;
			}
		}
	}
}

export async function decodeMediaAudioStereo({
	file,
	trimStart,
	duration,
}: {
	file: File;
	trimStart: number;
	duration: number;
}): Promise<{
	left: Float32Array;
	right: Float32Array | null;
	sampleRate: number;
	numberOfChannels: 1 | 2;
}> {
	// Try native browser AudioContext first: 100% accurate sample rate & pitch preservation
	if (typeof window !== "undefined") {
		try {
			const AudioContextConstructor =
				window.AudioContext ||
				(window as typeof window & { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (AudioContextConstructor) {
				const audioContext = new AudioContextConstructor();
				try {
					const arrayBuffer = await file.arrayBuffer();
					const audioBuffer = await audioContext.decodeAudioData(
						arrayBuffer.slice(0),
					);
					const sampleRate = audioBuffer.sampleRate;
					const channelCount = audioBuffer.numberOfChannels >= 2 ? 2 : 1;
					const startSample = Math.max(0, Math.floor(trimStart * sampleRate));
					const totalSamples = Math.max(1, Math.ceil(duration * sampleRate));

					const channel0 = audioBuffer.getChannelData(0);
					const left = new Float32Array(totalSamples);
					const copyLen0 = Math.min(
						totalSamples,
						Math.max(0, channel0.length - startSample),
					);
					if (copyLen0 > 0) {
						left.set(channel0.subarray(startSample, startSample + copyLen0));
					}

					let right: Float32Array | null = null;
					if (channelCount === 2) {
						const channel1 = audioBuffer.getChannelData(1);
						right = new Float32Array(totalSamples);
						const copyLen1 = Math.min(
							totalSamples,
							Math.max(0, channel1.length - startSample),
						);
						if (copyLen1 > 0) {
							right.set(channel1.subarray(startSample, startSample + copyLen1));
						}
					}

					return {
						left,
						right,
						sampleRate,
						numberOfChannels: channelCount,
					};
				} finally {
					await audioContext.close().catch(() => {});
				}
			}
		} catch {
			// Fall through to mediabunny decoder below
		}
	}

	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	const audioTrack = await input.getPrimaryAudioTrack();
	if (!audioTrack) {
		throw new Error("NO_AUDIO_TRACK");
	}

	const sink = new AudioBufferSink(audioTrack);
	const trimEnd = trimStart + duration;
	let detectedSampleRate = audioTrack.sampleRate;
	const channelCount = audioTrack.numberOfChannels >= 2 ? 2 : 1;

	// Extract all buffer chunks and get exact sample rate from AudioBuffer
	const chunks: Array<{ buffer: AudioBuffer; timestamp: number }> = [];
	for await (const chunk of sink.buffers(trimStart, trimEnd)) {
		chunks.push(chunk);
		if (chunk.buffer?.sampleRate) {
			detectedSampleRate = chunk.buffer.sampleRate;
		}
	}

	const sampleRate = detectedSampleRate;
	const totalSamples = Math.max(1, Math.ceil(duration * sampleRate));
	const left = new Float32Array(totalSamples);
	const right = channelCount === 2 ? new Float32Array(totalSamples) : null;

	for (const { buffer, timestamp } of chunks) {
		const destStart = Math.floor((timestamp - trimStart) * sampleRate);
		if (destStart >= totalSamples) continue;
		const sourceLeft = buffer.getChannelData(0);
		const sourceRight =
			buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
		const writeAt = Math.max(0, destStart);
		const sourceOffset = destStart < 0 ? -destStart : 0;
		const copyLength = Math.min(
			sourceLeft.length - sourceOffset,
			totalSamples - writeAt,
		);
		if (copyLength <= 0) continue;
		left.set(
			sourceLeft.subarray(sourceOffset, sourceOffset + copyLength),
			writeAt,
		);
		if (right && sourceRight) {
			right.set(
				sourceRight.subarray(sourceOffset, sourceOffset + copyLength),
				writeAt,
			);
		}
	}

	return {
		left,
		right,
		sampleRate,
		numberOfChannels: channelCount,
	};
}

export function stereoPcmToWavFile({
	left,
	right,
	sampleRate,
	fileName,
}: {
	left: Float32Array;
	right: Float32Array | null;
	sampleRate: number;
	fileName: string;
}): File {
	const numberOfChannels: 1 | 2 = right ? 2 : 1;
	const length = right ? Math.min(left.length, right.length) : left.length;
	const interleaved = new Float32Array(length * numberOfChannels);
	for (let i = 0; i < length; i++) {
		interleaved[i * numberOfChannels] = left[i];
		if (right) interleaved[i * numberOfChannels + 1] = right[i];
	}
	const blob = createWavBlob({
		samples: interleaved,
		sampleRate,
		numberOfChannels,
	});
	return new File([blob], fileName, { type: "audio/wav" });
}

export function createWavBlob({
	samples,
	sampleRate,
	numberOfChannels,
}: {
	samples: Float32Array;
	sampleRate: number;
	numberOfChannels: 1 | 2;
}): Blob {
	const bitsPerSample = 16;
	const bytesPerSample = bitsPerSample / 8;
	const numSamples = samples.length / numberOfChannels;
	const dataSize = numSamples * numberOfChannels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	// riff header
	writeString({ view, offset: 0, str: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeString({ view, offset: 8, str: "WAVE" });

	// fmt chunk
	writeString({ view, offset: 12, str: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, numberOfChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true);
	view.setUint16(32, numberOfChannels * bytesPerSample, true);
	view.setUint16(34, bitsPerSample, true);

	// data chunk
	writeString({ view, offset: 36, str: "data" });
	view.setUint32(40, dataSize, true);

	// convert float32 to int16 and write
	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
		view.setInt16(offset, int16, true);
		offset += 2;
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function writeString({
	view,
	offset,
	str,
}: {
	view: DataView;
	offset: number;
	str: string;
}): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}
