import type { RecognitionCue } from "../types";
import type { TextElement, TextTrack, TimelineTrack } from "@/types/timeline";

type SceneTracks = TimelineTrack[];
type ElementRef = { trackId: string; elementId: string };
type MediaTime = number;

function getTextTracks({ tracks }: { tracks: SceneTracks }): TextTrack[] {
	return tracks.filter((track): track is TextTrack => track.type === "text");
}

export function findRecognitionCueElementRef({
	tracks,
	cue,
	cueIndex,
	cueStartTime,
	preferredTrackId,
}: {
	tracks: SceneTracks;
	cue: RecognitionCue;
	cueIndex: number;
	cueStartTime: MediaTime;
	preferredTrackId: string | null;
}): ElementRef | null {
	const textTracks = getTextTracks({ tracks });
	const preferredTrack = preferredTrackId
		? textTracks.find((track) => track.id === preferredTrackId)
		: undefined;
	const preferredElement = preferredTrack?.elements[cueIndex];

	if (preferredTrack && preferredElement) {
		return { trackId: preferredTrack.id, elementId: preferredElement.id };
	}

	const expectedCaptionSuffix = `Caption ${cueIndex + 1}`;
	let bestMatch: { ref: ElementRef; score: number } | null = null;
	for (const track of textTracks) {
		for (const element of track.elements) {
			if (element.startTime !== cueStartTime) continue;
			let score = 1;
			if (element.name.endsWith(expectedCaptionSuffix)) score += 2;
			if (
				cue.speakerId &&
				(element as TextElement & { subtitleSpeaker?: { id: string } }).subtitleSpeaker?.id === cue.speakerId
			) score += 2;
			if (!bestMatch || score > bestMatch.score) {
				bestMatch = { ref: { trackId: track.id, elementId: element.id }, score };
			}
		}
	}
	return bestMatch?.ref ?? null;
}
