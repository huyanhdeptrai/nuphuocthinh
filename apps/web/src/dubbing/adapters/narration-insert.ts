import type { EditorCore } from "@/core";
import { processMediaAssets } from "@/lib/media/processing";
import { buildUploadAudioElement } from "@/lib/timeline/element-utils";
import type { AudioRole, CreateUploadAudioElement, TimelineTrack } from "@/types/timeline";
import {
	isDuckedSourceElement,
	isNarrationAudioElement,
	isRawSourceAudioElement,
	isSourceAudioElement,
} from "../services/duck-envelope";
import { getActiveSceneOrNull } from "./editor";
import { hasSourceAudioClips } from "./source-audio";

export { processMediaAssets };

export interface NarrationAudioElement extends CreateUploadAudioElement {
	audioRole?: AudioRole;
	params: { volume: number };
	sourceDuration?: number;
	retime?: { rate: number; maintainPitch: boolean };
	speakerId?: string;
	speakerName?: string;
	speakerColor?: string;
	color?: string;
}

export function buildElementFromMedia({
	mediaId,
	mediaType,
	name,
	duration,
	startTime,
	speakerId,
	speakerName,
	speakerColor,
	color,
}: {
	mediaId: string;
	mediaType: "audio" | "video" | "image";
	name: string;
	duration: number;
	startTime: number;
	speakerId?: string;
	speakerName?: string;
	speakerColor?: string;
	color?: string;
}): NarrationAudioElement {
	if (mediaType !== "audio") {
		throw new Error("Không thể tạo phần tử audio");
	}

	const resolvedColor = color || speakerColor;
	return {
		...buildUploadAudioElement({
			mediaId,
			name,
			duration,
			startTime,
		}),
		params: { volume: 0 },
		speakerId,
		speakerName,
		speakerColor: resolvedColor,
		color: resolvedColor,
	};
}

export function dbToLinear({ db }: { db: number }): number {
	if (!Number.isFinite(db) || db <= -60) return 0;
	return 10 ** (db / 20);
}

export function applyNarrationMixSettings({
	editor,
	sourceVolumeDb,
	ttsVolumeDb,
}: {
	editor: EditorCore;
	sourceVolumeDb: number;
	ttsVolumeDb: number;
}): void {
	const scene = getActiveSceneOrNull({ editor });
	if (!scene) return;

	const sourceVolume = dbToLinear({ db: sourceVolumeDb });
	const ttsVolume = dbToLinear({ db: ttsVolumeDb });
	const sourceClipsExist = hasSourceAudioClips({ tracks: scene.tracks });
	const updates: Array<{
		trackId: string;
		elementId: string;
		updates: { volume?: number; muted?: boolean };
	}> = [];

	for (const track of scene.tracks) {
		if (track.type === "video") {
			for (const element of track.elements) {
				if (element.type !== "video") continue;
				updates.push({
					trackId: track.id,
					elementId: element.id,
					updates: { muted: sourceClipsExist },
				});
			}
			continue;
		}

		if (track.type !== "audio") continue;
		for (const element of track.elements) {
			if (isNarrationAudioElement({ element })) {
				updates.push({
					trackId: track.id,
					elementId: element.id,
					updates: { volume: ttsVolume },
				});
				continue;
			}
			if (
				isDuckedSourceElement({ element }) ||
				isRawSourceAudioElement({ element })
			) {
				updates.push({
					trackId: track.id,
					elementId: element.id,
					updates: { volume: sourceVolume },
				});
			}
		}
	}

	if (updates.length === 0) return;
	editor.timeline.updateElements({ updates });
}

export function collectPreviousNarrationElements({
	tracks,
	successfulCueIds,
	cueIdFromName,
}: {
	tracks: TimelineTrack[] | null | undefined;
	successfulCueIds: Set<string>;
	cueIdFromName: (name: string) => string | null;
}): Array<{ trackId: string; elementId: string }> {
	if (!tracks) return [];

	return tracks.flatMap((track) => {
		if (track.type !== "audio") return [];
		return track.elements
			.filter((element) => {
				const cueId = cueIdFromName(element.name);
				return cueId !== null && successfulCueIds.has(cueId);
			})
			.map((element) => ({ trackId: track.id, elementId: element.id }));
	});
}

function wouldElementOverlap({
	elements,
	startTime,
	duration,
}: {
	elements: Array<{ startTime: number; duration: number }>;
	startTime: number;
	duration: number;
}): boolean {
	const endTime = startTime + duration;
	return elements.some((el) => {
		const elEnd = el.startTime + el.duration;
		return startTime < elEnd && endTime > el.startTime;
	});
}

export function findOrCreateNarrationTrack({
	editor,
	startTime,
	duration,
	preferredTrackId,
	speakerId,
	speakerName,
	lane = 0,
}: {
	editor: EditorCore;
	startTime: number;
	duration: number;
	preferredTrackId?: string | null;
	speakerId?: string;
	speakerName?: string;
	lane?: number;
}): string {
	const tracks = editor.timeline.getTracks();

	if (preferredTrackId) {
		const preferred = tracks.find(
			(t) => t.id === preferredTrackId && t.type === "audio",
		);
		const preferredIsSource =
			preferred?.elements.some((el) =>
				isSourceAudioElement({ element: el }),
			) ?? false;
		if (
			preferred &&
			!preferredIsSource &&
			!wouldElementOverlap({
				elements: preferred.elements,
				startTime,
				duration,
			})
		) {
			return preferred.id;
		}
	}

	const displayName =
		speakerName ||
		(speakerId?.startsWith("speaker-")
			? `N${speakerId.replace("speaker-", "")}`
			: speakerId);

	// 1. If speaker role is specified: find or create dedicated audio track for this speaker
	if (speakerId || displayName) {
		const targetTrackNamePrefix = displayName
			? `Thuyết minh - ${displayName}`
			: "Thuyết minh";
		const exactTrackName =
			lane > 0
				? `${targetTrackNamePrefix} (${lane + 1})`
				: targetTrackNamePrefix;

		// Look for matching tracks dedicated to this speaker
		const matchingTracks = tracks.filter((t) => {
			if (t.type !== "audio") return false;
			if (t.elements.some((el) => isSourceAudioElement({ element: el })))
				return false;

			const isNameMatch =
				t.name === exactTrackName ||
				t.name.startsWith(targetTrackNamePrefix);

			// Ensure this track doesn't contain elements of other distinct speakers
			const hasOtherSpeaker = t.elements.some((el) => {
				const elSpeakerId = (el as any).speakerId;
				const elSpeakerName = (el as any).speakerName;
				return (
					(elSpeakerId && speakerId && elSpeakerId !== speakerId) ||
					(elSpeakerName &&
						displayName &&
						elSpeakerName !== displayName)
				);
			});

			return isNameMatch && !hasOtherSpeaker;
		});

		for (const track of matchingTracks) {
			if (
				!wouldElementOverlap({
					elements: track.elements,
					startTime,
					duration,
				})
			) {
				return track.id;
			}
		}

		// Check for empty audio track with exact track name
		const emptyMatchingTrack = tracks.find(
			(t) =>
				t.type === "audio" &&
				t.elements.length === 0 &&
				t.name === exactTrackName,
		);
		if (emptyMatchingTrack) {
			return emptyMatchingTrack.id;
		}

		// Create a NEW dedicated audio track for this speaker role
		return editor.timeline.addTrack({
			type: "audio",
			name: exactTrackName,
		});
	}

	// 2. Generic narration tracks for unspecified speaker
	const narrationTracks = tracks.filter(
		(t) =>
			t.type === "audio" &&
			!t.elements.some((el) => isSourceAudioElement({ element: el })) &&
			t.elements.some((el) => isNarrationAudioElement({ element: el })) &&
			!t.elements.some((el) => (el as any).speakerId),
	);
	for (const track of narrationTracks) {
		if (
			!wouldElementOverlap({
				elements: track.elements,
				startTime,
				duration,
			})
		) {
			return track.id;
		}
	}

	const audioTracks = tracks.filter(
		(t) =>
			t.type === "audio" &&
			!t.elements.some((el) => isSourceAudioElement({ element: el })) &&
			t.elements.length === 0,
	);
	for (const track of audioTracks) {
		if (
			!wouldElementOverlap({
				elements: track.elements,
				startTime,
				duration,
			})
		) {
			return track.id;
		}
	}

	return editor.timeline.addTrack({ type: "audio", name: "Thuyết minh" });
}

export function insertNarrationClips({
	editor,
	clips,
}: {
	editor: EditorCore;
	clips: Array<{
		cueId: string;
		speakerId: string;
		speakerName?: string;
		speakerColor?: string;
		lane: number;
		element: NarrationAudioElement;
	}>;
}): void {
	const laneTrackIds = new Map<string, string>();

	for (const clip of clips) {
		const laneKey = `${clip.speakerId}:${clip.lane}`;
		let trackId = laneTrackIds.get(laneKey);
		if (!trackId) {
			trackId = findOrCreateNarrationTrack({
				editor,
				startTime: clip.element.startTime,
				duration: clip.element.duration,
				speakerId: clip.speakerId,
				speakerName: clip.speakerName || clip.element.speakerName,
				lane: clip.lane,
			});
			laneTrackIds.set(laneKey, trackId);
		}

		const volume = dbToLinear({ db: clip.element.params.volume });
		const playbackRate = clip.element.retime?.rate;
		const color =
			clip.speakerColor ||
			clip.element.speakerColor ||
			clip.element.color;
		const speakerName = clip.speakerName || clip.element.speakerName;

		const element: CreateUploadAudioElement & {
			audioRole?: AudioRole;
			speakerId?: string;
			speakerName?: string;
			speakerColor?: string;
			color?: string;
		} = {
			...buildUploadAudioElement({
				mediaId: clip.element.mediaId,
				name: clip.element.name,
				duration: clip.element.duration,
				startTime: clip.element.startTime,
				buffer: clip.element.buffer,
			}),
			volume,
			playbackRate:
				playbackRate && Math.abs(playbackRate - 1) > 0.001
					? playbackRate
					: undefined,
			audioRole: clip.element.audioRole ?? "narration",
			speakerId: clip.speakerId,
			speakerName,
			speakerColor: color,
			color,
		};

		editor.timeline.insertElement({
			element,
			placement: { mode: "explicit", trackId },
		});
	}
}
