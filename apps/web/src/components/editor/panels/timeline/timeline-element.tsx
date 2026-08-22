"use client";

import { useEditor } from "@/hooks/use-editor";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import {
	type DuckWindow,
	collectNarrationDuckWindows,
} from "@/dubbing/services/duck-envelope";
import AudioWaveform from "./audio-waveform";
import { useTimelineElementResize } from "@/hooks/timeline/element/use-element-resize";
import type { SnapPoint } from "@/hooks/timeline/use-timeline-snapping";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	getTrackClasses,
	getTrackHeight,
	canElementHaveAudio,
	canElementBeHidden,
	hasMediaId,
} from "@/lib/timeline";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuCheckboxItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "../../../ui/context-menu";
import type {
	TimelineElement as TimelineElementType,
	TimelineTrack,
	ElementDragState,
	VideoElement,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { mediaSupportsAudio } from "@/lib/media/media-utils";
import { getActionDefinition, type TAction, invokeAction } from "@/lib/actions";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import Image from "next/image";
import {
	ScissorIcon,
	Delete02Icon,
	Copy01Icon,
	ViewIcon,
	ViewOffSlashIcon,
	VolumeHighIcon,
	VolumeOffIcon,
	VolumeMute02Icon,
	Search01Icon,
	Exchange01Icon,
	MusicNote03Icon,
	FlipHorizontalIcon,
	ArrowTurnBackwardIcon,
	Edit02Icon,
	AiVoiceGeneratorIcon,
	BlurIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { uppercase } from "@/utils/string";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { useState, type ComponentProps } from "react";
import { VideoThumbnailStrip } from "./video-thumbnail-strip";
import { KeyframeDiamonds } from "./keyframe-diamonds";

function getDisplayShortcut(action: TAction) {
	const { defaultShortcuts } = getActionDefinition(action);
	if (!defaultShortcuts?.length) {
		return "";
	}

	return uppercase({
		string: defaultShortcuts[0].replace("+", " "),
	});
}

interface TimelineElementProps {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	onResizeStateChange?: (params: { isResizing: boolean }) => void;
	onElementMouseDown: (
		e: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	onElementClick: (e: React.MouseEvent, element: TimelineElementType) => void;
	dragState: ElementDragState;
}

export function TimelineElement({
	element,
	track,
	zoomLevel,
	isSelected,
	onSnapPointChange,
	onResizeStateChange,
	onElementMouseDown,
	onElementClick,
	dragState,
}: TimelineElementProps) {
	const { t } = useTranslation();
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const { requestRevealMedia } = useAssetsPanelStore();
	const [isSpeedResizeMode, setIsSpeedResizeMode] = useState(false);

	const mediaAssets = editor.media.getAssets();
	let mediaAsset: MediaAsset | null = null;

	if (hasMediaId(element)) {
		mediaAsset =
			mediaAssets.find((asset) => asset.id === element.mediaId) ?? null;
	}

	const hasAudio = mediaSupportsAudio({ media: mediaAsset });

	const { handleResizeStart, isResizing, currentStartTime, currentDuration } =
		useTimelineElementResize({
			element,
			track,
			zoomLevel,
			onSnapPointChange,
		onResizeStateChange,
		resizeMode: isSpeedResizeMode ? "speed" : "trim",
		});

	const isCurrentElementSelected = selectedElements.some(
		(selected) =>
			selected.elementId === element.id && selected.trackId === track.id,
	);

	const isBeingDragged = dragState.elementId === element.id;
	const isBatchDragged =
		!isBeingDragged &&
		dragState.isDragging &&
		isCurrentElementSelected &&
		selectedElements.length > 1;
	const timeDelta = dragState.isDragging
		? dragState.currentTime - dragState.startElementTime
		: 0;
	const dragOffsetY =
		isBeingDragged && dragState.isDragging
			? dragState.currentMouseY - dragState.startMouseY
			: 0;
	const elementStartTime =
		isBeingDragged && dragState.isDragging
			? dragState.currentTime
			: isBatchDragged
				? Math.max(0, element.startTime + timeDelta)
				: element.startTime;
	const displayedStartTime = isResizing ? currentStartTime : elementStartTime;
	const displayedDuration = isResizing ? currentDuration : element.duration;
	const elementWidth =
		displayedDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const elementLeft = displayedStartTime * 50 * zoomLevel;

	const handleRevealInMedia = ({ event }: { event: React.MouseEvent }) => {
		event.stopPropagation();
		if (hasMediaId(element)) {
			requestRevealMedia(element.mediaId);
		}
	};

	const isMuted = canElementHaveAudio(element) && element.muted === true;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={`absolute top-0 h-full select-none ${
						isBeingDragged ? "z-30" : "z-10"
					}`}
					style={{
						left: `${elementLeft}px`,
						width: `${elementWidth}px`,
						transform:
							isBeingDragged && dragState.isDragging
								? `translate3d(0, ${dragOffsetY}px, 0)`
								: undefined,
					}}
				>
					<ElementInner
						element={element}
						track={track}
						zoomLevel={zoomLevel}
						isSelected={isSelected}
						isBeingDragged={isBeingDragged}
						hasAudio={hasAudio}
						isMuted={isMuted}
						mediaAssets={mediaAssets}
						onElementClick={onElementClick}
						onElementMouseDown={onElementMouseDown}
						handleResizeStart={handleResizeStart}
					/>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="z-200 w-64">
				<ActionMenuItem
					action="split"
					icon={<HugeiconsIcon icon={ScissorIcon} />}
				>
					{t("Split")}
				</ActionMenuItem>
				<CopyMenuItem />
				{canElementHaveAudio(element) && hasAudio && (
					<>
						<ContextMenuCheckboxItem
							checked={isSpeedResizeMode}
							onClick={(event) => {
								event.stopPropagation();
								setIsSpeedResizeMode((enabled) => !enabled);
							}}
						>
							{t("Edit speed by dragging")}
						</ContextMenuCheckboxItem>
						<MuteMenuItem
							isMultipleSelected={selectedElements.length > 1}
							isCurrentElementSelected={isCurrentElementSelected}
							isMuted={isMuted}
						/>
						{element.type === "video" && (
							<ActionMenuItem
								action="detach-audio"
								icon={<HugeiconsIcon icon={MusicNote03Icon} />}
							>
								{t("Detach audio")}
							</ActionMenuItem>
						)}
					</>
				)}
				{element.type === "video" && selectedElements.length === 1 && (
					<VideoEditSubmenu
						element={element as VideoElement}
						trackId={track.id}
					/>
				)}
				{element.type === "text" && (
					<ActionMenuItem
						action="convert-to-speech"
						icon={<HugeiconsIcon icon={AiVoiceGeneratorIcon} />}
					>
						{selectedElements.length > 1
							? t("Convert {{count}} to speech", {
									count: selectedElements.length,
								})
							: t("Convert to speech")}
					</ActionMenuItem>
				)}
				{canElementBeHidden(element) && (
					<VisibilityMenuItem
						element={element}
						isMultipleSelected={selectedElements.length > 1}
						isCurrentElementSelected={isCurrentElementSelected}
					/>
				)}
				{selectedElements.length === 1 && (
					<ActionMenuItem
						action="duplicate-selected"
						icon={<HugeiconsIcon icon={Copy01Icon} />}
					>
						{t("Duplicate")}
					</ActionMenuItem>
				)}
				{selectedElements.length === 1 && hasMediaId(element) && (
					<>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Search01Icon} />}
							onClick={(event) => handleRevealInMedia({ event })}
						>
							{t("Reveal media")}
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Exchange01Icon} />}
							disabled
						>
							{t("Replace media")}
						</ContextMenuItem>
					</>
				)}
				<ContextMenuSeparator />
				<DeleteMenuItem
					isMultipleSelected={selectedElements.length > 1}
					isCurrentElementSelected={isCurrentElementSelected}
					elementType={element.type}
					selectedCount={selectedElements.length}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function ElementInner({
	element,
	track,
	zoomLevel,
	isSelected,
	isBeingDragged,
	hasAudio,
	isMuted,
	mediaAssets,
	onElementClick,
	onElementMouseDown,
	handleResizeStart,
}: {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	isBeingDragged: boolean;
	hasAudio: boolean;
	isMuted: boolean;
	mediaAssets: MediaAsset[];
	onElementClick: (e: React.MouseEvent, element: TimelineElementType) => void;
	onElementMouseDown: (
		e: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	handleResizeStart: (params: {
		e: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
}) {
	const customBgColor =
		("speakerColor" in element && (element as any).speakerColor) ||
		("timelineColor" in element && (element as any).timelineColor) ||
		("subtitleSpeaker" in element && (element as any).subtitleSpeaker?.color) ||
		(element.type === "audio" && "color" in element && element.color) ||
		("color" in track && (track as any).color);

	return (
		<div
			className={`relative h-full cursor-pointer overflow-hidden rounded-[0.5rem] ${
				customBgColor ? "" : getTrackClasses({ type: track.type })
			} ${isBeingDragged ? "z-30" : "z-10"} ${canElementBeHidden(element) && element.hidden ? "opacity-50" : ""}`}
			style={customBgColor ? { backgroundColor: customBgColor } : undefined}
		>
			<button
				type="button"
				className="absolute inset-0 size-full cursor-pointer"
				onClick={(e) => onElementClick(e, element)}
				onMouseDown={(e) => onElementMouseDown(e, element)}
			>
				<div className="absolute inset-0 flex h-full items-center">
					<ElementContent
						element={element}
						track={track}
						zoomLevel={zoomLevel}
						mediaAssets={mediaAssets}
					/>
				</div>

				{canElementBeHidden(element) && element.hidden && (
					<div className="bg-opacity-50 pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
						<HugeiconsIcon
							icon={ViewOffSlashIcon}
							className="size-6 text-white"
						/>
					</div>
				)}
				{hasAudio && isMuted && (
					<div className="pointer-events-none absolute right-1 bottom-1 flex items-center justify-center rounded bg-black/60 p-0.5">
						<HugeiconsIcon
							icon={VolumeOffIcon}
							className="size-3.5 text-white"
						/>
					</div>
				)}
			</button>

			{/* Keyframe diamonds overlay (click to seek, drag to retime). */}
			<KeyframeDiamonds
				element={element}
				trackId={track.id}
				zoomLevel={zoomLevel}
			/>

			{isSelected && (
				<>
					<div className="pointer-events-none absolute inset-0 z-20 rounded-[0.5rem] border-2 border-red-500 ring-2 ring-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
					<ResizeHandle
						side="left"
						elementId={element.id}
						handleResizeStart={handleResizeStart}
					/>
					<ResizeHandle
						side="right"
						elementId={element.id}
						handleResizeStart={handleResizeStart}
					/>
				</>
			)}
		</div>
	);
}

function ResizeHandle({
	side,
	elementId,
	handleResizeStart,
}: {
	side: "left" | "right";
	elementId: string;
	handleResizeStart: (params: {
		e: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
}) {
	const isLeft = side === "left";
	return (
		<button
			type="button"
			className={`bg-red-500 border border-white/80 shadow-md absolute top-0 bottom-0 z-50 flex w-[0.65rem] items-center justify-center ${
				isLeft
					? "left-0 cursor-w-resize rounded-l-[0.35rem]"
					: "right-0 cursor-e-resize rounded-r-[0.35rem]"
			}`}
			onMouseDown={(e) => handleResizeStart({ e, elementId, side })}
			aria-label={`${isLeft ? "Left" : "Right"} resize handle`}
		>
			<div className="bg-white h-[1.5rem] w-[0.2rem] rounded-full shadow-xs" />
		</button>
	);
}

function ElementContent({
	element,
	track,
	zoomLevel,
	mediaAssets,
}: {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	mediaAssets: MediaAsset[];
}) {
	if (element.type === "text") {
		return (
			<div className="flex size-full items-center justify-start pl-2">
				<span className="truncate text-xs text-white">{element.content}</span>
			</div>
		);
	}

	if (element.type === "sticker") {
		return (
			<div className="flex size-full items-center gap-2 pl-2">
				<Image
					src={`https://api.iconify.design/${element.iconName}.svg?width=20&height=20`}
					alt={element.name}
					className="size-5 shrink-0"
					width={20}
					height={20}
					unoptimized
				/>
				<span className="truncate text-xs text-white">{element.name}</span>
			</div>
		);
	}

	if (element.type === "blur-effect") {
		return (
			<div className="flex size-full items-center gap-2 pl-2">
				<HugeiconsIcon icon={BlurIcon} className="size-4 shrink-0 text-white" />
				<span className="truncate text-xs text-white">
					{element.name} ({element.blurIntensity}%)
				</span>
			</div>
		);
	}

	if (element.type === "audio") {
		const audioBuffer = element.buffer;
		const audioBlob =
			element.sourceType === "upload"
				? mediaAssets.find((asset) => asset.id === element.mediaId)?.file
				: undefined;

		const audioUrl =
			element.sourceType === "library"
				? element.sourceUrl
				: mediaAssets.find((asset) => asset.id === element.mediaId)?.url;

		if (audioBuffer || audioUrl || audioBlob) {
			return (
				<div className="relative flex size-full items-center gap-2 overflow-hidden">
					<div className="min-w-0 flex-1">
						<AudioWaveform
							audioBuffer={audioBuffer}
							audioBlob={audioBlob}
							audioUrl={audioUrl}
							duration={element.duration}
							volume={element.volume}
							height={24}
							className="w-full"
						/>
					</div>
					<SourceAudioDuckingOverlay element={element} zoomLevel={zoomLevel} />
				</div>
			);
		}

		return (
			<div className="relative flex size-full items-center pl-2 overflow-hidden">
				<span className="text-foreground/80 truncate text-xs">
					{element.name}
				</span>
				<SourceAudioDuckingOverlay element={element} zoomLevel={zoomLevel} />
			</div>
		);
	}

	const mediaAsset = mediaAssets.find((asset) => asset.id === element.mediaId);
	if (!mediaAsset) {
		return (
			<span className="text-foreground/80 truncate text-xs">
				{element.name}
			</span>
		);
	}

	if (mediaAsset.type === "video" && mediaAsset.file) {
		const trackHeight = getTrackHeight({ type: track.type });
		const elementWidth =
			element.duration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

		return (
			<div className="relative size-full">
				<VideoThumbnailStrip
					mediaId={element.mediaId}
					file={mediaAsset.file}
					thumbnailUrl={mediaAsset.thumbnailUrl}
					trimStart={element.trimStart}
					duration={element.duration}
					elementWidth={elementWidth}
					trackHeight={trackHeight}
					zoomLevel={zoomLevel}
					fps={mediaAsset.fps ?? 30}
					mediaWidth={mediaAsset.width ?? 1920}
					mediaHeight={mediaAsset.height ?? 1080}
				/>
			</div>
		);
	}

	if (mediaAsset.type === "image" && mediaAsset.url) {
		return (
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: `url(${mediaAsset.url})`,
					backgroundRepeat: "no-repeat",
					backgroundSize: "cover",
					backgroundPosition: "center",
					pointerEvents: "none",
				}}
			/>
		);
	}

	return (
		<span className="text-foreground/80 truncate text-xs">{element.name}</span>
	);
}

function CopyMenuItem() {
	const { t } = useTranslation();
	return (
		<ActionMenuItem
			action="copy-selected"
			icon={<HugeiconsIcon icon={Copy01Icon} />}
		>
			{t("Copy")}
		</ActionMenuItem>
	);
}

function MuteMenuItem({
	isMultipleSelected,
	isCurrentElementSelected,
	isMuted,
}: {
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
	isMuted: boolean;
}) {
	const getIcon = () => {
		if (isMultipleSelected && isCurrentElementSelected) {
			return <HugeiconsIcon icon={VolumeMute02Icon} />;
		}
		return isMuted ? (
			<HugeiconsIcon icon={VolumeHighIcon} />
		) : (
			<HugeiconsIcon icon={VolumeOffIcon} />
		);
	};

	const { t } = useTranslation();
	return (
		<ActionMenuItem action="toggle-elements-muted-selected" icon={getIcon()}>
			{isMuted ? t("Unmute") : t("Mute")}
		</ActionMenuItem>
	);
}

function VisibilityMenuItem({
	element,
	isMultipleSelected,
	isCurrentElementSelected,
}: {
	element: TimelineElementType;
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
}) {
	const isHidden = canElementBeHidden(element) && element.hidden;

	const getIcon = () => {
		if (isMultipleSelected && isCurrentElementSelected) {
			return <HugeiconsIcon icon={ViewOffSlashIcon} />;
		}
		return isHidden ? (
			<HugeiconsIcon icon={ViewIcon} />
		) : (
			<HugeiconsIcon icon={ViewOffSlashIcon} />
		);
	};

	const { t } = useTranslation();
	return (
		<ActionMenuItem
			action="toggle-elements-visibility-selected"
			icon={getIcon()}
		>
			{isHidden ? t("Show") : t("Hide")}
		</ActionMenuItem>
	);
}

function DeleteMenuItem({
	isMultipleSelected,
	isCurrentElementSelected,
	elementType,
	selectedCount,
}: {
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
	elementType: TimelineElementType["type"];
	selectedCount: number;
}) {
	const { t } = useTranslation();
	return (
		<ActionMenuItem
			action="delete-selected"
			variant="destructive"
			icon={<HugeiconsIcon icon={Delete02Icon} />}
		>
			{isMultipleSelected && isCurrentElementSelected
				? t("Delete {{count}} elements", { count: selectedCount })
				: t("Delete {{type}}", {
						type: elementType === "text" ? t("text") : t("clip"),
					})}
		</ActionMenuItem>
	);
}

function VideoEditSubmenu({
	element,
	trackId,
}: {
	element: VideoElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const editor = useEditor();

	const isMirrored = element.transform.flipX === true;
	const isReversed = element.reversed === true;

	const toggleMirror = (event: React.MouseEvent) => {
		event.stopPropagation();
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						transform: {
							...element.transform,
							flipX: !isMirrored,
						},
					},
				},
			],
		});
	};

	const toggleReverse = (event: React.MouseEvent) => {
		event.stopPropagation();
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { reversed: !isReversed },
				},
			],
		});
	};

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<HugeiconsIcon icon={Edit02Icon} className="size-4" />
				{t("Basic Edit")}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-48">
				<ContextMenuCheckboxItem
					className="px-4"
					checked={isMirrored}
					onClick={toggleMirror}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							toggleMirror(event as unknown as React.MouseEvent);
						}
					}}
				>
					<HugeiconsIcon icon={FlipHorizontalIcon} className="size-4" />
					{t("Mirror")}
				</ContextMenuCheckboxItem>
				<ContextMenuCheckboxItem
					className="px-4"
					checked={isReversed}
					onClick={toggleReverse}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							toggleReverse(event as unknown as React.MouseEvent);
						}
					}}
				>
					<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-4" />
					{t("Reverse")}
				</ContextMenuCheckboxItem>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

function ActionMenuItem({
	action,
	children,
	...props
}: Omit<ComponentProps<typeof ContextMenuItem>, "onClick" | "textRight"> & {
	action: TAction;
}) {
	return (
		<ContextMenuItem
			onClick={(event) => {
				event.stopPropagation();
				invokeAction(action);
			}}
			textRight={getDisplayShortcut(action)}
			{...props}
		>
			{children}
		</ContextMenuItem>
	);
}

function SourceAudioDuckingOverlay({
	element,
	zoomLevel,
}: {
	element: TimelineElementType;
	zoomLevel: number;
}) {
	const editor = useEditor();
	const { settings, duckOverrides, setDuckOverride } = useDubbingStore();
	const isMusicStem =
		("audioRole" in element && element.audioRole === "music-stem") ||
		element.name.startsWith("[Nhạc nền video:");

	if (isMusicStem) return null;

	const isSource =
		("audioRole" in element &&
			(element.audioRole === "source" || element.audioRole === "ducked-source")) ||
		element.name.startsWith("[Nguồn video:") ||
		element.name.startsWith("[Hạ âm video:");

	if (!settings.autoDucking || !isSource) return null;

	const tracks = editor.timeline.getTracks();
	const duckWindows = collectNarrationDuckWindows({ tracks, duckOverrides });
	if (duckWindows.length === 0) return null;

	const elementStart = element.startTime;
	const elementEnd = element.startTime + element.duration;

	const relevantWindows = duckWindows
		.map((win) => {
			const start = Math.max(elementStart, win.start);
			const end = Math.min(elementEnd, win.end);
			return { ...win, start, end };
		})
		.filter((win) => win.end > win.start);

	if (relevantWindows.length === 0) return null;

	const defaultDuckVolume = settings.duckingVolume ?? 0.15;

	return (
		<div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
			{relevantWindows.map((win, idx) => (
				<DuckingZoneItem
					key={win.id || idx}
					win={win}
					element={element}
					zoomLevel={zoomLevel}
					defaultDuckVolume={defaultDuckVolume}
					duckOverrides={duckOverrides}
					setDuckOverride={setDuckOverride}
				/>
			))}
		</div>
	);
}

function DuckingZoneItem({
	win,
	element,
	zoomLevel,
	defaultDuckVolume,
	duckOverrides,
	setDuckOverride,
}: {
	win: DuckWindow;
	element: TimelineElementType;
	zoomLevel: number;
	defaultDuckVolume: number;
	duckOverrides: Record<string, { startOffset?: number; endOffset?: number; duckVolume?: number }>;
	setDuckOverride: (
		key: string,
		override: Partial<{ startOffset: number; endOffset: number; duckVolume: number }>,
	) => void;
}) {
	const editor = useEditor();
	const winId = win.id || `duck-win-${win.start.toFixed(2)}`;
	const activeDuckVolume =
		win.duckVolume !== undefined ? win.duckVolume : defaultDuckVolume;
	const duckPercent = Math.round(activeDuckVolume * 100);

	const leftPct = ((win.start - element.startTime) / element.duration) * 100;
	const widthPct = ((win.end - win.start) / element.duration) * 100;

	// Cuộn chuột để chỉnh âm lượng từng vùng
	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const step = e.shiftKey ? 0.01 : 0.05;
		const delta = e.deltaY < 0 ? step : -step;
		const nextVol = Math.min(
			1,
			Math.max(0, Math.round((activeDuckVolume + delta) * 100) / 100),
		);
		setDuckOverride(winId, { duckVolume: nextVol });
		try {
			editor.audio.refreshScheduledClips();
		} catch {}
	};

	// Kéo mép trái (Left Handle)
	const handleLeftResize = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const currentOffset = duckOverrides[winId]?.startOffset ?? 0;
		const pps = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

		const onMouseMove = (moveEv: MouseEvent) => {
			const deltaSec = (moveEv.clientX - startX) / pps;
			setDuckOverride(winId, { startOffset: currentOffset + deltaSec });
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			try {
				editor.audio.refreshScheduledClips();
			} catch {}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	// Kéo mép phải (Right Handle)
	const handleRightResize = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const currentOffset = duckOverrides[winId]?.endOffset ?? 0;
		const pps = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

		const onMouseMove = (moveEv: MouseEvent) => {
			const deltaSec = (moveEv.clientX - startX) / pps;
			setDuckOverride(winId, { endOffset: currentOffset + deltaSec });
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			try {
				editor.audio.refreshScheduledClips();
			} catch {}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	// Kéo lên/xuống thanh âm lượng (Vertical Volume Drag)
	const handleVolumeDrag = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const startY = e.clientY;
		const startVol = activeDuckVolume;

		const onMouseMove = (moveEv: MouseEvent) => {
			const deltaY = startY - moveEv.clientY; // drag up = increase
			const deltaVol = deltaY / 80; // 80px for full volume range
			const nextVol = Math.min(
				1,
				Math.max(0, Math.round((startVol + deltaVol) * 100) / 100),
			);
			setDuckOverride(winId, { duckVolume: nextVol });
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			try {
				editor.audio.refreshScheduledClips();
			} catch {}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	return (
		<div
			className="pointer-events-auto absolute top-0 bottom-0 group bg-blue-500/25 hover:bg-blue-500/35 border-x border-blue-400/80 transition-colors flex flex-col justify-between cursor-default select-none z-30"
			style={{
				left: `${leftPct}%`,
				width: `${widthPct}%`,
			}}
			onWheel={handleWheel}
			title="Vùng hạ âm lượng: Cuộn chuột hoặc kéo ↕️ để tăng/giảm âm lượng, kéo mép ↔️ để chỉnh thời gian"
		>
			{/* Left handle for time drag */}
			<div
				className="absolute left-0 top-0 bottom-0 w-2.5 z-40 cursor-ew-resize hover:bg-blue-400/80 active:bg-blue-300 flex items-center justify-center transition-colors"
				onMouseDown={handleLeftResize}
				title="Kéo mép trái để chỉnh mốc bắt đầu hạ âm"
			>
				<div className="w-0.5 h-3 bg-white/80 rounded-full" />
			</div>

			{/* Right handle for time drag */}
			<div
				className="absolute right-0 top-0 bottom-0 w-2.5 z-40 cursor-ew-resize hover:bg-blue-400/80 active:bg-blue-300 flex items-center justify-center transition-colors"
				onMouseDown={handleRightResize}
				title="Kéo mép phải để chỉnh mốc kết thúc hạ âm"
			>
				<div className="w-0.5 h-3 bg-white/80 rounded-full" />
			</div>

			{/* Volume horizontal line (draggable vertically) */}
			<div
				className="absolute left-1 right-1 h-2 z-30 cursor-ns-resize hover:bg-blue-300/40 flex items-center"
				style={{
					bottom: `${Math.min(85, Math.max(10, activeDuckVolume * 100))}%`,
				}}
				onMouseDown={handleVolumeDrag}
				title="Kéo lên/xuống để tăng/giảm âm lượng đoạn này"
			>
				<div className="w-full h-0.5 bg-blue-300/90 group-hover:bg-blue-200 shadow-xs" />
			</div>

			{/* Volume Badge */}
			<div
				className="size-full flex items-end justify-center pb-0.5 cursor-ns-resize"
				onMouseDown={handleVolumeDrag}
			>
				<span className="text-[9px] font-mono font-bold text-blue-100 bg-blue-950/90 hover:bg-blue-900 border border-blue-400/60 px-1 py-0.2 rounded shadow-sm scale-90 transition-all select-none">
					↓{duckPercent}%
				</span>
			</div>
		</div>
	);
}


