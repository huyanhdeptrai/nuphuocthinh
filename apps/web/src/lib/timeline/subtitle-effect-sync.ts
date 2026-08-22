import type {
	BlurEffectElement,
	TextElement,
	TimelineTrack,
	Transform,
} from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { getTextScaleFactor } from "@/constants/text-constants";
import { isBottomAlignedSubtitleText } from "./text-utils";
import { getTextVerticalBounds } from "@/lib/preview/text-visual-bounds";
import type { OriginalSubtitleCue } from "@/types/project";

export type SubtitleCue = {
	startTime: number;
	duration: number;
	transform: Transform;
	element: TextElement;
};

export type SubtitleEffectCanvasSize = {
	width: number;
	height: number;
};

export function getSubtitleCues(tracks: TimelineTrack[]): SubtitleCue[] {
	// Prefer one subtitle track. Source and translated tracks usually contain
	// the same cues; syncing both would create duplicate effects on top of each
	// other. Either track works when it is the only one on the timeline.
	const subtitleTrack = tracks.find(
		(track) =>
			track.type === "text" &&
			track.elements.some(
				(element): element is TextElement =>
					element.type === "text" &&
					isBottomAlignedSubtitleText({ element }),
			),
	);

	return (
		subtitleTrack?.elements
			.filter(
				(element): element is TextElement =>
					element.type === "text" &&
					isBottomAlignedSubtitleText({ element }),
			)
			.map((element) => ({
				startTime: element.startTime,
				duration: element.duration,
				transform: element.transform,
				element,
			})) ?? []
	);
}

function measureSubtitleText({
	element,
	canvasSize,
}: {
	element: TextElement;
	canvasSize: SubtitleEffectCanvasSize;
}) {
	const scaleFactor = getTextScaleFactor({
		canvasWidth: canvasSize.width,
		canvasHeight: canvasSize.height,
	});
	const scaledFontSize = (element.fontSize ?? 15) * scaleFactor;
	const scaledBoxWidth = (element.boxWidth ?? 0) * scaleFactor;
	const hasBoxWidth = scaledBoxWidth > 0;
	const approximateCharWidth = scaledFontSize * 0.6;
	const content = element.content ?? "";
	let lines = content.split("\n");
	let textWidth = Math.max(
		...lines.map((line) => Math.max(1, line.length) * approximateCharWidth),
		0,
	);
	let ascent = scaledFontSize * 0.8;
	let descent = scaledFontSize * 0.2;

	if (typeof document !== "undefined") {
		const context = document.createElement("canvas").getContext("2d");
		if (context) {
			const fontWeight = element.fontWeight === "bold" ? "bold" : "normal";
			const fontStyle = element.fontStyle === "italic" ? "italic" : "normal";
			const rawFontFamily = element.fontFamily ?? "Arial";
			const fontFamily = rawFontFamily.includes('"')
				? rawFontFamily
				: `"${rawFontFamily}"`;
			context.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
			if (hasBoxWidth) {
				const wrapped: string[] = [];
				for (const paragraph of lines) {
					let line = "";
					for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
						if (
							line &&
							context.measureText(line + word).width > scaledBoxWidth
						) {
							wrapped.push(line.trimEnd());
							line = /^\s+$/.test(word) ? "" : word;
						} else {
							line += word;
						}
					}
					wrapped.push(line.trimEnd() || "");
				}
				lines = wrapped;
			}
			textWidth = Math.max(...lines.map((line) => context.measureText(line).width), 0);
			const firstMetrics = context.measureText(lines[0] ?? "");
			const lastMetrics = context.measureText(lines.at(-1) ?? " ");
			ascent = Math.max(firstMetrics.actualBoundingBoxAscent || 0, ascent);
			descent = Math.max(lastMetrics.actualBoundingBoxDescent || 0, descent);
		}
	}

	if (hasBoxWidth && typeof document === "undefined") {
		const charsPerLine = Math.max(1, Math.floor(scaledBoxWidth / approximateCharWidth));
		lines = content.split("\n").flatMap((paragraph) =>
			Array.from({ length: Math.max(1, Math.ceil(paragraph.length / charsPerLine)) }),
		);
		textWidth = Math.min(textWidth, scaledBoxWidth);
	}

	return { scaledBoxWidth, hasBoxWidth, textWidth, lineCount: Math.max(1, lines.length), ascent, descent, scaledFontSize };
}

function getSubtitleEffectLayout({
	cue,
	canvasSize,
	expandX,
	expandY,
}: {
	cue: SubtitleCue;
	canvasSize: SubtitleEffectCanvasSize;
	expandX: number;
	expandY: number;
}) {
	const { element } = cue;
	const metrics = measureSubtitleText({ element, canvasSize });
	const hasBackground = Boolean(element.backgroundColor && element.backgroundColor !== "transparent");
	const paddingX = hasBackground ? (element.backgroundPaddingX ?? 8) : 0;
	const paddingY = hasBackground ? (element.backgroundPaddingY ?? 4) : 0;
	const ratio = typeof element.backgroundWidthRatio === "number"
		? Math.max(0, Math.min(100, element.backgroundWidthRatio)) / 100
		: element.backgroundWidthMode === "full" ? 1 : 0;
	const backgroundTargetWidth = metrics.hasBoxWidth ? metrics.scaledBoxWidth : metrics.textWidth;
	const backgroundWidth = backgroundTargetWidth > metrics.textWidth
		? metrics.textWidth + (backgroundTargetWidth - metrics.textWidth) * ratio
		: metrics.textWidth;
	// With a background, follow that background exactly. Without one, follow the
	// editable text box so short subtitle lines do not leave an undersized effect.
	const baseWidth = hasBackground
		? backgroundWidth + paddingX * 2
		: (metrics.hasBoxWidth ? metrics.scaledBoxWidth : metrics.textWidth);
	const verticalBounds = getTextVerticalBounds({
		lineCount: metrics.lineCount,
		lineHeight: metrics.scaledFontSize * 1.3,
		ascent: metrics.ascent,
		descent: metrics.descent,
		bottomAligned: isBottomAlignedSubtitleText({ element }),
		backgroundPaddingY: paddingY,
		strokePadding: 0,
	});
	const scale = cue.transform.scale || 1;
	const localCenterY = verticalBounds.top + verticalBounds.height / 2;
	const radians = (cue.transform.rotate * Math.PI) / 180;
	const offsetY = localCenterY * scale;
	return {
		boxWidth: Math.max(1, baseWidth * scale + expandX * 2) / (canvasSize.width * scale),
		boxHeight: Math.max(1, verticalBounds.height * scale + expandY * 2) / (canvasSize.height * scale),
		transform: {
			...cue.transform,
			position: {
				x: cue.transform.position.x - Math.sin(radians) * offsetY,
				y: cue.transform.position.y + Math.cos(radians) * offsetY,
			},
		},
	};
}

function cueTiming({
	cue,
	paddingStart,
	paddingEnd,
}: {
	cue: SubtitleCue;
	paddingStart: number;
	paddingEnd: number;
}) {
	return {
		startTime: Math.max(0, cue.startTime - paddingStart),
		duration: cue.duration + paddingStart + paddingEnd,
	};
}

function getOriginalSubtitleEffectLayout({
	cue,
	canvasSize,
	expandX,
	expandY,
	scale,
}: {
	cue: OriginalSubtitleCue;
	canvasSize: SubtitleEffectCanvasSize;
	expandX: number;
	expandY: number;
	scale: number;
}) {
	const width = cue.bounds.width * canvasSize.width;
	const height = cue.bounds.height * canvasSize.height;
	return {
		boxWidth: Math.max(1, width + expandX * 2) / (canvasSize.width * scale),
		boxHeight: Math.max(1, height + expandY * 2) / (canvasSize.height * scale),
		transform: {
			position: {
				x: (cue.bounds.x + cue.bounds.width / 2 - 0.5) * canvasSize.width,
				y: (cue.bounds.y + cue.bounds.height / 2 - 0.5) * canvasSize.height,
			},
			scale,
			rotate: 0,
		},
	};
}

export function materializeSubtitleSyncedEffects({
	tracks,
	trackId,
	elementId,
	canvasSize = { width: 1920, height: 1080 },
	originalSubtitleCues = [],
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
	canvasSize?: SubtitleEffectCanvasSize;
	originalSubtitleCues?: OriginalSubtitleCue[];
}): TimelineTrack[] {
	const sourceTrack = tracks.find((track) => track.id === trackId);
	const source = sourceTrack?.elements.find(
		(element) => element.id === elementId && element.type === "blur-effect",
	) as BlurEffectElement | undefined;
	if (!source) return tracks;

	const syncSource = source.subtitleSyncSource ?? "timeline-subtitles";
	const cues =
		syncSource === "original-subtitles"
			? originalSubtitleCues
			: getSubtitleCues(tracks);
	if (cues.length === 0) return tracks;

	const groupId = source.syncGroupId ?? source.id;
	const original =
		source.syncOriginal ??
		({
			startTime: source.startTime,
			duration: source.duration,
			transform: source.transform,
		} satisfies NonNullable<BlurEffectElement["syncOriginal"]>);
	const paddingStart = source.subtitlePaddingStart ?? 0.1;
	const paddingEnd = source.subtitlePaddingEnd ?? 0.1;
	const expandX = source.subtitleExpandX ?? 0;
	const expandY = source.subtitleExpandY ?? 0;

	const syncedElements = cues.map((cue, index) => {
		const timing =
			syncSource === "original-subtitles"
				? {
						startTime: Math.max(
							0,
							(cue as OriginalSubtitleCue).startTime - paddingStart,
						),
						duration:
							(cue as OriginalSubtitleCue).endTime -
							(cue as OriginalSubtitleCue).startTime +
							paddingStart +
							paddingEnd,
					}
				: cueTiming({ cue: cue as SubtitleCue, paddingStart, paddingEnd });
		const layout =
			syncSource === "original-subtitles"
				? getOriginalSubtitleEffectLayout({
						cue: cue as OriginalSubtitleCue,
						canvasSize,
						expandX,
						expandY,
						scale: source.transform.scale || 1,
					})
				: getSubtitleEffectLayout({
						cue: cue as SubtitleCue,
						canvasSize,
						expandX,
						expandY,
					});
		return {
			...source,
			id: index === 0 ? source.id : generateUUID(),
			...timing,
			...layout,
			keyframes: undefined,
			syncWithSubtitles: true,
			syncGroupId: groupId,
			syncGenerated: index > 0,
			syncOriginal: index === 0 ? original : undefined,
		};
	});

	return tracks.map((track) => {
		if (track.id !== trackId) return track;
		return {
			...track,
			elements: [
				...track.elements.filter(
					(element) =>
						element.id !== source.id &&
						(element.type !== "blur-effect" ||
							element.syncGroupId !== groupId),
				),
				...syncedElements,
			],
		} as TimelineTrack;
	});
}

export function materializeSubtitleSyncedEffectsForAllGroups(
	tracks: TimelineTrack[],
	originalSubtitleCues: OriginalSubtitleCue[] = [],
): TimelineTrack[] {
	let nextTracks = tracks;
		for (const track of tracks) {
			for (const element of track.elements) {
				if (element.type !== "blur-effect" || !element.syncWithSubtitles) {
					continue;
				}
				nextTracks = materializeSubtitleSyncedEffects({
					tracks: nextTracks,
					trackId: track.id,
					elementId: element.id,
					originalSubtitleCues,
				});
			}
		}
	return nextTracks;
}

export function dematerializeSubtitleSyncedEffects({
	tracks,
	groupId,
	}: {
	tracks: TimelineTrack[];
	groupId: string;
}): TimelineTrack[] {
	return tracks.map((track) => {
		const group = track.elements.filter(
			(element): element is BlurEffectElement =>
				element.type === "blur-effect" &&
				element.syncGroupId === groupId,
		);
		if (group.length === 0) return track;
		const master =
			group.find((element) => !element.syncGenerated) ?? group[0];
		const restored =
			master.type === "blur-effect" && master.syncOriginal
				? {
						...master,
						...master.syncOriginal,
						syncWithSubtitles: false,
						syncGroupId: undefined,
						syncGenerated: undefined,
						syncOriginal: undefined,
					}
				: { ...master, syncWithSubtitles: false, syncGroupId: undefined };
		return {
			...track,
			elements: [
				...track.elements.filter(
					(element) =>
						element.type !== "blur-effect" ||
						element.syncGroupId !== groupId,
				),
				restored,
			],
		} as TimelineTrack;
	});
}
