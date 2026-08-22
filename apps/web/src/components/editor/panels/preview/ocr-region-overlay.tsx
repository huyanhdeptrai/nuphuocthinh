"use client";

import { useState, useRef, useCallback } from "react";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import type { OCRRegion } from "@/dubbing/types";
import { Delete02Icon, MoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

interface OcrRegionOverlayProps {
	displaySize: { width: number; height: number };
}

type DragMode =
	| { type: "drawing"; startX: number; startY: number; currentX: number; currentY: number }
	| { type: "moving"; regionId: string; startPointerX: number; startPointerY: number; initialX: number; initialY: number }
	| { type: "resizing"; regionId: string; handle: string; startPointerX: number; startPointerY: number; initialRegion: OCRRegion }
	| null;

export function OcrRegionOverlay({ displaySize }: OcrRegionOverlayProps) {
	const {
		isSelectingOcrRegion,
		ocrRegions,
		updateOcrRegion,
		addOcrRegion,
		removeOcrRegion,
		setIsSelectingOcrRegion,
	} = useDubbingStore();

	const [dragState, setDragState] = useState<DragMode>(null);
	const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	const getRelativePointerCoords = useCallback(
		(event: React.PointerEvent) => {
			if (!overlayRef.current) return { x: 0, y: 0 };
			const rect = overlayRef.current.getBoundingClientRect();
			const x = Math.max(0, Math.min(displaySize.width, event.clientX - rect.left));
			const y = Math.max(0, Math.min(displaySize.height, event.clientY - rect.top));
			return { x, y };
		},
		[displaySize],
	);

	const handleOverlayPointerDown = (event: React.PointerEvent) => {
		if (!isSelectingOcrRegion) return;
		event.stopPropagation();
		event.preventDefault();

		const { x, y } = getRelativePointerCoords(event);
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);

		setDragState({
			type: "drawing",
			startX: x,
			startY: y,
			currentX: x,
			currentY: y,
		});
	};

	const handleMoveHeaderPointerDown = (
		event: React.PointerEvent,
		region: OCRRegion,
	) => {
		if (!isSelectingOcrRegion) return;
		event.stopPropagation();
		event.preventDefault();

		const { x, y } = getRelativePointerCoords(event);
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
		setActiveRegionId(region.id);

		setDragState({
			type: "moving",
			regionId: region.id,
			startPointerX: x,
			startPointerY: y,
			initialX: region.x,
			initialY: region.y,
		});
	};

	const handleResizeHandlePointerDown = (
		event: React.PointerEvent,
		region: OCRRegion,
		handle: string,
	) => {
		if (!isSelectingOcrRegion) return;
		event.stopPropagation();
		event.preventDefault();

		const { x, y } = getRelativePointerCoords(event);
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
		setActiveRegionId(region.id);

		setDragState({
			type: "resizing",
			regionId: region.id,
			handle,
			startPointerX: x,
			startPointerY: y,
			initialRegion: { ...region },
		});
	};

	const handlePointerMove = (event: React.PointerEvent) => {
		if (!dragState) return;
		event.stopPropagation();
		event.preventDefault();

		const { x, y } = getRelativePointerCoords(event);

		if (dragState.type === "drawing") {
			setDragState({ ...dragState, currentX: x, currentY: y });
		} else if (dragState.type === "moving") {
			const deltaX = (x - dragState.startPointerX) / displaySize.width;
			const deltaY = (y - dragState.startPointerY) / displaySize.height;
			const region = ocrRegions.find((r) => r.id === dragState.regionId);
			if (region) {
				const nextX = Math.max(0, Math.min(1 - region.width, dragState.initialX + deltaX));
				const nextY = Math.max(0, Math.min(1 - region.height, dragState.initialY + deltaY));
				updateOcrRegion(dragState.regionId, {
					x: Math.round(nextX * 1000) / 1000,
					y: Math.round(nextY * 1000) / 1000,
				});
			}
		} else if (dragState.type === "resizing") {
			const { initialRegion, handle } = dragState;
			const deltaX = (x - dragState.startPointerX) / displaySize.width;
			const deltaY = (y - dragState.startPointerY) / displaySize.height;

			let nextX = initialRegion.x;
			let nextY = initialRegion.y;
			let nextWidth = initialRegion.width;
			let nextHeight = initialRegion.height;

			if (handle.includes("w")) {
				const rightEdge = initialRegion.x + initialRegion.width;
				nextX = Math.max(0, Math.min(rightEdge - 0.05, initialRegion.x + deltaX));
				nextWidth = rightEdge - nextX;
			}
			if (handle.includes("e")) {
				nextWidth = Math.max(0.05, Math.min(1 - initialRegion.x, initialRegion.width + deltaX));
			}
			if (handle.includes("n")) {
				const bottomEdge = initialRegion.y + initialRegion.height;
				nextY = Math.max(0, Math.min(bottomEdge - 0.05, initialRegion.y + deltaY));
				nextHeight = bottomEdge - nextY;
			}
			if (handle.includes("s")) {
				nextHeight = Math.max(0.05, Math.min(1 - initialRegion.y, initialRegion.height + deltaY));
			}

			updateOcrRegion(dragState.regionId, {
				x: Math.round(nextX * 1000) / 1000,
				y: Math.round(nextY * 1000) / 1000,
				width: Math.round(nextWidth * 1000) / 1000,
				height: Math.round(nextHeight * 1000) / 1000,
			});
		}
	};

	const handlePointerUp = (event: React.PointerEvent) => {
		if (!dragState) return;
		event.stopPropagation();
		event.preventDefault();

		if (dragState.type === "drawing") {
			const minX = Math.max(0, Math.min(dragState.startX, dragState.currentX));
			const maxX = Math.min(displaySize.width, Math.max(dragState.startX, dragState.currentX));
			const minY = Math.max(0, Math.min(dragState.startY, dragState.currentY));
			const maxY = Math.min(displaySize.height, Math.max(dragState.startY, dragState.currentY));

			const pixelWidth = maxX - minX;
			const pixelHeight = maxY - minY;

			// Minimum threshold (12px) to consider a valid drawn region
			if (pixelWidth > 12 && pixelHeight > 12) {
				const normX = Math.round((minX / displaySize.width) * 1000) / 1000;
				const normY = Math.round((minY / displaySize.height) * 1000) / 1000;
				const normW = Math.round((pixelWidth / displaySize.width) * 1000) / 1000;
				const normH = Math.round((pixelHeight / displaySize.height) * 1000) / 1000;

				if (activeRegionId && ocrRegions.some((r) => r.id === activeRegionId)) {
					updateOcrRegion(activeRegionId, {
						x: normX,
						y: normY,
						width: normW,
						height: normH,
						enabled: true,
					});
					toast.success("Đã cập nhật vùng quét OCR");
				} else if (ocrRegions.length > 0) {
					updateOcrRegion(ocrRegions[0].id, {
						x: normX,
						y: normY,
						width: normW,
						height: normH,
						enabled: true,
					});
					setActiveRegionId(ocrRegions[0].id);
					toast.success("Đã cập nhật vùng quét OCR");
				} else {
					addOcrRegion({
						name: "Vùng quét OCR",
						x: normX,
						y: normY,
						width: normW,
						height: normH,
						enabled: true,
					});
					toast.success("Đã tạo vùng quét OCR mới");
				}
				// A completed crop is enough for the fast cue scan. Leaving this mode
				// immediately returns pointer control to subtitle editing and dragging.
				setIsSelectingOcrRegion(false);
			}
		} else if (dragState.type === "moving" || dragState.type === "resizing") {
			toast.success("Đã cập nhật vùng quét OCR");
		}

		setDragState(null);
	};

	// The saved region is OCR configuration, not a permanent preview overlay.
	// Only render it while the user is actively drawing/editing an OCR region.
	if (!isSelectingOcrRegion) {
		return null;
	}

	return (
		<div
			ref={overlayRef}
			className={`absolute inset-0 z-[100] ${isSelectingOcrRegion ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
			onPointerDown={handleOverlayPointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{/* Existing OCR Regions */}
			{ocrRegions.map((region) => {
					const left = region.x * displaySize.width;
					const top = region.y * displaySize.height;
					const width = region.width * displaySize.width;
					const height = region.height * displaySize.height;
					const isFocused = activeRegionId === region.id || isSelectingOcrRegion;

					return (
						<div
							key={region.id}
							style={{ left, top, width, height }}
							className={`absolute rounded-xs border-2 transition-colors pointer-events-none ${
								region.enabled
									? isFocused
										? "border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/10"
										: "border-emerald-500/70 bg-emerald-500/10"
									: "border-muted-foreground/50 border-dashed bg-black/30 opacity-60"
							}`}
						>
							{/* Region Header Tag with Move Icon */}
							<div
								className={`absolute -top-6 left-0 flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-md select-none ${isSelectingOcrRegion ? "pointer-events-auto cursor-move" : "pointer-events-none"}`}
								onPointerDown={(event) => handleMoveHeaderPointerDown(event, region)}
							>
								{isSelectingOcrRegion && (
									<HugeiconsIcon icon={MoveIcon} className="size-2.5 opacity-80" />
								)}
								<span>{region.name}</span>
								{isSelectingOcrRegion && (
									<button
										type="button"
										className="ml-1 opacity-80 hover:opacity-100 cursor-pointer"
										onClick={(e) => {
											e.stopPropagation();
											removeOcrRegion(region.id);
											toast.success("Đã xóa vùng OCR");
										}}
									>
										<HugeiconsIcon icon={Delete02Icon} className="size-2.5" />
									</button>
								)}
							</div>

							{/* Resize handles */}
							{isSelectingOcrRegion && (
								<>
									<div
										className="pointer-events-auto absolute -top-1.5 -left-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-emerald-600 bg-white shadow-sm"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "nw")}
									/>
									<div
										className="pointer-events-auto absolute -top-1.5 -right-1.5 size-3 cursor-nesw-resize rounded-full border-2 border-emerald-600 bg-white shadow-sm"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "ne")}
									/>
									<div
										className="pointer-events-auto absolute -bottom-1.5 -left-1.5 size-3 cursor-nesw-resize rounded-full border-2 border-emerald-600 bg-white shadow-sm"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "sw")}
									/>
									<div
										className="pointer-events-auto absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-emerald-600 bg-white shadow-sm"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "se")}
									/>
									<div
										className="pointer-events-auto absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-5 cursor-ns-resize rounded-xs border border-emerald-600 bg-white"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "n")}
									/>
									<div
										className="pointer-events-auto absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-5 cursor-ns-resize rounded-xs border border-emerald-600 bg-white"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "s")}
									/>
									<div
										className="pointer-events-auto absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-2 cursor-ew-resize rounded-xs border border-emerald-600 bg-white"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "w")}
									/>
									<div
										className="pointer-events-auto absolute -right-1 top-1/2 -translate-y-1/2 h-5 w-2 cursor-ew-resize rounded-xs border border-emerald-600 bg-white"
										onPointerDown={(e) => handleResizeHandlePointerDown(e, region, "e")}
									/>
								</>
							)}
						</div>
					);
				})}

			{/* Realtime Rectangle when drawing */}
			{dragState?.type === "drawing" && (
				<div
					style={{
						left: Math.min(dragState.startX, dragState.currentX),
						top: Math.min(dragState.startY, dragState.currentY),
						width: Math.abs(dragState.currentX - dragState.startX),
						height: Math.abs(dragState.currentY - dragState.startY),
					}}
					className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-500/25 shadow-lg flex items-end justify-end p-1"
				>
					<span className="rounded bg-black/75 px-1 py-0.5 text-[9px] font-mono text-white">
						{Math.round((Math.abs(dragState.currentX - dragState.startX) / displaySize.width) * 100)}% × {Math.round((Math.abs(dragState.currentY - dragState.startY) / displaySize.height) * 100)}%
					</span>
				</div>
			)}
		</div>
	);
}
