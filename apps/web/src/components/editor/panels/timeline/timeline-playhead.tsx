"use client";

import { useRef, useEffect } from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useTimelinePlayhead } from "@/hooks/timeline/use-timeline-playhead";
import { useEditor } from "@/hooks/use-editor";

interface TimelinePlayheadProps {
	zoomLevel: number;
	rulerRef: React.RefObject<HTMLDivElement | null>;
	rulerScrollRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
	playheadRef?: React.RefObject<HTMLDivElement | null>;
	isSnappingToPlayhead?: boolean;
}

export function TimelinePlayhead({
	zoomLevel,
	rulerRef,
	rulerScrollRef,
	tracksScrollRef,
	containerRef,
	playheadRef: externalPlayheadRef,
	isSnappingToPlayhead = false,
}: TimelinePlayheadProps) {
	const editor = useEditor();
	const duration = editor.timeline.getTotalDuration();
	const internalPlayheadRef = useRef<HTMLDivElement>(null);
	const playheadRef = externalPlayheadRef || internalPlayheadRef;

	const { handlePlayheadMouseDown } = useTimelinePlayhead({
		zoomLevel,
		rulerRef,
		rulerScrollRef,
		tracksScrollRef,
		playheadRef,
	});

	useEffect(() => {
		const scrollContainer = tracksScrollRef.current;
		const playheadElement = playheadRef.current;
		if (!scrollContainer || !playheadElement) return;

		const syncScrollOffset = () => {
			playheadElement.style.transform = `translateX(${-scrollContainer.scrollLeft}px)`;
		};

		syncScrollOffset();
		scrollContainer.addEventListener("scroll", syncScrollOffset, {
			passive: true,
		});
		return () =>
			scrollContainer.removeEventListener("scroll", syncScrollOffset);
	}, [tracksScrollRef, playheadRef]);

	useEffect(() => {
		const playheadElement = playheadRef.current;
		if (!playheadElement) return;

		let frame = 0;
		const tick = () => {
			const time = editor.playback.getCurrentTime();
			const x = time * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
			playheadElement.style.left = `${x}px`;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [editor, playheadRef, zoomLevel]);

	const totalHeight = containerRef.current?.clientHeight ?? 400;

	const handlePlayheadKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
	) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

		event.preventDefault();
		const step = 1 / Math.max(1, editor.project.getActive().settings.fps);
		const direction = event.key === "ArrowRight" ? 1 : -1;
		const currentTime = editor.playback.getCurrentTime();
		const nextTime = Math.max(
			0,
			Math.min(duration, currentTime + direction * step),
		);

		editor.playback.seek({ time: nextTime });
	};

	return (
		<div
			ref={playheadRef}
			role="slider"
			aria-label="Timeline playhead"
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={editor.playback.getCurrentTime()}
			tabIndex={0}
			className="pointer-events-auto absolute z-60 will-change-transform"
			style={{
				left: 0,
				top: 0,
				height: `${totalHeight}px`,
				width: "2px",
			}}
			onMouseDown={handlePlayheadMouseDown}
			onKeyDown={handlePlayheadKeyDown}
		>
			<div className="bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] absolute left-0 h-full w-[2px] cursor-col-resize" />

			<div
				className={`absolute top-0 left-1/2 size-3.5 -translate-x-1/2 transform rounded-full border-2 border-white bg-red-500 shadow-md ${
					isSnappingToPlayhead
						? "ring-2 ring-red-400 scale-110"
						: "hover:scale-110"
				}`}
			/>
		</div>
	);
}
