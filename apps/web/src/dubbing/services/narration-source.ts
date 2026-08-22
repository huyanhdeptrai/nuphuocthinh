import type { RecognitionCue } from "../types";
import type { TextElement, TimelineTrack } from "@/types/timeline";

type CaptionTextElement = TextElement & {
	subtitleSpeaker?: { id: string; name: string; color: string };
};

const CAPTION_NAME_PATTERN = /(?:^|\])\s*Caption\s+\d+$/iu;
const SPEAKER_NAME_PATTERN = /^\[(.+?)\]/u;
const DEFAULT_SPEAKER_COLOR = "#60a5fa";

function isCaptionElement(element: CaptionTextElement) {
	return CAPTION_NAME_PATTERN.test(element.name);
}

function captionElements(track: TimelineTrack) {
	if (track.type !== "text") return [];
	const elements = track.elements as CaptionTextElement[];
	const namedCaptions = elements.filter(isCaptionElement);
	if (namedCaptions.length > 0) return namedCaptions;
	const speakerCaptions = elements.filter(
		(element) => element.subtitleSpeaker !== undefined,
	);
	if (speakerCaptions.length > 0) return speakerCaptions;
	return elements.length >= 2 ? elements : [];
}

export function recognitionCuesFromTimeline({
	tracks,
	ticksPerSecond,
}: {
	tracks: TimelineTrack[];
	ticksPerSecond: number;
}): RecognitionCue[] {
	const track = tracks.find(
		(candidate) =>
			candidate.type === "text" && captionElements(candidate).length > 0,
	);
	if (!track) return [];

	return captionElements(track)
		.map((element, index) => {
			const content = element.content;
			if (typeof content !== "string" || !content.trim()) return null;
			const startTime = element.startTime / ticksPerSecond;
			const duration = element.duration / ticksPerSecond;
			const parsedSpeakerName = element.name.match(SPEAKER_NAME_PATTERN)?.[1];
			const speaker = element.subtitleSpeaker;
			const speakerId = speaker?.id || "speaker-default";
			const speakerName = speaker?.name || parsedSpeakerName || "Người nói 1";
			return {
				id: `timeline-caption:${element.id}`,
				startTime,
				endTime: startTime + duration,
				text: content.trim(),
				speaker: speakerName,
				speakerId,
				speakerName,
				speakerColor: speaker?.color || DEFAULT_SPEAKER_COLOR,
				confidence: undefined,
				_timelineIndex: index,
			};
		})
		.filter((cue): cue is NonNullable<typeof cue> => cue !== null)
		.sort(
			(left, right) =>
				left.startTime - right.startTime ||
				left._timelineIndex - right._timelineIndex,
		)
		.map(({ _timelineIndex: _unused, ...cue }) => cue);
}

export function resolveNarrationCues({
	tracks,
	extractedCues,
	ticksPerSecond,
}: {
	tracks: TimelineTrack[] | null | undefined;
	extractedCues: RecognitionCue[];
	ticksPerSecond: number;
}) {
	if (extractedCues.length > 0) {
		return { cues: extractedCues, source: "recognition" as const };
	}
	const timelineCues = tracks
		? recognitionCuesFromTimeline({ tracks, ticksPerSecond })
		: [];
	return { cues: timelineCues, source: "timeline" as const };
}
