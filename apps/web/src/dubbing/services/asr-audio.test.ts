import { describe, expect, test } from "bun:test";
import { encodeMonoWavBlob } from "@/lib/media/audio";
import { ASR_AUDIO_PROFILE, ASR_SAMPLE_RATE } from "./asr-audio";

describe("asr-audio", () => {
	test("profile is the prenormalized PCM contract", () => {
		expect(ASR_AUDIO_PROFILE).toBe("pcm-s16le-16000-mono-v1");
		expect(ASR_SAMPLE_RATE).toBe(16_000);
	});

	test("encodeMonoWavBlob writes a valid 16 kHz mono WAV header", async () => {
		const wav = encodeMonoWavBlob(new Float32Array([0, 0.5, -0.5, 1]), ASR_SAMPLE_RATE);
		const bytes = new Uint8Array(await wav.arrayBuffer());
		const header = new TextDecoder().decode(bytes.slice(0, 12));
		expect(header.startsWith("RIFF")).toBe(true);
		expect(header.endsWith("WAVE")).toBe(true);
		expect(wav.type).toBe("audio/wav");
		expect(bytes.byteLength).toBe(44 + 8);
	});
});
