"use client";

import { useCallback, useMemo, useRef } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/hooks/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { getLastFrameTime } from "@/lib/time";
import { invokeAction } from "@/lib/actions";
import { usePlaybackFlags } from "@/hooks/use-playback";
import { getPreviewRenderSize } from "@/lib/preview/preview-size";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";

function usePreviewSize() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	return {
		width: activeProject?.settings.canvasSize.width,
		height: activeProject?.settings.canvasSize.height,
	};
}

function MobileRenderTreeController() {
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

function MobilePreviewCanvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const containerSize = useContainerSize({ containerRef });
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	const displaySize = useMemo(() => {
		if (
			!nativeWidth ||
			!nativeHeight ||
			containerSize.width === 0 ||
			containerSize.height === 0
		) {
			return { width: nativeWidth ?? 0, height: nativeHeight ?? 0 };
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
	}, [nativeWidth, nativeHeight, containerSize.width, containerSize.height]);

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
		const tree = renderTreeRef.current;
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
			className="relative flex h-full w-full items-center justify-center"
		>
			<canvas
				ref={canvasRef}
				width={previewSize.width}
				height={previewSize.height}
				className="block"
				style={{
					width: displaySize.width,
					height: displaySize.height,
					background: "#000000",
				}}
			/>
		</div>
	);
}

export function MobilePreview() {
	const { isPlaying } = usePlaybackFlags();

	const handleTogglePlay = useCallback(() => {
		invokeAction("toggle-play");
	}, []);

	return (
		<div className="relative flex min-h-[30vh] flex-1 items-center justify-center bg-black">
			<MobilePreviewCanvas />
			<MobileRenderTreeController />

			{/* Tap overlay to toggle play/pause */}
			<button
				type="button"
				className="absolute inset-0 z-10 flex items-center justify-center"
				onClick={handleTogglePlay}
				onKeyDown={({ key }) => {
					if (key === "Enter" || key === " ") {
						handleTogglePlay();
					}
				}}
				aria-label={isPlaying ? "Pause" : "Play"}
			>
				<div
					className={cn(
						"flex size-14 items-center justify-center rounded-full bg-black/50 text-white transition-opacity duration-200",
						isPlaying && "pointer-events-none opacity-0",
					)}
				>
					<HugeiconsIcon
						icon={isPlaying ? PauseIcon : PlayIcon}
						className="size-7"
					/>
				</div>
			</button>
		</div>
	);
}
