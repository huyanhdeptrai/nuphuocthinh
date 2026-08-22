"use client";

import { useCallback, useMemo, useRef } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { Gauge, X } from "lucide-react";
import { useEditor } from "@/hooks/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { formatTimeCode, getLastFrameTime } from "@/lib/time";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { VoiceoverOverlay } from "./voiceover-overlay";
import { EditableTimecode } from "@/components/editable-timecode";
import { CanvasSizeSelector } from "./canvas-size-selector";
import { invokeAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	FullScreenIcon,
	MoreVerticalIcon,
	MusicNote03Icon,
	PauseIcon,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMediaPreviewStore } from "@/stores/media-preview-store";
import {
	PREVIEW_ZOOM_LEVELS,
	usePreviewZoomStore,
} from "@/stores/preview-zoom-store";
import { usePlaybackFlags, usePlaybackTime } from "@/hooks/use-playback";
import { getPreviewRenderSize } from "@/lib/preview/preview-size";
import type { MediaAsset } from "@/types/assets";
import { cn } from "@/utils/ui";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";

function usePreviewSize() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	return {
		width: activeProject?.settings.canvasSize.width,
		height: activeProject?.settings.canvasSize.height,
	};
}

function RenderTreeController() {
	const editor = useEditor();
	const tracks = editor.timeline.getTracks();
	const mediaAssets = editor.media.getAssets();
	const activeProject = editor.project.getActive();

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
		});

		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

export function PreviewPanel() {
	const containerRef = useRef<HTMLDivElement>(null);
	const { isFullscreen, toggleFullscreen } = useFullscreen({ containerRef });
	const editor = useEditor();
	const selectedMediaId = useMediaPreviewStore(
		(state) => state.selectedMediaId,
	);
	const clearSelection = useMediaPreviewStore((state) => state.clearSelection);

	const selectedAsset = useMemo(() => {
		if (!selectedMediaId) return null;
		return (
			editor.media.getAssets().find((asset) => asset.id === selectedMediaId) ??
			null
		);
	}, [selectedMediaId, editor.media]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"panel bg-background relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-sm border",
				isFullscreen && "bg-background",
			)}
		>
			{selectedAsset ? (
				<>
					<PreviewHeader
						assetName={selectedAsset.name}
						onClose={clearSelection}
					/>
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-2">
						<AssetPreviewPlayer asset={selectedAsset} />
					</div>
				</>
			) : (
				<>
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-2 pb-0">
						<PreviewCanvas />
						<RenderTreeController />
					</div>
					<PreviewToolbar
						isFullscreen={isFullscreen}
						onToggleFullscreen={toggleFullscreen}
					/>
				</>
			)}
		</div>
	);
}

function PreviewHeader({
	assetName,
	onClose,
}: {
	assetName: string;
	onClose: () => void;
}) {
	return (
		<div className="flex h-9 items-center justify-between border-b px-3">
			<span className="text-muted-foreground truncate text-xs">
				正在预览: {assetName}
			</span>
			<Button
				variant="ghost"
				size="icon"
				type="button"
				className="size-6"
				onClick={onClose}
				title="Close preview"
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}

function AssetPreviewPlayer({ asset }: { asset: MediaAsset }) {
	const url = asset.url ?? "";

	if (asset.type === "video") {
		return (
			<div className="flex h-full w-full items-center justify-center">
				{/* biome-ignore lint/a11y/useMediaCaption: preview playback */}
				<video
					key={asset.id}
					src={url}
					controls
					autoPlay
					className="max-h-full max-w-full rounded"
				/>
			</div>
		);
	}

	if (asset.type === "image") {
		return (
			<div className="flex h-full w-full items-center justify-center">
				{/* biome-ignore lint: blob URLs don't work with Next.js Image */}
				<img
					src={url}
					alt={asset.name}
					className="max-h-full max-w-full rounded object-contain"
				/>
			</div>
		);
	}

	if (asset.type === "audio") {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4">
				<HugeiconsIcon
					icon={MusicNote03Icon}
					className="text-muted-foreground size-16"
				/>
				<span className="text-muted-foreground text-sm">{asset.name}</span>
				{/* biome-ignore lint/a11y/useMediaCaption: preview playback */}
				<audio key={asset.id} src={url} controls autoPlay className="w-64" />
			</div>
		);
	}

	return null;
}

function exportCurrentFrame({
	editor,
}: {
	editor: ReturnType<typeof useEditor>;
}) {
	const renderTree = editor.renderer.getRenderTree();
	if (!renderTree) return;

	const activeProject = editor.project.getActive();
	if (!activeProject) return;

	const { width, height } = activeProject.settings.canvasSize;
	const fps = activeProject.settings.fps;
	const currentTime = editor.playback.getCurrentTime();

	const renderer = new CanvasRenderer({ width, height, fps });
	const tempCanvas = document.createElement("canvas");
	tempCanvas.width = width;
	tempCanvas.height = height;

	renderer
		.renderToCanvas({
			node: renderTree,
			time: currentTime,
			targetCanvas: tempCanvas,
		})
		.then(() => {
			tempCanvas.toBlob((blob) => {
				if (!blob) return;

				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${activeProject.metadata.name}-frame.png`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, "image/png");
		});
}


const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function PreviewToolbar({
	isFullscreen,
	onToggleFullscreen,
}: {
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
}) {
	const { t } = useTranslation();
	const editor = useEditor();
	const { isPlaying, playbackRate } = usePlaybackFlags();
	const currentRate = playbackRate ?? 1;
	const speedLabel = currentRate === 1 ? "1x" : `${currentRate}x`;
	const currentTime = usePlaybackTime({ throttleMs: 80 });
	const totalDuration = editor.timeline.getTotalDuration();
	const fps = editor.project.getActive().settings.fps;
	const zoom = usePreviewZoomStore((s) => s.zoom);
	const setZoom = usePreviewZoomStore((s) => s.setZoom);
	const zoomLabel = zoom === null ? t("Fit") : `${Math.round(zoom * 100)}%`;

	const handleSpeedChange = (speed: number) => {
		try {
			if (typeof editor.playback.setPlaybackRate === "function") {
				editor.playback.setPlaybackRate({ rate: speed });
			} else {
				(editor.playback as unknown as { playbackRate: number }).playbackRate = speed;
				(editor.playback as unknown as { lastUpdate: number }).lastUpdate = performance.now();
				(editor.playback as unknown as { notify?: () => void }).notify?.();
				if (typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent("playback-rate-change", {
							detail: { rate: speed },
						}),
					);
				}
			}
		} catch (error) {
			console.warn("Failed to set playback rate:", error);
		}
	};

	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center pb-3 pt-5 px-5">
			<div className="flex items-center gap-2 mt-1">
				<EditableTimecode
					time={currentTime}
					duration={totalDuration}
					format="HH:MM:SS:FF"
					fps={fps}
					onTimeChange={({ time }) => editor.playback.seek({ time })}
					className="text-center"
				/>
				<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
				<span className="text-muted-foreground font-mono text-xs">
					{formatTimeCode({
						timeInSeconds: totalDuration,
						format: "HH:MM:SS:FF",
						fps,
					})}
				</span>

				<CanvasSizeSelector
					variant="outline"
					size="sm"
					className="h-7 px-2 font-mono text-xs"
				/>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onMouseDown={(event) => event.preventDefault()}
							className="text-muted-foreground h-7 px-2 font-mono text-xs"
							title={t("Zoom level")}
						>
							{zoomLabel}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top">
						<DropdownMenuLabel>{t("Zoom")}</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => setZoom(null)}
							data-active={zoom === null}
						>
							{t("Fit")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{PREVIEW_ZOOM_LEVELS.map((level) => (
							<DropdownMenuItem
								key={level}
								onClick={() => setZoom(level)}
								data-active={zoom === level}
							>
								{`${Math.round(level * 100)}%`}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onMouseDown={(event) => event.preventDefault()}
							className={cn(
								"h-7 px-2 font-mono text-xs transition-colors",
								currentRate !== 1
									? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
									: "text-muted-foreground",
							)}
							title="Tốc độ phát preview"
						>
							<Gauge className="size-3.5 mr-1 opacity-70" />
							{speedLabel}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top" className="min-w-36">
						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
							Tốc độ phát Preview
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{PLAYBACK_SPEEDS.map((speed) => (
							<DropdownMenuItem
								key={speed}
								onClick={() => handleSpeedChange(speed)}
								className={cn(
									"flex items-center justify-between text-xs font-mono cursor-pointer",
									currentRate === speed &&
										"font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10",
								)}
							>
								<span>{speed}x</span>
								{speed === 1 && (
									<span className="text-[10px] text-muted-foreground font-sans ml-2">
										(Mặc định)
									</span>
								)}
								{speed === 0.5 && (
									<span className="text-[10px] text-muted-foreground font-sans ml-2">
										(Chậm 50%)
									</span>
								)}
								{speed === 2 && (
									<span className="text-[10px] text-muted-foreground font-sans ml-2">
										(Nhanh 2x)
									</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Button
				variant="text"
				size="icon"
				type="button"
				onMouseDown={(event) => event.preventDefault()}
				onClick={() => invokeAction("toggle-play")}
			>
				<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
			</Button>

			<div className="flex items-center gap-1 justify-self-end">
				<Button
					variant="text"
					size="icon"
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={onToggleFullscreen}
					title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
				>
					<HugeiconsIcon icon={FullScreenIcon} />
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="icon"
							type="button"
							onMouseDown={(event) => event.preventDefault()}
							title={t("More options")}
						>
							<HugeiconsIcon icon={MoreVerticalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" side="top">
						<DropdownMenuItem onClick={() => exportCurrentFrame({ editor })}>
							{t("Export current frame")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function PreviewCanvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const containerSize = useContainerSize({ containerRef });
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const zoom = usePreviewZoomStore((s) => s.zoom);

	const displaySize = useMemo(() => {
		if (
			!nativeWidth ||
			!nativeHeight ||
			containerSize.width === 0 ||
			containerSize.height === 0
		) {
			return { width: nativeWidth ?? 0, height: nativeHeight ?? 0 };
		}

		if (zoom !== null) {
			return { width: nativeWidth * zoom, height: nativeHeight * zoom };
		}

		const paddingBuffer = 4;
		const availableWidth = containerSize.width - paddingBuffer;
		const availableHeight = containerSize.height - paddingBuffer;

		const aspectRatio = nativeWidth / nativeHeight;
		const containerAspect = availableWidth / availableHeight;

		const displayWidth =
			containerAspect > aspectRatio
				? availableHeight * aspectRatio
				: availableWidth;
		const displayHeight =
			containerAspect > aspectRatio
				? availableHeight
				: availableWidth / aspectRatio;

		return { width: displayWidth, height: displayHeight };
	}, [
		nativeWidth,
		nativeHeight,
		containerSize.width,
		containerSize.height,
		zoom,
	]);

	const previewSize = useMemo(
		() =>
			getPreviewRenderSize({
				nativeWidth: nativeWidth ?? 1,
				nativeHeight: nativeHeight ?? 1,
				displayWidth: displaySize.width,
				displayHeight: displaySize.height,
			}),
		[nativeWidth, nativeHeight, displaySize.width, displaySize.height],
	);

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width: nativeWidth ?? previewSize.width,
			height: nativeHeight ?? previewSize.height,
			bufferWidth: previewSize.width,
			bufferHeight: previewSize.height,
			fps: activeProject.settings.fps,
			quality: "preview",
			previewMaxEdge: Math.max(previewSize.width, previewSize.height),
		});
	}, [
		nativeWidth,
		nativeHeight,
		previewSize.width,
		previewSize.height,
		activeProject.settings.fps,
	]);

	const isOverflow = zoom !== null && displaySize.width > 0;

	const renderTree = editor.renderer.getRenderTree();
	const renderTreeRef = useRef(renderTree);
	renderTreeRef.current = renderTree;
	const rendererRef = useRef(renderer);
	rendererRef.current = renderer;
	const editorRef = useRef(editor);
	editorRef.current = editor;
	lastFrameRef.current = -1;

	const render = useCallback(() => {
		const canvas = canvasRef.current;
		const tree = editorRef.current.renderer.getRenderTree();
		const activeRenderer = rendererRef.current;
		if (!canvas || !tree || renderingRef.current) return;

		const time = editorRef.current.playback.getCurrentTime();
		const lastFrameTime = getLastFrameTime({
			duration: tree.duration,
			fps: activeRenderer.fps,
		});
		const renderTime = Math.min(time, lastFrameTime);
		const frame = Math.floor(renderTime * activeRenderer.fps);

		if (frame !== lastFrameRef.current || tree !== lastSceneRef.current) {
			renderingRef.current = true;
			lastSceneRef.current = tree;
			lastFrameRef.current = frame;
			activeRenderer
				.renderToCanvas({
					node: tree,
					time: renderTime,
					targetCanvas: canvas,
				})
				.catch(() => undefined)
				.finally(() => {
					renderingRef.current = false;
				});
		}
	}, []);

	useRafLoop(render);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative h-full w-full",
				isOverflow ? "overflow-auto" : "flex items-center justify-center",
			)}
		>
			<div
				className={cn("relative", isOverflow && "mx-auto my-auto w-fit")}
				style={{ width: displaySize.width, height: displaySize.height }}
			>
				<canvas
					ref={canvasRef}
					width={previewSize.width}
					height={previewSize.height}
					className="block border"
					style={{
						width: displaySize.width,
						height: displaySize.height,
						background: "#000000",
					}}
				/>
				<PreviewInteractionOverlay
					canvasRef={canvasRef}
					displaySize={displaySize}
					canvasWidth={nativeWidth ?? 0}
					canvasHeight={nativeHeight ?? 0}
				/>
				<VoiceoverOverlay displaySize={displaySize} />
			</div>
		</div>
	);
}
