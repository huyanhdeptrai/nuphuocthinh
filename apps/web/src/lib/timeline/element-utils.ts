import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type {
	CreateTimelineElement,
	CreateVideoElement,
	CreateImageElement,
	CreateStickerElement,
	CreateBlurEffectElement,
	CreateUploadAudioElement,
	CreateLibraryAudioElement,
	TextElement,
	TimelineElement,
	TimelineTrack,
	AudioElement,
	VideoElement,
	ImageElement,
	StickerElement,
	UploadAudioElement,
} from "@/types/timeline";

export function canElementHaveAudio(
	element: TimelineElement,
): element is AudioElement | VideoElement {
	return element.type === "audio" || element.type === "video";
}

export function canElementBeHidden(
	element: TimelineElement,
): element is VideoElement | ImageElement | TextElement | StickerElement {
	return element.type !== "audio";
}

export function hasMediaId(
	element: TimelineElement,
): element is UploadAudioElement | VideoElement | ImageElement {
	return "mediaId" in element;
}

export function requiresMediaId({
	element,
}: {
	element: CreateTimelineElement;
}): boolean {
	return (
		element.type === "video" ||
		element.type === "image" ||
		(element.type === "audio" && element.sourceType === "upload")
	);
}

export function checkElementOverlaps({
	elements,
}: {
	elements: TimelineElement[];
}): boolean {
	const sortedElements = [...elements].sort(
		(a, b) => a.startTime - b.startTime,
	);

	for (let i = 0; i < sortedElements.length - 1; i++) {
		const current = sortedElements[i];
		const next = sortedElements[i + 1];

		const currentEnd = current.startTime + current.duration;

		if (currentEnd > next.startTime) return true;
	}

	return false;
}

export function resolveElementOverlaps({
	elements,
}: {
	elements: TimelineElement[];
}): TimelineElement[] {
	const sortedElements = [...elements].sort(
		(a, b) => a.startTime - b.startTime,
	);
	const resolvedElements: TimelineElement[] = [];

	for (let i = 0; i < sortedElements.length; i++) {
		const current = { ...sortedElements[i] };

		if (resolvedElements.length > 0) {
			const previous = resolvedElements[resolvedElements.length - 1];
			const previousEnd = previous.startTime + previous.duration;

			if (current.startTime < previousEnd) {
				current.startTime = previousEnd;
			}
		}

		resolvedElements.push(current);
	}

	return resolvedElements;
}

export function wouldElementOverlap({
	elements,
	startTime,
	endTime,
	excludeElementId,
}: {
	elements: TimelineElement[];
	startTime: number;
	endTime: number;
	excludeElementId?: string;
}): boolean {
	return elements.some((el) => {
		if (excludeElementId && el.id === excludeElementId) return false;
		const elEnd = el.startTime + el.duration;
		return startTime < elEnd && endTime > el.startTime;
	});
}

export function buildTextElement({
	raw,
	startTime,
}: {
	raw: Partial<Omit<TextElement, "type" | "id">>;
	startTime: number;
}): CreateTimelineElement {
	const t = raw as Partial<TextElement>;

	return {
		type: "text",
		name: t.name ?? DEFAULT_TEXT_ELEMENT.name,
		content: t.content ?? DEFAULT_TEXT_ELEMENT.content,
		duration: t.duration ?? TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		fontSize:
			typeof t.fontSize === "number"
				? t.fontSize
				: DEFAULT_TEXT_ELEMENT.fontSize,
		fontFamily: t.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily,
		color: t.color ?? DEFAULT_TEXT_ELEMENT.color,
		backgroundColor: t.backgroundColor ?? DEFAULT_TEXT_ELEMENT.backgroundColor,
		textAlign: t.textAlign ?? DEFAULT_TEXT_ELEMENT.textAlign,
		fontWeight: t.fontWeight ?? DEFAULT_TEXT_ELEMENT.fontWeight,
		fontStyle: t.fontStyle ?? DEFAULT_TEXT_ELEMENT.fontStyle,
		textDecoration: t.textDecoration ?? DEFAULT_TEXT_ELEMENT.textDecoration,
		transform: t.transform ?? DEFAULT_TEXT_ELEMENT.transform,
		opacity: t.opacity ?? DEFAULT_TEXT_ELEMENT.opacity,
		stroke: t.stroke,
		shadow: t.shadow,
		boxWidth: t.boxWidth,
		backgroundBorderRadius: t.backgroundBorderRadius,
		backgroundOpacity: t.backgroundOpacity,
		backgroundPaddingX: t.backgroundPaddingX,
		backgroundPaddingY: t.backgroundPaddingY,
		backgroundWidthMode: t.backgroundWidthMode,
		backgroundWidthRatio: t.backgroundWidthRatio,
	};
}

export function buildStickerElement({
	iconName,
	startTime,
}: {
	iconName: string;
	startTime: number;
}): CreateStickerElement {
	return {
		type: "sticker",
		name: iconName.split(":")[1] || iconName,
		iconName,
		duration: TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

export function buildBlurEffectElement({
	startTime,
	blurIntensity = 50,
	effectMode = "blur",
	boxWidth = 0.45,
	boxHeight = 0.35,
	duration = TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION,
}: {
	startTime: number;
	blurIntensity?: number;
	effectMode?: import("@/types/timeline").OverlayEffectMode;
	boxWidth?: number;
	boxHeight?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		name: effectMode === "blur-strip" ? "Dải làm mờ" : "Làm mờ",
		effectMode,
		blurIntensity,
		feather: 0.4,
		boxWidth,
		boxHeight,
		darkenOverlay: effectMode === "blur-strip" ? 35 : 0,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

const OVERLAY_EFFECT_DURATION = 4;

export function buildBlurStripElement({
	startTime,
	blurIntensity = 128,
	feather = 0.5,
	duration = OVERLAY_EFFECT_DURATION,
}: {
	startTime: number;
	blurIntensity?: number;
	feather?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		name: "Dải làm mờ",
		effectMode: "blur-strip",
		blurIntensity,
		feather,
		boxWidth: 0.6,
		boxHeight: 0.2,
		darkenOverlay: 35,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 150 }, rotate: 0 },
		opacity: 1,
		syncWithSubtitles: false,
		subtitlePaddingStart: 0.1,
		subtitlePaddingEnd: 0.1,
	};
}

export function buildPixelateElement({
	startTime,
	pixelSize = 16,
	feather = 0.5,
	duration = OVERLAY_EFFECT_DURATION,
}: {
	startTime: number;
	pixelSize?: number;
	feather?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		name: "Pixelate",
		effectMode: "pixelate",
		blurIntensity: 50,
		pixelSize,
		feather,
		boxWidth: 0.45,
		boxHeight: 0.35,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
		syncWithSubtitles: false,
		subtitlePaddingStart: 0.1,
		subtitlePaddingEnd: 0.1,
	};
}

export function buildFrostedGlassElement({
	startTime,
	feather = 0.5,
	blurIntensity = 80,
	grainIntensity = 30,
	duration = OVERLAY_EFFECT_DURATION,
}: {
	startTime: number;
	feather?: number;
	blurIntensity?: number;
	grainIntensity?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		name: "Frosted Glass",
		effectMode: "frosted-glass",
		blurIntensity,
		grainIntensity,
		feather,
		boxWidth: 0.45,
		boxHeight: 0.35,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
		syncWithSubtitles: false,
		subtitlePaddingStart: 0.1,
		subtitlePaddingEnd: 0.1,
	};
}

export function buildRemoveLogoElement({
	startTime,
	feather = 0.5,
	borderPadding = 4,
	blurIntensity = 75,
	duration = OVERLAY_EFFECT_DURATION,
}: {
	startTime: number;
	feather?: number;
	borderPadding?: number;
	blurIntensity?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		name: "Kính mờ",
		effectMode: "remove-logo",
		blurIntensity,
		feather,
		borderPadding,
		boxWidth: 0.35,
		boxHeight: 0.2,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: -100 }, rotate: 0 },
		opacity: 1,
		syncWithSubtitles: false,
		subtitlePaddingStart: 0.1,
		subtitlePaddingEnd: 0.1,
	};
}

export function buildRemoveSubtitleElement({
	startTime,
	feather = 0.5,
	borderPadding = 6,
	blurIntensity = 75,
	duration = OVERLAY_EFFECT_DURATION,
}: {
	startTime: number;
	feather?: number;
	borderPadding?: number;
	blurIntensity?: number;
	duration?: number;
}): CreateBlurEffectElement {
	return {
		type: "blur-effect",
		// Legacy builder retained only for projects saved before the preset was removed.
		name: "Kính mờ",
		effectMode: "remove-subtitle",
		blurIntensity,
		feather,
		borderPadding,
		boxWidth: 0.75,
		boxHeight: 0.15,
		expandTop: 0,
		expandBottom: 0,
		expandLeft: 0,
		expandRight: 0,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 160 }, rotate: 0 },
		opacity: 1,
		syncWithSubtitles: false,
		subtitlePaddingStart: 0.1,
		subtitlePaddingEnd: 0.1,
	};
}

export function findLatestOverlayElementRef({
	tracks,
	effectMode,
	startTime,
}: {
	tracks: TimelineTrack[];
	effectMode: import("@/types/timeline").OverlayEffectMode;
	startTime: number;
}): { trackId: string; elementId: string } | null {
	let found: { trackId: string; elementId: string } | null = null;
	for (const track of tracks) {
		for (const element of track.elements) {
			if (
				element.type === "blur-effect" &&
				element.effectMode === effectMode &&
				element.startTime === startTime
			) {
				found = { trackId: track.id, elementId: element.id };
			}
		}
	}
	return found;
}

export function buildVideoElement({
	mediaId,
	name,
	duration,
	startTime,
}: {
	mediaId: string;
	name: string;
	duration: number;
	startTime: number;
}): CreateVideoElement {
	return {
		type: "video",
		mediaId,
		name,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		muted: false,
		hidden: false,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

export function buildImageElement({
	mediaId,
	name,
	duration,
	startTime,
}: {
	mediaId: string;
	name: string;
	duration: number;
	startTime: number;
}): CreateImageElement {
	return {
		type: "image",
		mediaId,
		name,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		hidden: false,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

export function buildUploadAudioElement({
	mediaId,
	name,
	duration,
	startTime,
	buffer,
}: {
	mediaId: string;
	name: string;
	duration: number;
	startTime: number;
	buffer?: AudioBuffer;
}): CreateUploadAudioElement {
	const element: CreateUploadAudioElement = {
		type: "audio",
		sourceType: "upload",
		mediaId,
		name,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		volume: 1,
		muted: false,
	};
	if (buffer) {
		element.buffer = buffer;
	}
	return element;
}

export function buildLibraryAudioElement({
	sourceUrl,
	name,
	duration,
	startTime,
	buffer,
}: {
	sourceUrl: string;
	name: string;
	duration: number;
	startTime: number;
	buffer?: AudioBuffer;
}): CreateLibraryAudioElement {
	const element: CreateLibraryAudioElement = {
		type: "audio",
		sourceType: "library",
		sourceUrl,
		name,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		volume: 1,
		muted: false,
	};
	if (buffer) {
		element.buffer = buffer;
	}
	return element;
}

export function getElementsAtTime({
	tracks,
	time,
}: {
	tracks: TimelineTrack[];
	time: number;
}): { trackId: string; elementId: string }[] {
	const result: { trackId: string; elementId: string }[] = [];

	for (const track of tracks) {
		for (const element of track.elements) {
			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;

			if (time > elementStart && time < elementEnd) {
				result.push({ trackId: track.id, elementId: element.id });
			}
		}
	}

	return result;
}
