import { describe, expect, test } from "bun:test";
import {
	assignSpeakersToCues,
	clipOverlappingCueTimes,
	resolveAsrCueEndTime,
	type SpeakerSegment,
} from "./speaker-diarization";
import type { RecognitionCue } from "../types";

function cue({
	id,
	startTime,
	endTime,
	text,
}: {
	id: string;
	startTime: number;
	endTime: number;
	text: string;
}): RecognitionCue {
	return { id, startTime, endTime, text, speaker: "Speaker 1" };
}

describe("assignSpeakersToCues", () => {
	test("keeps padded short CapCut cues on the speaker at onset", () => {
		const cues = [
			cue({ id: "1", startTime: 10.0, endTime: 10.9, text: "脚抬高" }),
			cue({ id: "2", startTime: 10.95, endTime: 12.6, text: "啊" }),
			cue({ id: "3", startTime: 12.7, endTime: 14.2, text: "你在干什么" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 9.4, endTime: 11.12, speaker: "SPEAKER_00" },
			{ startTime: 11.18, endTime: 14.5, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({
			cues,
			segments,
			mode: "onset",
		});

		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N1");
		expect(labelled[2]?.speakerName).toBe("N2");
	});

	test("does not let a 2.5s invalid-end fallback steal the next speaker", () => {
		const cues = [
			cue({ id: "1", startTime: 4.1, endTime: 4.1, text: "啊" }),
			cue({ id: "2", startTime: 4.8, endTime: 6.4, text: "过来一下" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 3.9, endTime: 4.45, speaker: "SPEAKER_00" },
			{ startTime: 4.7, endTime: 6.6, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({ cues, segments });

		expect(labelled[0]?.endTime).toBeLessThan(4.8);
		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N2");
	});

	test("clips overlapping ASR cues before scoring speakers", () => {
		const cues = clipOverlappingCueTimes({
			cues: [
				cue({ id: "1", startTime: 1, endTime: 3.2, text: "脚抬高" }),
				cue({ id: "2", startTime: 2.1, endTime: 3.4, text: "啊" }),
			],
		});
		expect(cues[0]?.endTime).toBe(2.1);
	});

	test("inherits the previous speaker when pyannote misses a short burst", () => {
		const cues = [
			cue({ id: "1", startTime: 8.0, endTime: 8.7, text: "脚抬高" }),
			cue({ id: "2", startTime: 8.82, endTime: 9.05, text: "啊" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 7.8, endTime: 8.72, speaker: "SPEAKER_00" },
			{ startTime: 9.4, endTime: 12.0, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({ cues, segments });

		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N1");
	});

	test("still switches speaker on a real turn change", () => {
		const cues = [
			cue({ id: "1", startTime: 1.0, endTime: 2.4, text: "今天天气真好" }),
			cue({ id: "2", startTime: 2.6, endTime: 4.1, text: "是啊我们走吧" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 0.9, endTime: 2.45, speaker: "SPEAKER_00" },
			{ startTime: 2.5, endTime: 4.2, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({
			cues,
			segments,
			mode: "onset",
		});

		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N2");
	});

	test("onset does not keep the previous speaker across a nearby turn", () => {
		const cues = [
			cue({ id: "1", startTime: 1.0, endTime: 2.4, text: "今天天气真好" }),
			cue({ id: "2", startTime: 2.55, endTime: 4.1, text: "是啊我们走吧" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 0.9, endTime: 2.45, speaker: "SPEAKER_00" },
			{ startTime: 2.5, endTime: 4.2, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({
			cues,
			segments,
			mode: "onset",
		});

		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N2");
	});

	test("lookbehind mode keeps a late OCR subtitle on the speaker who just talked", () => {
		const cues = [
			cue({ id: "1", startTime: 2.4, endTime: 4.0, text: "今天天气真好" }),
			cue({ id: "2", startTime: 2.95, endTime: 4.8, text: "是啊我们走吧" }),
		];
		const segments: SpeakerSegment[] = [
			{ startTime: 1.0, endTime: 2.45, speaker: "SPEAKER_00" },
			{ startTime: 2.5, endTime: 4.3, speaker: "SPEAKER_01" },
		];

		const { cues: labelled } = assignSpeakersToCues({
			cues,
			segments,
			mode: "lookbehind",
		});

		expect(labelled[0]?.speakerName).toBe("N1");
		expect(labelled[1]?.speakerName).toBe("N2");
	});

	test("does not assign a speaker seconds away from silence", () => {
		const cues = [cue({ id: "1", startTime: 20, endTime: 21, text: "片尾" })];
		const segments: SpeakerSegment[] = [
			{ startTime: 1.0, endTime: 3.0, speaker: "SPEAKER_00" },
		];

		const { cues: labelled } = assignSpeakersToCues({ cues, segments });

		expect(labelled[0]?.speakerName).toBeUndefined();
	});

	test("returns original cues when there are no diarization segments", () => {
		const cues = [cue({ id: "1", startTime: 0, endTime: 1, text: "啊" })];
		const { cues: labelled, speakers } = assignSpeakersToCues({
			cues,
			segments: [],
		});
		expect(labelled).toEqual(cues);
		expect(speakers).toEqual([]);
	});
});

describe("resolveAsrCueEndTime", () => {
	test("does not invent a 2.5s span for a one-character utterance", () => {
		const endTime = resolveAsrCueEndTime({
			startTime: 10,
			endTime: 10,
			text: "啊",
		});
		expect(endTime).toBeGreaterThan(10);
		expect(endTime).toBeLessThan(10.6);
	});
});
