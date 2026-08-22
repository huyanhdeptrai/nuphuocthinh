import type { EditorCore } from "@/core";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import type { RecognitionCue } from "../types";
import { findRecognitionCueElementRef } from "./cue-timeline-selection";

type SceneTracks = TimelineTrack[];
type MediaTime = number;
type CaptionTextUpdate = {
	trackId: string;
	elementId: string;
	content: string;
};

function findTextElement({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
}): TextElement | null {
	const track = tracks.find((candidate) => candidate.id === trackId);
	if (track?.type !== "text") return null;
	return track.elements.find((element) => element.id === elementId) ?? null;
}

export function planCueTimelineTextUpdate({
	tracks,
	cue,
	cueIndex,
	preferredTrackId,
	text,
	cueStartTime,
}: {
	tracks: SceneTracks;
	cue: RecognitionCue;
	cueIndex: number;
	preferredTrackId: string | null;
	text: string;
	cueStartTime: MediaTime;
}): CaptionTextUpdate | null {
	if (!preferredTrackId) return null;
	const ref = findRecognitionCueElementRef({
		tracks,
		cue,
		cueIndex,
		cueStartTime,
		preferredTrackId,
	});
	if (!ref || !findTextElement({ tracks, ...ref })) return null;
	return { ...ref, content: text.normalize("NFC") };
}

export function syncCueTextToTimeline({
	editor,
	cue,
	cueIndex,
	preferredTrackId,
	text,
	cueStartTime,
}: {
	editor: EditorCore;
	cue: RecognitionCue;
	cueIndex: number;
	preferredTrackId: string | null;
	text: string;
	cueStartTime: MediaTime;
}): boolean {
	const update = planCueTimelineTextUpdate({
		tracks: editor.timeline.getTracks(),
		cue,
		cueIndex,
		preferredTrackId,
		text,
		cueStartTime,
	});
	if (!update) return false;
	editor.timeline.updateElements({
		updates: [
			{
				trackId: update.trackId,
				elementId: update.elementId,
				updates: { content: update.content },
			},
		],
		pushHistory: false,
	});
	return true;
}
