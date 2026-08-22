import type { OriginalSubtitleCue } from "@/types/project";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { getTextScaleFactor } from "@/constants/text-constants";
import { getTextVerticalBounds } from "@/lib/preview/text-visual-bounds";
import { isBottomAlignedSubtitleText } from "./text-utils";

export type OriginalSubtitleVerticalUpdate = {
	trackId: string;
	elementId: string;
	updates: Pick<TextElement, "transform">;
};

function getTextLines({
	element,
	scaledFontSize,
	scaledBoxWidth,
}: {
	element: TextElement;
	scaledFontSize: number;
	scaledBoxWidth: number | null;
}): {
	lineCount: number;
	ascent: number;
	descent: number;
} {
	const fallback = {
		lineCount: Math.max(
			1,
			scaledBoxWidth
				? element.content.split("\n").reduce((total, paragraph) => {
						const charactersPerLine = Math.max(
							1,
							Math.floor(scaledBoxWidth / (scaledFontSize * 0.6)),
						);
						return total + Math.max(1, Math.ceil(paragraph.length / charactersPerLine));
					}, 0)
				: element.content.split("\n").length,
		),
		ascent: scaledFontSize * 0.8,
		descent: scaledFontSize * 0.2,
	};
	if (typeof document === "undefined") return fallback;

	const context = document.createElement("canvas").getContext("2d");
	if (!context) return fallback;
	const fontWeight = element.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = element.fontStyle === "italic" ? "italic" : "normal";
	const fontFamily = element.fontFamily.includes('"')
		? element.fontFamily
		: `"${element.fontFamily}"`;
	context.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;

	const lines: string[] = [];
	for (const paragraph of element.content.split("\n")) {
		if (!scaledBoxWidth || paragraph === "") {
			lines.push(paragraph);
			continue;
		}
		let currentLine = "";
		for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
			if (/^\s+$/.test(token) && !currentLine) continue;
			const candidate = currentLine + token;
			if (context.measureText(candidate).width > scaledBoxWidth && currentLine.trim()) {
				lines.push(currentLine.trimEnd());
				currentLine = /^\s+$/.test(token) ? "" : token;
			} else {
				currentLine = candidate;
			}
		}
		lines.push(currentLine.trimEnd());
	}
	const safeLines = lines.length ? lines : [""];
	const firstMetrics = context.measureText(safeLines[0] ?? "");
	const lastMetrics = context.measureText(safeLines.at(-1) ?? "");
	return {
		lineCount: safeLines.length,
		ascent: Math.max(firstMetrics.actualBoundingBoxAscent || 0, scaledFontSize * 0.8),
		descent: Math.max(lastMetrics.actualBoundingBoxDescent || 0, scaledFontSize * 0.2),
	};
}

/** Offset from a text element's origin to the centre of its rendered pixels. */
export function getSubtitleVisualCenterOffset({
	element,
	canvasWidth,
	canvasHeight,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
}): number {
	const scaleFactor = getTextScaleFactor({ canvasWidth, canvasHeight });
	const scaledFontSize = element.fontSize * scaleFactor;
	const hasBackground = Boolean(element.backgroundColor && element.backgroundColor !== "transparent");
	const { lineCount, ascent, descent } = getTextLines({
		element,
		scaledFontSize,
		scaledBoxWidth: element.boxWidth && element.boxWidth > 0
			? element.boxWidth * scaleFactor
			: null,
	});
	const verticalBounds = getTextVerticalBounds({
		lineCount,
		lineHeight: scaledFontSize * 1.3,
		ascent,
		descent,
		bottomAligned: isBottomAlignedSubtitleText({ element }),
		backgroundPaddingY: hasBackground ? (element.backgroundPaddingY ?? 4) : 0,
		strokePadding: element.stroke?.width ?? 0,
		shadowOffsetY: element.shadow?.offsetY ?? 0,
		shadowBlur: element.shadow?.blur ?? 0,
	});
	return (verticalBounds.top + verticalBounds.height / 2) * element.transform.scale;
}

function findMatchingCue({
	element,
	cues,
}: {
	element: TextElement;
	cues: OriginalSubtitleCue[];
}): OriginalSubtitleCue | null {
	const elementEnd = element.startTime + element.duration;
	let winner: OriginalSubtitleCue | null = null;
	let overlap = 0;
	for (const cue of cues) {
		const cueOverlap = Math.max(
			0,
			Math.min(elementEnd, cue.endTime) - Math.max(element.startTime, cue.startTime),
		);
		if (cueOverlap > overlap) {
			overlap = cueOverlap;
			winner = cue;
		}
	}
	return winner;
}

/**
 * Align translated subtitle rows to the vertical center of their matching
 * burned-in subtitle cue. Width, X, scale, typography, and timing stay intact.
 */
export function getOriginalSubtitleVerticalPositionUpdates({
	tracks,
	originalSubtitleCues,
	canvasWidth,
	canvasHeight,
}: {
	tracks: TimelineTrack[];
	originalSubtitleCues: OriginalSubtitleCue[];
	canvasWidth: number;
	canvasHeight: number;
}): OriginalSubtitleVerticalUpdate[] {
	if (canvasWidth <= 0 || canvasHeight <= 0 || originalSubtitleCues.length === 0) return [];
	const updates: OriginalSubtitleVerticalUpdate[] = [];
	for (const track of tracks) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (
				element.type !== "text" ||
				!isBottomAlignedSubtitleText({ element })
			) continue;
			const cue = findMatchingCue({ element, cues: originalSubtitleCues });
			if (!cue) continue;
			// transform.position.y is the text origin/baseline, not its visual
			// centre. Put the rendered centre on the original subtitle's centre.
			const originalCenterY = (cue.bounds.y + cue.bounds.height / 2) * canvasHeight;
			const y = originalCenterY - canvasHeight / 2 - getSubtitleVisualCenterOffset({
				element,
				canvasWidth,
				canvasHeight,
			});
			if (Math.abs(element.transform.position.y - y) < 0.01) continue;
			updates.push({
				trackId: track.id,
				elementId: element.id,
				updates: {
					transform: {
						...element.transform,
						position: { ...element.transform.position, y },
					},
				},
			});
		}
	}
	return updates;
}
