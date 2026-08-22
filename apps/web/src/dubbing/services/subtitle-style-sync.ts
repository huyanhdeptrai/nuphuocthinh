import type { EditorCore } from "@/core";
import type { TextElement, TextTrack } from "@/types/timeline";
import { useDubbingStore } from "../dubbing-store";

export interface SyncSubtitleStyleOptions {
	editor: EditorCore;
	sourceElement: TextElement;
	scope: "all" | "speaker";
	targetSpeakerId?: string;
	targetSpeakerName?: string;
}

export interface SyncSubtitleStyleResult {
	updatedCount: number;
	speakerName?: string;
}

export function extractTextStyleFromElement(sourceElement: TextElement): Partial<TextElement> {
	return {
		fontFamily: sourceElement.fontFamily,
		fontSize: sourceElement.fontSize,
		color: sourceElement.color,
		backgroundColor: sourceElement.backgroundColor,
		stroke: sourceElement.stroke ? { ...sourceElement.stroke } : undefined,
		shadow: sourceElement.shadow ? { ...sourceElement.shadow } : undefined,
		fontWeight: sourceElement.fontWeight,
		fontStyle: sourceElement.fontStyle,
		textDecoration: sourceElement.textDecoration,
		textAlign: sourceElement.textAlign,
		opacity: sourceElement.opacity,
		boxWidth: sourceElement.boxWidth,
		backgroundBorderRadius: sourceElement.backgroundBorderRadius,
		backgroundOpacity: sourceElement.backgroundOpacity,
		backgroundPaddingX: sourceElement.backgroundPaddingX,
		backgroundPaddingY: sourceElement.backgroundPaddingY,
		backgroundWidthMode: sourceElement.backgroundWidthMode,
		backgroundWidthRatio: sourceElement.backgroundWidthRatio,
	};
}

export function isSubtitleTextElement(element: TextElement): boolean {
	const textEl = element as TextElement & { subtitleSpeaker?: { id?: string; name?: string } };
	if (textEl.subtitleSpeaker?.id || textEl.subtitleSpeaker?.name) {
		return true;
	}
	if (/Caption\s+\d+/i.test(element.name)) {
		return true;
	}
	return false;
}

export function getElementSpeakerInfo(element: TextElement): {
	speakerId?: string;
	speakerName?: string;
} {
	const textEl = element as TextElement & {
		subtitleSpeaker?: { id?: string; name?: string };
	};
	if (textEl.subtitleSpeaker?.id || textEl.subtitleSpeaker?.name) {
		return {
			speakerId: textEl.subtitleSpeaker.id,
			speakerName: textEl.subtitleSpeaker.name,
		};
	}

	// Match from name pattern "[SpeakerName] Caption X"
	const match = element.name.match(/^\[(.*?)\]\s*Caption\s*\d+/i);
	if (match?.[1]) {
		return {
			speakerId: match[1].trim(),
			speakerName: match[1].trim(),
		};
	}

	return {};
}

export function syncSubtitleStyles({
	editor,
	sourceElement,
	scope,
	targetSpeakerId,
	targetSpeakerName,
}: SyncSubtitleStyleOptions): SyncSubtitleStyleResult {
	const tracks = editor.timeline.getTracks();
	const textTracks = tracks.filter((t): t is TextTrack => t.type === "text");
	const styleUpdates = extractTextStyleFromElement(sourceElement);
	const sourceScale = sourceElement.transform.scale;
	const sourcePosition = sourceElement.transform.position;
	const buildSyncedTransform = (element: TextElement): TextElement["transform"] => ({
		...element.transform,
		scale: sourceScale,
		position: { ...sourcePosition },
	});

	// Extract speaker ID/Name if not provided
	const effectiveSpeakerId =
		targetSpeakerId || getElementSpeakerInfo(sourceElement).speakerId;
	const effectiveSpeakerName =
		targetSpeakerName || getElementSpeakerInfo(sourceElement).speakerName;

	const updates: Array<{
		trackId: string;
		elementId: string;
		updates: Partial<TextElement>;
	}> = [];

	for (const track of textTracks) {
		for (const element of track.elements) {
			const isSub = isSubtitleTextElement(element);
			// In 'all' scope, sync all subtitle elements (or all text elements if no specific caption format)
			if (scope === "all") {
				updates.push({
					trackId: track.id,
					elementId: element.id,
					updates: {
						...styleUpdates,
					transform: buildSyncedTransform(element),
					},
				});
				continue;
			}

			// In 'speaker' scope, match specific speaker role
			if (scope === "speaker" && (effectiveSpeakerId || effectiveSpeakerName)) {
				const info = getElementSpeakerInfo(element);
				const matches =
					(effectiveSpeakerId && info.speakerId === effectiveSpeakerId) ||
					(effectiveSpeakerName && info.speakerName === effectiveSpeakerName) ||
					(effectiveSpeakerName && element.name.startsWith(`[${effectiveSpeakerName}]`)) ||
					(effectiveSpeakerId && element.name.startsWith(`[${effectiveSpeakerId}]`));

				if (matches) {
					updates.push({
						trackId: track.id,
						elementId: element.id,
						updates: {
							...styleUpdates,
							transform: buildSyncedTransform(element),
						},
					});
				}
			}
		}
	}

	if (updates.length > 0) {
		editor.timeline.updateElements({ updates, pushHistory: true });
	}

	return {
		updatedCount: updates.length,
		speakerName: effectiveSpeakerName || effectiveSpeakerId,
	};
}
