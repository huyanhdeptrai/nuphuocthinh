"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/hooks/use-editor";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import {
	mapCanvasOcrRegionsToSource,
	mapSourceBoundsToCanvas,
} from "@/dubbing/services/ocr-regions";
import { getVisibleElementsWithBounds } from "@/dubbing/adapters/media";
import { generateUUID } from "@/utils/id";
import { materializeSubtitleSyncedEffectsForAllGroups } from "@/lib/timeline/subtitle-effect-sync";
import { getOriginalSubtitleVerticalPositionUpdates } from "@/lib/timeline/original-subtitle-sync";
import type { VideoElement } from "@/types/timeline";

/** Shared scan panel for overlay and text/subtitle property tabs. */
export function OriginalSubtitleScanTab() {
	const editor = useEditor();
	const {
		ocrRegions,
		isSelectingOcrRegion,
		setIsSelectingOcrRegion,
	} = useDubbingStore();
	const [isScanning, setIsScanning] = useState(false);
	const [status, setStatus] = useState("");
	const project = editor.project.getActive();
	const originalSubtitleCues = project.settings.originalSubtitleCues ?? [];

	const findTargetVideo = () => {
		const scene = editor.scenes.getActiveScene();
		if (!scene) return null;
		const currentTime = editor.playback.getCurrentTime();
		const mediaAssets = editor.media.getAssets();
		const selected = new Set(
			editor.selection
				.getSelectedElements()
				.map((item) => `${item.trackId}:${item.elementId}`),
		);
		const visibleVideos = getVisibleElementsWithBounds({
			tracks: scene.tracks,
			currentTime,
			canvasSize: project.settings.canvasSize,
			mediaAssets,
		}).filter(
			(item): item is typeof item & { element: VideoElement } =>
				item.element.type === "video",
		);
		return (
			visibleVideos.find((item) =>
				selected.has(`${item.trackId}:${item.elementId}`),
			) ?? visibleVideos[0] ?? null
		);
	};

	const handleScan = async () => {
		const enabledRegions = ocrRegions.filter((region) => region.enabled);
		if (enabledRegions.length === 0) {
			setIsSelectingOcrRegion(true);
			toast.error("Khoanh vùng phụ đề gốc trên Preview trước khi quét.");
			return;
		}
		const target = findTargetVideo();
		if (!target) {
			toast.error("Đặt đầu phát vào clip video gốc cần quét.");
			return;
		}
		const asset = editor.media
			.getAssets()
			.find((candidate) => candidate.id === target.element.mediaId);
		if (!asset?.file) {
			toast.error("Video nguồn chưa có file cục bộ để quét.");
			return;
		}
		const sourceRegions = mapCanvasOcrRegionsToSource({
			regions: enabledRegions,
			canvasSize: project.settings.canvasSize,
			sourceBounds: target.bounds,
		});
		if (sourceRegions.length === 0) {
			toast.error("Vùng OCR không giao với video nguồn đang hiển thị.");
			return;
		}

		setIsScanning(true);
		setStatus("Đang quét nhanh cue phụ đề gốc…");
		try {
			const formData = new FormData();
			formData.append("engine", "rapidocr-tiny");
			formData.append("mode", "detect-only");
			formData.append("language", "auto");
			formData.append("rois", JSON.stringify(sourceRegions));
			// This is the raw MediaAsset file, never a rendered timeline frame.
			formData.append("file", asset.file, asset.file.name || "video.mp4");
			const response = await fetch("/api/ocr", { method: "POST", body: formData });
			const data = (await response.json()) as {
				error?: string;
				originalSubtitleCues?: Array<{
					startTime: number; endTime: number; confidence?: number; roiId?: string;
					bounds?: { x: number; y: number; width: number; height: number };
				}>;
			};
			if (!response.ok) throw new Error(data.error || "Không thể quét phụ đề gốc.");

			const rate = target.element.playbackRate || 1;
			const sourceStart = target.element.trimStart;
			const sourceEnd = sourceStart + target.element.duration / rate;
			const scanned = (data.originalSubtitleCues ?? []).flatMap((cue) => {
				if (!cue.bounds) return [];
				const clippedStart = Math.max(sourceStart, cue.startTime);
				const clippedEnd = Math.min(sourceEnd, cue.endTime);
				const bounds = mapSourceBoundsToCanvas({
					bounds: cue.bounds,
					canvasSize: project.settings.canvasSize,
					sourceBounds: target.bounds,
				});
				if (!bounds || clippedEnd - clippedStart < 0.08) return [];
				return [{
					id: generateUUID(), mediaId: target.element.mediaId, videoElementId: target.element.id,
					startTime: target.element.startTime + (clippedStart - sourceStart) * rate,
					endTime: target.element.startTime + (clippedEnd - sourceStart) * rate,
					bounds, confidence: cue.confidence ?? 0, roiId: cue.roiId,
				}];
			});
			// A new scan refreshes just this source clip; cues from other clips stay.
			const nextCues = [
				...originalSubtitleCues.filter((cue) => cue.videoElementId !== target.element.id),
				...scanned,
			];
			await editor.project.updateSettings({ settings: { originalSubtitleCues: nextCues } });
			editor.timeline.updateTracks(
				materializeSubtitleSyncedEffectsForAllGroups(editor.timeline.getTracks(), nextCues),
			);
			setStatus(scanned.length ? `Đã làm mới ${scanned.length} cue phụ đề gốc.` : "Không phát hiện phụ đề trong vùng đã khoanh.");
			if (scanned.length) toast.success(`Đã quét ${scanned.length} cue phụ đề gốc.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Không thể quét phụ đề gốc.";
			setStatus(message);
			toast.error(message);
		} finally {
			setIsScanning(false);
		}
	};

	const handleSyncSubtitleVertical = () => {
		const updates = getOriginalSubtitleVerticalPositionUpdates({
			tracks: editor.timeline.getTracks(),
			originalSubtitleCues,
			canvasWidth: project.settings.canvasSize.width,
			canvasHeight: project.settings.canvasSize.height,
		});
		if (!updates.length) {
			toast.message(originalSubtitleCues.length ? "Phụ đề đã đúng vị trí dọc hoặc chưa có cue trùng thời gian." : "Hãy quét phụ đề gốc trước.");
			return;
		}
		editor.timeline.updateElements({ updates, pushHistory: true });
		toast.success(`Đã đồng bộ vị trí dọc cho ${updates.length} phụ đề.`);
	};

	return (
		<div className="space-y-3 p-3">
			<div>
				<p className="text-xs font-semibold">Phụ đề gốc trong video</p>
				<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
					Quét file video gốc theo vùng OCR trên Preview. Chữ, ảnh và lớp phủ trên timeline không được đưa vào quét.
				</p>
			</div>
			<div className="rounded-lg border bg-card p-3 space-y-2">
				<div className="flex items-center justify-between gap-2 text-xs">
					<span className="font-semibold">{originalSubtitleCues.length} cue đã lưu</span>
					<button
						type="button"
						onClick={() => setIsSelectingOcrRegion(!isSelectingOcrRegion)}
						className={isSelectingOcrRegion
							? "text-[10px] font-semibold text-destructive hover:underline"
							: "text-[10px] font-medium text-primary hover:underline"}
					>
						{isSelectingOcrRegion
							? "Tắt khoanh vùng Preview"
							: "Khoanh vùng trên Preview"}
					</button>
				</div>
				<button type="button" disabled={isScanning} onClick={() => void handleScan()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60">
					<ScanLine className="size-4" />{isScanning ? "ĐANG QUÉT…" : "QUÉT / LÀM MỚI CUE PHỤ ĐỀ GỐC"}
				</button>
				{status && <p className="text-[10px] leading-relaxed text-muted-foreground">{status}</p>}
			</div>
			<div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
				<p className="text-xs font-semibold">Đồng bộ phụ đề đã dịch</p>
				<p className="text-[10px] leading-relaxed text-muted-foreground">Chỉ lấy tâm theo chiều dọc từ cue gốc. Chiều ngang, độ rộng và kiểu chữ của phụ đề dịch được giữ nguyên.</p>
				<button type="button" disabled={!originalSubtitleCues.length} onClick={handleSyncSubtitleVertical} className="h-8 w-full rounded-md border border-amber-500/40 bg-background px-2 text-xs font-semibold text-foreground disabled:opacity-50">ĐỒNG BỘ VỊ TRÍ DỌC PHỤ ĐỀ</button>
			</div>
		</div>
	);
}
