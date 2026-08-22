import { useSyncExternalStore, useMemo, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import { usePlaybackFlags } from "@/hooks/use-playback";
import { cn } from "@/utils/ui";
import type {
	TimelineElement,
	VideoElement,
	ImageElement,
	TextElement,
	StickerElement,
	BlurEffectElement,
	ElementType,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { getTextScaleFactor } from "@/constants/text-constants";
import { isBottomAlignedSubtitleText } from "@/lib/timeline/text-utils";
import { resolveAnimatedProperties } from "@/lib/timeline/keyframe-utils";
import { wrapText } from "@/services/renderer/nodes/text-node";
import { getTextVerticalBounds } from "@/lib/preview/text-visual-bounds";
import { resolveAnimatedTextSelectionState } from "@/lib/preview/text-selection-state";

type ScaleHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type ResizeHandle = "left" | "right" | "top" | "bottom";

const HANDLE_SIZE = 10;
const RESIZE_HANDLE_WIDTH = 6;
const RESIZE_HANDLE_HEIGHT = 24;

const SCALE_HANDLES: ScaleHandle[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];

interface ElementBounds {
	left: number;
	top: number;
	width: number;
	height: number;
	rotate: number;
}

function getHandlePosition({ handle }: { handle: ScaleHandle }) {
	switch (handle) {
		case "top-left":
			return { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 };
		case "top-right":
			return { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 };
		case "bottom-left":
			return { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 };
		case "bottom-right":
			return { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 };
	}
}

function getHandleCursor({ handle }: { handle: ScaleHandle }) {
	switch (handle) {
		case "top-left":
		case "bottom-right":
			return "nwse-resize";
		case "top-right":
		case "bottom-left":
			return "nesw-resize";
	}
}

function computeMediaBounds({
	element,
	media,
	canvasWidth,
	canvasHeight,
	displayScale,
}: {
	element: VideoElement | ImageElement;
	media: MediaAsset | undefined;
	canvasWidth: number;
	canvasHeight: number;
	displayScale: number;
}): ElementBounds | null {
	if (!media) return null;

	const mediaW = media.width || canvasWidth;
	const mediaH = media.height || canvasHeight;
	const containScale = Math.min(canvasWidth / mediaW, canvasHeight / mediaH);
	const scaledW = mediaW * containScale * element.transform.scale;
	const scaledH = mediaH * containScale * element.transform.scale;

	const canvasX = canvasWidth / 2 + element.transform.position.x - scaledW / 2;
	const canvasY = canvasHeight / 2 + element.transform.position.y - scaledH / 2;

	return {
		left: canvasX * displayScale,
		top: canvasY * displayScale,
		width: scaledW * displayScale,
		height: scaledH * displayScale,
		rotate: element.transform.rotate,
	};
}

export function computeTextBounds({
	element,
	canvasWidth,
	canvasHeight,
	displayScale,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
	displayScale: number;
}): ElementBounds {
	const scaleFactor = getTextScaleFactor({ canvasWidth, canvasHeight });
	const scaledFontSize = element.fontSize * scaleFactor;

	const elementBoxWidth = element.boxWidth;
	const hasBoxWidth = elementBoxWidth !== undefined && elementBoxWidth > 0;
	const scaledBoxWidth = hasBoxWidth ? elementBoxWidth * scaleFactor : 0;

	let estimatedWidth: number;
	const elementScale = element.transform.scale;
	const lineHeight = scaledFontSize * 1.3;
	const isBottomAligned = isBottomAlignedSubtitleText({ element });
	let actualTextWidth = 0;
	let lineCount = 1;
	let firstLineAscent = scaledFontSize * 0.8;
	let lastLineDescent = scaledFontSize * 0.2;

	if (typeof document !== "undefined") {
		const measureCanvas = document.createElement("canvas");
		const measureContext = measureCanvas.getContext("2d");
		if (measureContext) {
			measureContext.textBaseline = isBottomAligned ? "bottom" : "middle";
			const fontWeight = element.fontWeight === "bold" ? "bold" : "normal";
			const fontStyle = element.fontStyle === "italic" ? "italic" : "normal";
			const fontFamily = element.fontFamily.includes('"')
				? element.fontFamily
				: `"${element.fontFamily}"`;
			measureContext.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
			const lines = hasBoxWidth
				? wrapText({
						context: measureContext,
						text: element.content,
						maxWidth: scaledBoxWidth,
					})
				: element.content.split("\n");
			lineCount = Math.max(1, lines.length);
			actualTextWidth = Math.max(
				...lines.map((line) => measureContext.measureText(line).width),
				0,
			);
			const firstMetrics = measureContext.measureText(lines[0] ?? "");
			const lastMetrics = measureContext.measureText(lines[lines.length - 1] ?? "");
			firstLineAscent = Math.max(
				firstMetrics.actualBoundingBoxAscent || 0,
				scaledFontSize * 0.8,
			);
			lastLineDescent = Math.max(
				lastMetrics.actualBoundingBoxDescent || 0,
				scaledFontSize * 0.2,
			);
		}
	}

	if (hasBoxWidth) {
		estimatedWidth = actualTextWidth || scaledBoxWidth;
		if (!actualTextWidth) {
			const charsPerLine = Math.max(
				1,
				Math.floor(scaledBoxWidth / (scaledFontSize * 0.6)),
			);
			const paragraphs = element.content.split("\n");
			lineCount = Math.max(
				1,
				paragraphs.reduce(
					(sum, p) => sum + Math.max(1, Math.ceil(p.length / charsPerLine)),
					0,
				),
			);
		}
	} else {
		const lines = element.content.split("\n");
		lineCount = Math.max(1, lines.length);
		estimatedWidth = actualTextWidth ||
			Math.max(...lines.map((l) => l.length), 1) * scaledFontSize * 0.6;
	}

	const centerX = canvasWidth / 2 + element.transform.position.x;
	const baseY = canvasHeight / 2 + element.transform.position.y;
	const hasBackground =
		!!element.backgroundColor && element.backgroundColor !== "transparent";
	const paddingX = hasBackground ? (element.backgroundPaddingX ?? 8) : 0;
	const paddingY = hasBackground ? (element.backgroundPaddingY ?? 4) : 0;
	// TextNode uses lineWidth = stroke.width * 2, so the visible stroke can
	// extend roughly stroke.width pixels beyond the fill on every side.
	const strokePadding = element.stroke?.width ?? 0;
	const scaledEstimatedWidth =
		(estimatedWidth + (paddingX + strokePadding) * 2) * elementScale;
	const backgroundWidthRatio =
		typeof element.backgroundWidthRatio === "number"
			? Math.max(0, Math.min(100, element.backgroundWidthRatio))
			: element.backgroundWidthMode === "full"
				? 100
				: 0;
	const backgroundTargetWidth = hasBoxWidth ? scaledBoxWidth : estimatedWidth;
	const widthWithBackground =
		hasBackground && backgroundTargetWidth > estimatedWidth
			? estimatedWidth +
				(backgroundTargetWidth - estimatedWidth) * (backgroundWidthRatio / 100)
			: estimatedWidth;
	const finalWidth =
		(widthWithBackground + (paddingX + strokePadding) * 2) * elementScale;
	const visualWidth = hasBackground ? finalWidth : scaledEstimatedWidth;
	const selectionWidth = hasBoxWidth
		? Math.max(
				visualWidth,
				(scaledBoxWidth + (paddingX + strokePadding) * 2) * elementScale,
			)
		: visualWidth;
	const verticalBounds = getTextVerticalBounds({
		lineCount,
		lineHeight,
		ascent: firstLineAscent,
		descent: lastLineDescent,
		bottomAligned: isBottomAligned,
		backgroundPaddingY: paddingY,
		strokePadding,
		shadowOffsetY: element.shadow?.offsetY ?? 0,
		shadowBlur: element.shadow?.blur ?? 0,
	});
	const topY = baseY + verticalBounds.top * elementScale;
	const scaledEstimatedHeight = verticalBounds.height * elementScale;

	return {
		left: (centerX - selectionWidth / 2) * displayScale,
		top: topY * displayScale,
		width: selectionWidth * displayScale,
		height: scaledEstimatedHeight * displayScale,
		rotate: element.transform.rotate,
	};
}

function computeStickerBounds({
	element,
	canvasWidth,
	canvasHeight,
	displayScale,
}: {
	element: StickerElement;
	canvasWidth: number;
	canvasHeight: number;
	displayScale: number;
}): ElementBounds {
	const stickerSource = 200;
	const containScale = Math.min(
		canvasWidth / stickerSource,
		canvasHeight / stickerSource,
	);
	const stickerSize = stickerSource * containScale * element.transform.scale;

	const centerX = canvasWidth / 2 + element.transform.position.x;
	const centerY = canvasHeight / 2 + element.transform.position.y;

	return {
		left: (centerX - stickerSize / 2) * displayScale,
		top: (centerY - stickerSize / 2) * displayScale,
		width: stickerSize * displayScale,
		height: stickerSize * displayScale,
		rotate: element.transform.rotate,
	};
}

function computeBlurEffectBounds({
	element,
	canvasWidth,
	canvasHeight,
	displayScale,
}: {
	element: BlurEffectElement;
	canvasWidth: number;
	canvasHeight: number;
	displayScale: number;
}): ElementBounds {
	// scale=1 → full canvas, scale=0.5 → half canvas
	// boxWidth narrows the width independently (default 1 = proportional)
	const boxWidth = element.boxWidth ?? 1;
	const boxHeight = element.boxHeight ?? 1;
	const regionWidth = canvasWidth * element.transform.scale * boxWidth;
	const regionHeight = canvasHeight * element.transform.scale * boxHeight;

	const centerX = canvasWidth / 2 + element.transform.position.x;
	const centerY = canvasHeight / 2 + element.transform.position.y;

	return {
		left: (centerX - regionWidth / 2) * displayScale,
		top: (centerY - regionHeight / 2) * displayScale,
		width: regionWidth * displayScale,
		height: regionHeight * displayScale,
		rotate: element.transform.rotate,
	};
}

function computeElementBounds({
	element,
	media,
	canvasWidth,
	canvasHeight,
	displayScale,
	currentTime,
}: {
	element: TimelineElement;
	media: MediaAsset | undefined;
	canvasWidth: number;
	canvasHeight: number;
	displayScale: number;
	currentTime: number;
}): ElementBounds | null {
	// Resolve the animated transform/opacity at the playhead, mirroring the
	// renderer so the selection box tracks the same frame the user sees.
	// `transform` only exists on visual elements; audio is filtered upstream
	// but we narrow here too to satisfy the union type.
	type VisualElement =
		| VideoElement
		| ImageElement
		| TextElement
		| StickerElement
		| BlurEffectElement;
	const isVisual = (
		e: TimelineElement,
	): e is VisualElement & {
		transform: VisualElement["transform"];
		opacity: number;
		keyframes?: VisualElement["keyframes"];
	} =>
		e.type === "video" ||
		e.type === "image" ||
		e.type === "text" ||
		e.type === "sticker" ||
		e.type === "blur-effect";

	if (!isVisual(element)) return null;

	const localTime = Math.max(
		0,
		Math.min(element.duration, currentTime - element.startTime),
	);
	const { transform: resolvedTransform } = resolveAnimatedProperties({
		keyframes: element.keyframes,
		time: localTime,
		baseTransform: element.transform,
		baseOpacity: element.opacity,
	});
	const resolvedElement = {
		...element,
		transform: resolvedTransform,
	} as VisualElement;

	switch (element.type) {
		case "video":
		case "image":
			return computeMediaBounds({
				element: resolvedElement as VideoElement | ImageElement,
				media,
				canvasWidth,
				canvasHeight,
				displayScale,
			});
		case "text": {
			const animatedTextElement = resolveAnimatedTextSelectionState({
				element: element as TextElement,
				resolvedTransform,
				localTime,
			});
			return computeTextBounds({
				element: animatedTextElement,
				canvasWidth,
				canvasHeight,
				displayScale,
			});
		}
		case "sticker":
			return computeStickerBounds({
				element: resolvedElement as StickerElement,
				canvasWidth,
				canvasHeight,
				displayScale,
			});
		case "blur-effect":
			return computeBlurEffectBounds({
				element: resolvedElement as BlurEffectElement,
				canvasWidth,
				canvasHeight,
				displayScale,
			});
		default:
			return null;
	}
}

function ElementOverlay({
	bounds,
	elementType,
	isTransforming,
	onScaleStart,
	onResizeStart,
}: {
	bounds: ElementBounds;
	elementType: ElementType;
	isTransforming: boolean;
	onScaleStart: ({
		event,
		handle,
	}: {
		event: React.PointerEvent;
		handle: ScaleHandle;
	}) => void;
	onResizeStart?: ({
		event,
		handle,
	}: {
		event: React.PointerEvent;
		handle: ResizeHandle;
	}) => void;
}) {
	const [isHovered, setIsHovered] = useState(false);
	const showResizeHandles =
		(elementType === "text" || elementType === "blur-effect") && onResizeStart;
	const shouldShowControls =
		elementType === "text"
			? isHovered || isTransforming
			: elementType !== "blur-effect" || isHovered || isTransforming;

	return (
		<div
			className={cn(
				"absolute",
				elementType === "blur-effect" || elementType === "text"
					? "pointer-events-auto"
					: "pointer-events-none",
			)}
			style={{
				left: bounds.left,
				top: bounds.top,
				width: bounds.width,
				height: bounds.height,
				transform:
					bounds.rotate !== 0 ? `rotate(${bounds.rotate}deg)` : undefined,
				transformOrigin: "center center",
				zIndex: 1000,
			}}
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
		>
			{/* Selection border */}
			{shouldShowControls &&
				(elementType === "blur-effect" ? (
					<div
						className={cn(
							"absolute inset-0 rounded-sm border-2 border-dashed border-amber-500 shadow-sm pointer-events-none",
							isTransforming && "opacity-80",
						)}
					/>
				) : (
					<div
						className={cn(
							"absolute inset-0 rounded border-2",
							isTransforming ? "border-primary/70" : "border-primary",
						)}
					/>
				))}

			{/* Corner handles (proportional scale) */}
			{shouldShowControls &&
				SCALE_HANDLES.map((handle) => (
					<div
						key={handle}
						className={cn(
							"pointer-events-auto absolute transition-transform hover:scale-125",
							elementType === "blur-effect"
								? "bg-amber-400 border border-white size-3 rounded-full shadow-sm"
								: "bg-background border-2 border-primary size-3 rounded-full shadow-xs",
						)}
						style={{
							cursor: getHandleCursor({ handle }),
							...(elementType === "blur-effect"
								? {
										...(handle.includes("left") ? { left: -6 } : { right: -6 }),
										...(handle.includes("top") ? { top: -6 } : { bottom: -6 }),
									}
								: getHandlePosition({ handle })),
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
							onScaleStart({ event, handle });
						}}
					/>
				))}

			{/* Side handles for text & blur-effect width resize */}
			{shouldShowControls && showResizeHandles && (
				<>
					{/* Left handle */}
					<div
						className={cn(
							"pointer-events-auto absolute border transition-transform hover:scale-110",
							elementType === "blur-effect"
								? "bg-amber-400 border-white size-2 rounded-full"
								: "bg-primary border-background rounded-sm",
						)}
						style={{
							width: elementType === "blur-effect" ? 8 : RESIZE_HANDLE_WIDTH,
							height: elementType === "blur-effect" ? 18 : RESIZE_HANDLE_HEIGHT,
							cursor: "ew-resize",
							left:
								elementType === "blur-effect" ? -4 : -RESIZE_HANDLE_WIDTH / 2,
							top: "50%",
							transform: "translateY(-50%)",
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
							onResizeStart({ event, handle: "left" });
						}}
					/>
					{/* Right handle */}
					<div
						className={cn(
							"pointer-events-auto absolute border transition-transform hover:scale-110",
							elementType === "blur-effect"
								? "bg-amber-400 border-white size-2 rounded-full"
								: "bg-primary border-background rounded-sm",
						)}
						style={{
							width: elementType === "blur-effect" ? 8 : RESIZE_HANDLE_WIDTH,
							height: elementType === "blur-effect" ? 18 : RESIZE_HANDLE_HEIGHT,
							cursor: "ew-resize",
							right:
								elementType === "blur-effect" ? -4 : -RESIZE_HANDLE_WIDTH / 2,
							top: "50%",
							transform: "translateY(-50%)",
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
							onResizeStart({ event, handle: "right" });
						}}
					/>
				</>
			)}

			{/* Top/bottom handles for blur-effect height resize */}
			{shouldShowControls && elementType === "blur-effect" && onResizeStart && (
				<>
					{/* Top handle */}
					<div
						className="pointer-events-auto absolute border transition-transform hover:scale-110 bg-amber-400 border-white rounded-full"
						style={{
							width: 18,
							height: 8,
							cursor: "ns-resize",
							left: "50%",
							top: -4,
							transform: "translateX(-50%)",
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
							onResizeStart({ event, handle: "top" });
						}}
					/>
					{/* Bottom handle */}
					<div
						className="pointer-events-auto absolute border transition-transform hover:scale-110 bg-amber-400 border-white rounded-full"
						style={{
							width: 18,
							height: 8,
							cursor: "ns-resize",
							left: "50%",
							bottom: -4,
							transform: "translateX(-50%)",
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
							onResizeStart({ event, handle: "bottom" });
						}}
					/>
				</>
			)}
		</div>
	);
}

export function SelectionOverlay({
	displaySize,
	onScaleStart,
	onResizeStart,
	isTransforming,
}: {
	displaySize: { width: number; height: number };
	onScaleStart: ({
		event,
		handle,
		element,
		trackId,
	}: {
		event: React.PointerEvent;
		handle: ScaleHandle;
		element: TimelineElement;
		trackId: string;
	}) => void;
	onResizeStart: ({
		event,
		handle,
		element,
		trackId,
	}: {
		event: React.PointerEvent;
		handle: ResizeHandle;
		element: TimelineElement;
		trackId: string;
	}) => void;
	isTransforming: boolean;
}) {
	const editor = useEditor();

	const selectedElements = useSyncExternalStore(
		(listener) => editor.selection.subscribe(listener),
		() => editor.selection.getSelectedElements(),
	);

	const { isPlaying } = usePlaybackFlags();
	const currentTime = editor.playback.getCurrentTime();
	const activeProject = editor.project.getActive();
	const mediaAssets = editor.media.getAssets();
	const canvasWidth = activeProject?.settings.canvasSize.width ?? 0;
	const canvasHeight = activeProject?.settings.canvasSize.height ?? 0;
	const displayScale = canvasWidth > 0 ? displaySize.width / canvasWidth : 1;

	const mediaMap = useMemo(
		() => new Map(mediaAssets.map((asset) => [asset.id, asset])),
		[mediaAssets],
	);

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});

	const visibleElements = elementsWithTracks.filter(({ element }) => {
		if (element.type === "audio") return false;
		return (
			currentTime >= element.startTime &&
			currentTime < element.startTime + element.duration
		);
	});

	if (isPlaying || visibleElements.length === 0 || displaySize.width === 0) {
		return null;
	}

	return (
		<>
			{visibleElements.map(({ track, element }) => {
				const media =
					"mediaId" in element ? mediaMap.get(element.mediaId) : undefined;

				const bounds = computeElementBounds({
					element,
					media,
					canvasWidth,
					canvasHeight,
					displayScale,
					currentTime,
				});

				if (!bounds) return null;

				return (
					<ElementOverlay
						key={element.id}
						bounds={bounds}
						elementType={element.type}
						isTransforming={isTransforming}
						onScaleStart={({ event, handle }) =>
							onScaleStart({
								event,
								handle,
								element,
								trackId: track.id,
							})
						}
						onResizeStart={({ event, handle }) =>
							onResizeStart({
								event,
								handle,
								element,
								trackId: track.id,
							})
						}
					/>
				);
			})}
		</>
	);
}
