import { useRef } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { usePreviewInteraction } from "@/hooks/use-preview-interaction";
import { useChromaPickerStore } from "@/stores/chroma-picker-store";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import { cn } from "@/utils/ui";
import { SelectionOverlay } from "./selection-overlay";
import { GuideLines } from "./guide-lines";
import { OcrRegionOverlay } from "./ocr-region-overlay";

export function PreviewInteractionOverlay({
	canvasRef,
	displaySize,
	canvasWidth,
	canvasHeight,
}: {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	displaySize: { width: number; height: number };
	canvasWidth: number;
	canvasHeight: number;
}) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const { t } = useTranslation();
	const isPickingChroma = useChromaPickerStore((state) => state.isPicking);
	const isSelectingOcrRegion = useDubbingStore(
		(state) => state.isSelectingOcrRegion,
	);
	const {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		clearChromaPreview,
		onScaleStart,
		onResizeStart,
		isTransforming,
		activeGuides,
		chromaPreview,
	} = usePreviewInteraction({ canvasRef, overlayRef });

	return (
		<div
			ref={overlayRef}
			className={cn(
				"pointer-events-auto absolute inset-0",
				isPickingChroma && "cursor-crosshair",
			)}
			onPointerDown={isSelectingOcrRegion ? undefined : onPointerDown}
			onPointerMove={isSelectingOcrRegion ? undefined : onPointerMove}
			onPointerUp={isSelectingOcrRegion ? undefined : onPointerUp}
			onPointerLeave={clearChromaPreview}
		>
			{isPickingChroma && chromaPreview && (
				<div
					role="status"
					className="bg-background/95 text-foreground pointer-events-none absolute z-[2000] flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] shadow-lg backdrop-blur-sm"
					style={{
						left: Math.min(chromaPreview.x, displaySize.width - 132),
						top: Math.min(chromaPreview.y, displaySize.height - 30),
					}}
				>
					<span
						className="size-4 rounded-sm border border-white/60 shadow-inner"
						style={{ backgroundColor: chromaPreview.color }}
					/>
					<span className="font-mono font-medium">{chromaPreview.color}</span>
					<span className="text-muted-foreground">{t("Click to pick")}</span>
				</div>
			)}
			<GuideLines
				guides={activeGuides}
				displaySize={displaySize}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
			/>
			{!isPickingChroma && !isSelectingOcrRegion && (
				<SelectionOverlay
					displaySize={displaySize}
					onScaleStart={onScaleStart}
					onResizeStart={onResizeStart}
					isTransforming={isTransforming}
				/>
			)}
			<OcrRegionOverlay displaySize={displaySize} />
		</div>
	);
}
