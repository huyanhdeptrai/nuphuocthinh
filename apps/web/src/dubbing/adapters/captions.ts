import type { EditorCore } from "@/core";
import { buildTextElement } from "@/lib/timeline/element-utils";
import type { CreateTextElement } from "@/types/timeline";

export interface CaptionSpeaker {
	id: string;
	name: string;
	color: string;
}

export interface CaptionChunkInput {
	text: string;
	startTime: number;
	duration: number;
	style?: {
		color?: string;
		fontSize?: number;
		positionY?: number;
		boxWidth?: number;
		strokeColor?: string;
		strokeWidth?: number;
	};
	speakerId?: string;
	speakerName?: string;
	speakerColor?: string;
}

type CaptionTextElement = CreateTextElement & {
	subtitleSpeaker?: CaptionSpeaker;
};

const DEFAULT_SPEAKER_COLOR = "#60a5fa";
const CJK_TEXT = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * Older projects can retain a generated source-caption track after a
 * Vietnamese translation is placed on the timeline. Remove only those
 * generated CJK caption tracks; user text and video content are untouched.
 */
export function removeGeneratedCjkCaptionTracks({
	editor,
}: {
	editor: EditorCore;
}): number {
	const staleTrackIds = editor.timeline
		.getTracks()
		.filter((track) => {
			if (track.type !== "text" || track.elements.length === 0) return false;
			const generatedCaptions = track.elements.filter(
				(element) =>
					element.type === "text" &&
					"subtitleSpeaker" in element &&
					Boolean(element.subtitleSpeaker),
			);
			return (
				generatedCaptions.length === track.elements.length &&
				generatedCaptions.some(
					(element) => element.type === "text" && CJK_TEXT.test(element.content),
				)
			);
		})
		.map((track) => track.id);

	for (const trackId of staleTrackIds) {
		editor.timeline.removeTrack({ trackId });
	}
	return staleTrackIds.length;
}

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
}: {
	editor: EditorCore;
	captions: CaptionChunkInput[];
}): string | null {
	if (captions.length === 0) return null;

	const trackId = editor.timeline.addTrack({ type: "text", index: 0 });
	const project = editor.project.getActive();
	const canvasHeight = project?.settings.canvasSize.height ?? 1080;
	// Position subtitles near lower-third (28% down from center = ~78% down from top)
	const defaultSubtitleY = Math.round(canvasHeight * 0.28);

	for (const [index, caption] of captions.entries()) {
		const speakerName = caption.speakerName?.trim();
		const name = speakerName
			? `[${speakerName}] Caption ${index + 1}`
			: `Caption ${index + 1}`;
		const element: CaptionTextElement = {
			...(buildTextElement({
				raw: {
					name,
					content: caption.text,
					duration: Math.max(0.1, caption.duration),
					fontSize: caption.style?.fontSize ?? 6,
					color: caption.style?.color ?? "#ffffff",
					fontFamily: "Arial",
					textAlign: "center",
					stroke: {
						color: caption.style?.strokeColor ?? "#000000",
						width: caption.style?.strokeWidth ?? 3,
					},
					shadow: {
						color: "rgba(0,0,0,0.6)",
						offsetX: 0,
						offsetY: 2,
						blur: 4,
					},
					boxWidth: caption.style?.boxWidth ?? 75,
					transform: {
						scale: 1,
						position: {
							x: 0,
							y: caption.style?.positionY ?? defaultSubtitleY,
						},
						rotate: 0,
					},
				},
				startTime: caption.startTime,
			}) as CreateTextElement),
		};

		const speakerColor = caption.speakerColor || DEFAULT_SPEAKER_COLOR;

		if (caption.speakerId || caption.speakerColor || speakerName) {
			element.speakerId = caption.speakerId;
			element.speakerName = speakerName || caption.speakerId;
			element.speakerColor = speakerColor;
			element.timelineColor = speakerColor;
			element.subtitleSpeaker = {
				id: caption.speakerId || "speaker-default",
				name: speakerName || caption.speakerId || "Người nói",
				color: speakerColor,
			};
		}

		editor.timeline.insertElement({
			placement: { mode: "explicit", trackId },
			element,
		});
	}

	return trackId;
}
