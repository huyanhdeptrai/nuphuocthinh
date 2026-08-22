import type { RecognitionCue, SpeakerProfile } from "../types";
import { applyCueTimingOffsets, type CueTimingOffsets } from "./cue-timing";
import { resolveSpeakerColor } from "./speaker-roles";

export interface TranslatedTimelineCaption {
	text: string;
	startTime: number;
	duration: number;
	style?: { color: string };
	speakerId?: string;
	speakerName?: string;
	speakerColor?: string;
}

export function buildSourceTimelineCaptions({
	cues,
	timingOffsets,
	profiles,
}: {
	cues: RecognitionCue[];
	timingOffsets: CueTimingOffsets;
	profiles?: SpeakerProfile[];
}): TranslatedTimelineCaption[] {
	return cues.map((cue) => {
		const timing = applyCueTimingOffsets({
			startTime: cue.startTime,
			endTime: cue.endTime,
			...timingOffsets,
		});

		const speakerId = cue.speakerId || "speaker-default";
		const speakerName =
			cue.speakerName ||
			cue.speaker ||
			(speakerId.startsWith("speaker-")
				? `N${speakerId.replace("speaker-", "")}`
				: speakerId);
		const speakerColor = resolveSpeakerColor({
			speakerId,
			speakerName,
			cueColor: cue.speakerColor,
			profiles,
		});

		return {
			text: cue.text,
			startTime: timing.startTime,
			duration: timing.endTime - timing.startTime,
			speakerId,
			speakerName,
			speakerColor,
		};
	});
}

export function hasCompleteTranslations({
	cues,
	translations,
}: {
	cues: RecognitionCue[];
	translations: Record<string, string>;
}): boolean {
	return (
		cues.length > 0 &&
		cues.every((cue) => Boolean(translations[cue.id]?.trim()))
	);
}

export function buildTranslatedTimelineCaptions({
	cues,
	translations,
	timingOffsets,
	profiles,
}: {
	cues: RecognitionCue[];
	translations: Record<string, string>;
	timingOffsets: CueTimingOffsets;
	profiles?: SpeakerProfile[];
}): TranslatedTimelineCaption[] {
	return cues.map((cue) => {
		const translatedText = translations[cue.id]?.trim();
		if (!translatedText) {
			throw new Error(`Thiếu bản dịch cho phụ đề ${cue.id}.`);
		}

		const timing = applyCueTimingOffsets({
			startTime: cue.startTime,
			endTime: cue.endTime,
			...timingOffsets,
		});

		const speakerId = cue.speakerId || "speaker-default";
		const speakerName =
			cue.speakerName ||
			cue.speaker ||
			(speakerId.startsWith("speaker-")
				? `N${speakerId.replace("speaker-", "")}`
				: speakerId);
		const speakerColor = resolveSpeakerColor({
			speakerId,
			speakerName,
			cueColor: cue.speakerColor,
			profiles,
		});

		return {
			text: translatedText,
			startTime: timing.startTime,
			duration: timing.endTime - timing.startTime,
			speakerId,
			speakerName,
			speakerColor,
		};
	});
}

