"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/utils/ui";
import {
	Ban,
	Blend,
	Grid3X3,
	Layers,
	Rows3,
	ScanLine,
	Sparkles,
	Square,
	SquareSlash,
} from "lucide-react";
import { useEditor } from "@/hooks/use-editor";
import { toast } from "sonner";
import type { TBackground } from "@/types/project";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import {
	mapCanvasOcrRegionsToSource,
	mapSourceBoundsToCanvas,
} from "@/dubbing/services/ocr-regions";
import { getVisibleElementsWithBounds } from "@/dubbing/adapters/media";
import { generateUUID } from "@/utils/id";
import { materializeSubtitleSyncedEffectsForAllGroups } from "@/lib/timeline/subtitle-effect-sync";

export interface OverlayPresetItem {
	id: string;
	name: string;
	subtitle: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	colorClass: string;
}

const OVERLAY_PRESETS: OverlayPresetItem[] = [
	{
		id: "pixelate",
		name: "Pixelate",
		subtitle: "Ô khảm pixel (mosaic)",
		description: "Làm mờ che vùng bằng hiệu ứng lưới pixel mosaic",
		icon: Grid3X3,
		colorClass:
			"from-amber-500/20 to-orange-500/20 text-amber-500 border-amber-500/30",
	},
	{
		id: "blur-strip",
		name: "Blur Strip",
		subtitle: "Gaussian + phủ tối",
		description: "Dải làm mờ Gaussian kết hợp lớp phủ làm tối viền",
		icon: Rows3,
		colorClass:
			"from-blue-500/20 to-indigo-500/20 text-blue-500 border-blue-500/30",
	},
	{
		id: "frosted-glass",
		name: "Frosted Glass",
		subtitle: "Kính mờ (frosted)",
		description: "Hiệu ứng kính mờ khuếch tán ánh sáng cao cấp",
		icon: Sparkles,
		colorClass:
			"from-purple-500/20 to-pink-500/20 text-purple-500 border-purple-500/30",
	},
	{
		id: "remove-logo",
		name: "Kính mờ",
		subtitle: "Làm mờ mịn vùng chọn",
		description: "Lớp làm mờ Gaussian đậm, mịn để che một vùng trong video",
		icon: SquareSlash,
		colorClass:
			"from-rose-500/20 to-red-500/20 text-rose-500 border-rose-500/30",
	},
];

import {
	buildBlurEffectElement,
	buildBlurStripElement,
	buildPixelateElement,
	buildFrostedGlassElement,
	buildRemoveLogoElement,
	findLatestOverlayElementRef,
} from "@/lib/timeline/element-utils";
import type { OverlayEffectMode, VideoElement } from "@/types/timeline";

type VideoBackgroundMode = "none" | "color" | "gradient" | "blur";

const VIDEO_BACKGROUND_OPTIONS: {
	id: VideoBackgroundMode;
	name: string;
	subtitle: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "none", name: "Không nền", subtitle: "Nền trong suốt", icon: Ban },
	{ id: "color", name: "Màu đơn", subtitle: "Một màu tuỳ chọn", icon: Square },
	{
		id: "gradient",
		name: "Gradient",
		subtitle: "Chuyển sắc 2 màu",
		icon: Blend,
	},
	{
		id: "blur",
		name: "Làm mờ video",
		subtitle: "Video chính phóng to + blur",
		icon: ScanLine,
	},
];

const GRADIENT_DIRECTIONS = [
	{ value: 180, label: "Dọc (trên → dưới)" },
	{ value: 90, label: "Ngang (trái → phải)" },
	{ value: 135, label: "Chéo (↘)" },
	{ value: 45, label: "Chéo (↗)" },
] as const;

const GRADIENT_COLOR_INPUTS = [
	{ stopIndex: 0, label: "Màu 1" },
	{ stopIndex: 1, label: "Màu 2" },
] as const;

function getVideoBackgroundMode(background: TBackground): VideoBackgroundMode {
	if (background.type === "color" && background.color === "transparent") {
		return "none";
	}
	return background.type;
}

export function OverlaysView() {
	const editor = useEditor();
	const { ocrRegions, setIsSelectingOcrRegion } = useDubbingStore();
	const [isScanningOriginalSubtitles, setIsScanningOriginalSubtitles] = useState(false);
	const [originalSubtitleScanStatus, setOriginalSubtitleScanStatus] = useState("");
	const activeProject = editor.project.getActive();
	const background = activeProject.settings.background;
	const backgroundMode = getVideoBackgroundMode(background);
	const solidColor = background.type === "color" ? background.color : "#000000";
	const gradientStops =
		background.type === "gradient"
			? background.stops
			: (["40356F", "111827"] as [string, string]);
	const gradientAngle = background.type === "gradient" ? background.angle : 180;
	const blurIntensity =
		background.type === "blur" ? background.blurIntensity : 36;
	const originalSubtitleCueCount =
		activeProject.settings.originalSubtitleCues?.length ?? 0;

	const updateBackground = (nextBackground: TBackground) => {
		void editor.project.updateSettings({
			settings: { background: nextBackground },
		});
	};

	const selectBackgroundMode = (mode: VideoBackgroundMode) => {
		if (mode === "none") {
			updateBackground({ type: "color", color: "transparent" });
			return;
		}
		if (mode === "color") {
			updateBackground({
				type: "color",
				color: solidColor === "transparent" ? "#000000" : solidColor,
			});
			return;
		}
		if (mode === "gradient") {
			updateBackground({
				type: "gradient",
				angle: gradientAngle,
				stops: gradientStops,
				css: `linear-gradient(${gradientAngle}deg, #${gradientStops[0]}, #${gradientStops[1]})`,
			});
			return;
		}
		updateBackground({ type: "blur", blurIntensity });
	};

	const updateGradient = ({
		stops = gradientStops,
		angle = gradientAngle,
	}: {
		stops?: [string, string];
		angle?: number;
	}) => {
		updateBackground({
			type: "gradient",
			angle,
			stops,
			css: `linear-gradient(${angle}deg, #${stops[0]}, #${stops[1]})`,
		});
	};

	const handleAddToTimeline = (preset: OverlayPresetItem) => {
		const totalDuration = editor.timeline.getTotalDuration();
		const startTime = Math.max(0, editor.playback.getCurrentTime());
		const duration =
			totalDuration > startTime ? Math.min(4, totalDuration - startTime) : 4;

		let element: ReturnType<typeof buildBlurEffectElement>;
		if (preset.id === "pixelate") {
			element = buildPixelateElement({ startTime, duration });
		} else if (preset.id === "blur-strip") {
			element = buildBlurStripElement({ startTime, duration });
		} else if (preset.id === "frosted-glass") {
			element = buildFrostedGlassElement({ startTime, duration });
		} else if (preset.id === "remove-logo") {
			element = buildRemoveLogoElement({ startTime, duration });
		} else {
			element = buildBlurEffectElement({
				startTime,
				duration,
				effectMode: preset.id as OverlayEffectMode,
			});
		}

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
		const inserted = findLatestOverlayElementRef({
			tracks: editor.timeline.getTracks(),
			effectMode: element.effectMode ?? "blur",
			startTime,
		});
		if (inserted) {
			editor.selection.setSelectedElements({ elements: [inserted] });
		}
		toast.success(`Đã thêm ${preset.name} vào timeline`);
	};

	const handleScanOriginalSubtitles = async () => {
		const enabledRegions = ocrRegions.filter((region) => region.enabled);
		if (enabledRegions.length === 0) {
			setIsSelectingOcrRegion(true);
			toast.error("Hãy khoanh vùng phụ đề gốc trên khung xem trước trước khi quét.");
			return;
		}

		const currentTime = editor.playback.getCurrentTime();
		const mediaAssets = editor.media.getAssets();
		const scene = editor.scenes.getActiveScene();
		if (!scene) {
			toast.error("Không tìm thấy cảnh đang chỉnh sửa.");
			return;
		}
		const visibleVideos = getVisibleElementsWithBounds({
			tracks: scene.tracks,
			currentTime,
			canvasSize: activeProject.settings.canvasSize,
			mediaAssets,
		}).filter(
			(item): item is typeof item & { element: VideoElement } =>
				item.element.type === "video",
		);
		const selected = new Set(
			editor.selection
				.getSelectedElements()
				.map((item) => `${item.trackId}:${item.elementId}`),
		);
		const target =
			visibleVideos.find((item) => selected.has(`${item.trackId}:${item.elementId}`)) ??
			visibleVideos[0];
		if (!target || target.element.type !== "video") {
			toast.error("Đặt đầu phát vào clip video cần quét phụ đề gốc.");
			return;
		}
		const asset = mediaAssets.find((candidate) => candidate.id === target.element.mediaId);
		if (!asset?.file) {
			toast.error("Video nguồn chưa có file cục bộ để quét phụ đề gốc.");
			return;
		}
		const sourceRegions = mapCanvasOcrRegionsToSource({
			regions: enabledRegions,
			canvasSize: activeProject.settings.canvasSize,
			sourceBounds: target.bounds,
		});
		if (sourceRegions.length === 0) {
			toast.error("Vùng OCR không giao với video đang hiển thị.");
			return;
		}

		setIsScanningOriginalSubtitles(true);
		setOriginalSubtitleScanStatus("Đang quét nhanh vị trí và thời gian phụ đề gốc…");
		try {
			const formData = new FormData();
			formData.append("engine", "rapidocr-tiny");
			formData.append("mode", "detect-only");
			formData.append("language", "auto");
			formData.append("rois", JSON.stringify(sourceRegions));
			formData.append("file", asset.file, asset.file.name || "video.mp4");
			const response = await fetch("/api/ocr", { method: "POST", body: formData });
			const data = (await response.json()) as {
				error?: string;
				originalSubtitleCues?: Array<{
					startTime: number;
					endTime: number;
					confidence?: number;
					roiId?: string;
					bounds?: { x: number; y: number; width: number; height: number };
				}>;
			};
			if (!response.ok) throw new Error(data.error || "Không thể quét phụ đề gốc.");

			const rate = target.element.playbackRate || 1;
			const sourceStart = target.element.trimStart;
			const sourceEnd = sourceStart + target.element.duration / rate;
			const scannedCues = (data.originalSubtitleCues ?? []).flatMap((cue) => {
				if (!cue.bounds) return [];
				const clippedStart = Math.max(sourceStart, cue.startTime);
				const clippedEnd = Math.min(sourceEnd, cue.endTime);
				const bounds = mapSourceBoundsToCanvas({
					bounds: cue.bounds,
					canvasSize: activeProject.settings.canvasSize,
					sourceBounds: target.bounds,
				});
				if (!bounds || clippedEnd - clippedStart < 0.08) return [];
				return [{
					id: generateUUID(),
					mediaId: target.element.mediaId,
					videoElementId: target.element.id,
					startTime: target.element.startTime + (clippedStart - sourceStart) * rate,
					endTime: target.element.startTime + (clippedEnd - sourceStart) * rate,
					bounds,
					confidence: cue.confidence ?? 0,
					roiId: cue.roiId,
				}];
			});
			const kept = (activeProject.settings.originalSubtitleCues ?? []).filter(
				(cue) => cue.videoElementId !== target.element.id,
			);
			const nextOriginalSubtitleCues = [...kept, ...scannedCues];
			await editor.project.updateSettings({
				settings: { originalSubtitleCues: nextOriginalSubtitleCues },
			});
			editor.timeline.updateTracks(
				materializeSubtitleSyncedEffectsForAllGroups(
					editor.timeline.getTracks(),
					nextOriginalSubtitleCues,
				),
			);
			setOriginalSubtitleScanStatus(
				scannedCues.length > 0
					? `Đã lưu ${scannedCues.length} cue phụ đề gốc.`
					: "Không phát hiện phụ đề trong vùng đã khoanh.",
			);
			if (scannedCues.length > 0) toast.success(`Đã quét ${scannedCues.length} cue phụ đề gốc.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Không thể quét phụ đề gốc.";
			setOriginalSubtitleScanStatus(message);
			toast.error(message);
		} finally {
			setIsScanningOriginalSubtitles(false);
		}
	};

	return (
		<div className="flex h-full flex-col bg-background select-none">
			<div className="border-b px-4 py-3 bg-muted/10">
				<div>
					<h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<Layers className="size-4 text-primary" />
						<span>Lớp phủ</span>
					</h3>
					<p className="text-[11px] text-muted-foreground mt-0.5">
						Khoanh vùng để làm mờ hoặc che nội dung trong video
					</p>
				</div>
			</div>

			<ScrollArea className="flex-1">
				<div className="space-y-5 p-3.5">
					<section className="space-y-2.5">
						<div className="flex items-center justify-between px-0.5">
							<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								HIỆU ỨNG LÀM MỜ / XOÁ
							</span>
						</div>

						<div className="overflow-hidden rounded-lg border bg-card">
							{OVERLAY_PRESETS.map((preset) => {
								const Icon = preset.icon;

								return (
									<button
										type="button"
										key={preset.id}
										onClick={() => handleAddToTimeline(preset)}
										className={cn(
											"group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
											"border-b border-border/60 last:border-b-0",
										)}
									>
										<div
											className={cn(
												"flex size-9 shrink-0 items-center justify-center rounded-md border bg-gradient-to-br transition-transform group-hover:scale-105",
												preset.colorClass,
											)}
										>
											<Icon className="size-5" />
										</div>

										<div className="min-w-0 flex-1">
											<p className="truncate text-xs font-semibold text-foreground">
												{preset.name}
											</p>
											<p className="mt-0.5 truncate text-[10px] text-muted-foreground">
												{preset.subtitle}
											</p>
										</div>
									</button>
								);
							})}
						</div>
						<p className="px-0.5 text-[10px] leading-relaxed text-muted-foreground">
							Bấm một hiệu ứng để thêm vùng 4 giây tại vị trí đầu phát. Kéo và
							đổi kích thước trực tiếp trên khung xem trước.
						</p>
					</section>

					<section className="space-y-2.5 border-t pt-4">
						<div className="px-0.5">
							<p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								NỀN VIDEO (BACKGROUND)
							</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
								Chỉ lấp vùng trống khi tỷ lệ video khác tỷ lệ khung hình.
							</p>
						</div>

						<div className="overflow-hidden rounded-lg border bg-card">
							{VIDEO_BACKGROUND_OPTIONS.map((option) => {
								const Icon = option.icon;
								const isActive = backgroundMode === option.id;
								return (
									<button
										type="button"
										key={option.id}
										onClick={() => selectBackgroundMode(option.id)}
										className={cn(
											"flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/40",
											isActive && "bg-primary/10",
										)}
										aria-pressed={isActive}
									>
										<span
											className={cn(
												"flex size-8 shrink-0 items-center justify-center rounded-md border",
												isActive
													? "border-primary/50 bg-primary/15 text-primary"
													: "bg-muted/40 text-muted-foreground",
											)}
										>
											<Icon className="size-4" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block text-xs font-semibold text-foreground">
												{option.name}
											</span>
											<span className="mt-0.5 block text-[10px] text-muted-foreground">
												{option.subtitle}
											</span>
										</span>
									</button>
								);
							})}
						</div>

						{backgroundMode === "color" && (
							<div className="space-y-2 rounded-lg border bg-card p-3">
								<label
									htmlFor="video-background-color"
									className="text-[10px] font-semibold uppercase text-muted-foreground"
								>
									Màu nền
								</label>
								<div className="flex items-center gap-2">
									<input
										id="video-background-color"
										type="color"
										value={
											solidColor === "transparent" ? "#000000" : solidColor
										}
										onChange={(event) =>
											updateBackground({
												type: "color",
												color: event.target.value,
											})
										}
										className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1"
									/>
									<span className="text-xs font-mono uppercase text-muted-foreground">
										{solidColor}
									</span>
								</div>
							</div>
						)}

						{backgroundMode === "gradient" && (
							<div className="space-y-3 rounded-lg border bg-card p-3">
								<div
									className="h-10 rounded-md border"
									style={{
										background: `linear-gradient(${gradientAngle}deg, #${gradientStops[0]}, #${gradientStops[1]})`,
									}}
								/>
								<div className="grid grid-cols-2 gap-2">
									{GRADIENT_COLOR_INPUTS.map((input) => (
										<label
											key={input.label}
											className="space-y-1 text-[10px] uppercase text-muted-foreground"
										>
											{input.label}
											<input
												type="color"
												value={`#${gradientStops[input.stopIndex]}`}
												onChange={(event) => {
													const nextStops = [...gradientStops] as [
														string,
														string,
													];
													nextStops[input.stopIndex] = event.target.value
														.slice(1)
														.toUpperCase();
													updateGradient({ stops: nextStops });
												}}
												className="block h-9 w-full cursor-pointer rounded border bg-transparent p-1"
											/>
										</label>
									))}
								</div>
								<label
									htmlFor="video-background-direction"
									className="block space-y-1 text-[10px] uppercase text-muted-foreground"
								>
									Hướng
									<select
										id="video-background-direction"
										value={gradientAngle}
										onChange={(event) =>
											updateGradient({ angle: Number(event.target.value) })
										}
										className="h-9 w-full rounded-md border bg-background px-2 text-xs normal-case text-foreground"
									>
										{GRADIENT_DIRECTIONS.map((direction) => (
											<option key={direction.value} value={direction.value}>
												{direction.label}
											</option>
										))}
									</select>
								</label>
							</div>
						)}

						{backgroundMode === "blur" && (
							<div className="space-y-3 rounded-lg border bg-card p-3">
								<div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted-foreground">
									<span>Độ mờ</span>
									<span className="text-foreground">{blurIntensity}</span>
								</div>
								<Slider
									value={[blurIntensity]}
									min={4}
									max={60}
									step={1}
									onValueChange={([value]) =>
										updateBackground({ type: "blur", blurIntensity: value })
									}
								/>
							</div>
						)}
					</section>
				</div>
			</ScrollArea>
		</div>
	);
}
