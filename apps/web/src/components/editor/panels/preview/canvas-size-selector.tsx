"use client";

import { useMemo, useState } from "react";
import {
	Check,
	ChevronDown,
	Crop,
	Monitor,
	Smartphone,
	Square,
	Tv,
	Film,
	SlidersHorizontal,
	ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/hooks/use-editor";
import { cn } from "@/utils/ui";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";

export interface AspectRatioItem {
	id: string;
	label: string;
	subtitle: string;
	width: number;
	height: number;
	ratioNumeric: number;
	icon: React.ReactNode;
	isOriginal?: boolean;
}

export const RESOLUTION_PRESETS = [
	{ label: "4K (3840×2160)", width: 3840, height: 2160, tag: "16:9" },
	{ label: "2K (2560×1440)", width: 2560, height: 1440, tag: "16:9" },
	{ label: "1080p Full HD (1920×1080)", width: 1920, height: 1080, tag: "16:9" },
	{ label: "720p HD (1280×720)", width: 1280, height: 720, tag: "16:9" },
	{ label: "1080p Dọc (1080×1920)", width: 1080, height: 1920, tag: "9:16" },
	{ label: "720p Dọc (720×1280)", width: 720, height: 1280, tag: "9:16" },
];

export function CanvasSizeSelector({
	className,
	variant = "default",
	size = "sm",
}: {
	className?: string;
	variant?: "default" | "outline" | "ghost" | "secondary" | "text";
	size?: "default" | "sm" | "icon" | "text" | "lg";
}) {
	const { t } = useTranslation();
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	const currentWidth = activeProject?.settings.canvasSize.width ?? 1920;
	const currentHeight = activeProject?.settings.canvasSize.height ?? 1080;

	// Tìm kích thước gốc thật của video từ timeline hoặc media assets
	const mediaAssets = editor.media.getAssets();
	const tracks = editor.timeline.getTracks();

	const detectedOriginalSize = useMemo(() => {
		if (
			activeProject?.settings.originalCanvasSize?.width &&
			activeProject?.settings.originalCanvasSize?.height
		) {
			return activeProject.settings.originalCanvasSize;
		}

		// Tìm video element đang có trên timeline
		for (const track of tracks) {
			if (track.type === "video") {
				for (const element of track.elements) {
					if ("mediaId" in element && element.mediaId) {
						const asset = mediaAssets.find((a) => a.id === element.mediaId);
						if (asset?.width && asset?.height) {
							return { width: asset.width, height: asset.height };
						}
					}
				}
			}
		}

		// Tìm từ media assets video hoặc image đã nạp
		const firstVideo = mediaAssets.find(
			(a) => a.type === "video" && a.width && a.height,
		);
		if (firstVideo?.width && firstVideo?.height) {
			return { width: firstVideo.width, height: firstVideo.height };
		}

		const anyAsset = mediaAssets.find((a) => a.width && a.height);
		if (anyAsset?.width && anyAsset?.height) {
			return { width: anyAsset.width, height: anyAsset.height };
		}

		return null;
	}, [activeProject?.settings.originalCanvasSize, tracks, mediaAssets]);

	const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
	const [customW, setCustomW] = useState(currentWidth);
	const [customH, setCustomH] = useState(currentHeight);

	const ratioItems: AspectRatioItem[] = useMemo(() => {
		const origW = detectedOriginalSize?.width ?? currentWidth;
		const origH = detectedOriginalSize?.height ?? currentHeight;

		return [
			{
				id: "original",
				label: "Original",
				subtitle: detectedOriginalSize
					? `${origW}×${origH} (Gốc)`
					: "Kích thước gốc video",
				width: origW,
				height: origH,
				ratioNumeric: origW / Math.max(1, origH),
				isOriginal: true,
				icon: <Crop className="size-4" />,
			},
			{
				id: "16:9",
				label: "16:9",
				subtitle: "YouTube, Ngang, TV (1920×1080)",
				width: 1920,
				height: 1080,
				ratioNumeric: 16 / 9,
				icon: <Monitor className="size-4" />,
			},
			{
				id: "9:16",
				label: "9:16",
				subtitle: "TikTok, Shorts, Reels (1080×1920)",
				width: 1080,
				height: 1920,
				ratioNumeric: 9 / 16,
				icon: <Smartphone className="size-4" />,
			},
			{
				id: "1:1",
				label: "1:1",
				subtitle: "Instagram, Vuông (1080×1080)",
				width: 1080,
				height: 1080,
				ratioNumeric: 1,
				icon: <Square className="size-4" />,
			},
			{
				id: "4:3",
				label: "4:3",
				subtitle: "Chuẩn TV cũ / iPad (1440×1080)",
				width: 1440,
				height: 1080,
				ratioNumeric: 4 / 3,
				icon: <Tv className="size-4" />,
			},
			{
				id: "3:4",
				label: "3:4",
				subtitle: "Dọc Facebook / Tablet (1080×1440)",
				width: 1080,
				height: 1440,
				ratioNumeric: 3 / 4,
				icon: <Smartphone className="size-4" />,
			},
			{
				id: "21:9",
				label: "21:9",
				subtitle: "Điện ảnh / Ultrawide (2560×1080)",
				width: 2560,
				height: 1080,
				ratioNumeric: 21 / 9,
				icon: <Film className="size-4" />,
			},
		];
	}, [detectedOriginalSize, currentWidth, currentHeight]);

	// Identify active aspect ratio item
	const activeItem = useMemo(() => {
		if (
			detectedOriginalSize &&
			detectedOriginalSize.width === currentWidth &&
			detectedOriginalSize.height === currentHeight
		) {
			return ratioItems[0];
		}

		const currentRatio = currentWidth / Math.max(1, currentHeight);

		for (const item of ratioItems) {
			if (item.isOriginal) continue;
			if (
				(item.width === currentWidth && item.height === currentHeight) ||
				Math.abs(item.ratioNumeric - currentRatio) < 0.015
			) {
				return item;
			}
		}

		return null;
	}, [ratioItems, currentWidth, currentHeight, detectedOriginalSize]);

	const currentDisplayLabel = activeItem
		? activeItem.label
		: `${currentWidth}×${currentHeight}`;

	const handleSelectRatio = (item: AspectRatioItem) => {
		if (item.isOriginal) {
			const targetWidth = detectedOriginalSize?.width ?? item.width;
			const targetHeight = detectedOriginalSize?.height ?? item.height;

			editor.project.updateSettings({
				settings: {
					canvasSize: { width: targetWidth, height: targetHeight },
					originalCanvasSize: { width: targetWidth, height: targetHeight },
				},
			});

			if (targetHeight > targetWidth) {
				editor.project.setLayoutMode({ mode: "vertical" });
			} else {
				editor.project.setLayoutMode({ mode: "landscape" });
			}
			return;
		}

		editor.project.updateSettings({
			settings: {
				canvasSize: { width: item.width, height: item.height },
				...(detectedOriginalSize
					? { originalCanvasSize: detectedOriginalSize }
					: {}),
			},
		});

		if (item.height > item.width) {
			editor.project.setLayoutMode({ mode: "vertical" });
		} else {
			editor.project.setLayoutMode({ mode: "landscape" });
		}
	};

	const handleSelectResolution = (res: { width: number; height: number }) => {
		editor.project.updateSettings({
			settings: {
				canvasSize: { width: res.width, height: res.height },
			},
		});
		if (res.height > res.width) {
			editor.project.setLayoutMode({ mode: "vertical" });
		} else {
			editor.project.setLayoutMode({ mode: "landscape" });
		}
	};

	const handleApplyCustom = () => {
		const w = Math.max(100, Math.min(7680, Math.round(Number(customW) || 1920)));
		const h = Math.max(100, Math.min(4320, Math.round(Number(customH) || 1080)));
		editor.project.updateSettings({
			settings: {
				canvasSize: { width: w, height: h },
			},
		});
		if (h > w) {
			editor.project.setLayoutMode({ mode: "vertical" });
		} else {
			editor.project.setLayoutMode({ mode: "landscape" });
		}
		setIsCustomDialogOpen(false);
	};

	const handleSwapDimensions = () => {
		const temp = customW;
		setCustomW(customH);
		setCustomH(temp);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant={variant}
						size={size}
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						className={cn(
							"flex items-center gap-1.5 font-medium text-xs h-7 px-2.5 rounded-md transition-colors",
							"bg-background/80 hover:bg-accent hover:text-accent-foreground border shadow-xs backdrop-blur-xs",
							className,
						)}
						title="Kích thước & Tỷ lệ khung hình video"
					>
						<Crop className="size-3.5 text-primary shrink-0" />
						<span className="truncate">{currentDisplayLabel}</span>
						<ChevronDown className="size-3 text-muted-foreground shrink-0 opacity-70" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					align="start"
					side="top"
					className="w-64 p-1.5 shadow-xl border-border bg-popover/95 backdrop-blur-md"
				>
					<DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
						Tỷ lệ khung hình
					</DropdownMenuLabel>

					<DropdownMenuGroup className="space-y-0.5">
						{ratioItems.map((item) => {
							const isSelected =
								activeItem?.id === item.id ||
								(!activeItem && item.width === currentWidth && item.height === currentHeight);

							return (
								<DropdownMenuItem
									key={item.id}
									onClick={() => handleSelectRatio(item)}
									className={cn(
										"flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
										isSelected && "bg-primary/10 text-primary font-semibold",
									)}
								>
									<div className="flex items-center gap-2.5 min-w-0">
										{/* Aspect ratio preview mini rectangle */}
										<div
											className={cn(
												"size-5 rounded-[3px] border flex items-center justify-center shrink-0",
												isSelected
													? "border-primary bg-primary/20 text-primary"
													: "border-muted-foreground/40 bg-muted/30 text-muted-foreground",
											)}
										>
											<div
												className="rounded-[1px] border border-current"
												style={{
													width:
														item.id === "9:16" || item.id === "3:4"
															? "8px"
															: item.id === "1:1"
																? "12px"
																: item.id === "21:9"
																	? "15px"
																	: "13px",
													height:
														item.id === "9:16"
															? "14px"
															: item.id === "3:4"
																? "12px"
																: item.id === "1:1"
																	? "12px"
																	: item.id === "21:9"
																		? "7px"
																		: "8px",
												}}
											/>
										</div>

										<div className="flex flex-col min-w-0">
											<span className="font-medium text-xs leading-tight">
												{item.label}
											</span>
											<span className="text-[10px] text-muted-foreground truncate">
												{item.subtitle}
											</span>
										</div>
									</div>

									{isSelected && (
										<Check className="size-3.5 text-primary shrink-0 ml-2" />
									)}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuGroup>

					<DropdownMenuSeparator className="my-1" />

					<DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
						Độ phân giải phổ biến
					</DropdownMenuLabel>

					<DropdownMenuGroup className="space-y-0.5">
						{RESOLUTION_PRESETS.map((res) => {
							const isResActive =
								currentWidth === res.width && currentHeight === res.height;

							return (
								<DropdownMenuItem
									key={res.label}
									onClick={() => handleSelectResolution(res)}
									className={cn(
										"flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs",
										isResActive && "bg-primary/10 text-primary font-medium",
									)}
								>
									<span className="truncate">{res.label}</span>
									{isResActive && (
										<Check className="size-3.5 text-primary shrink-0 ml-1.5" />
									)}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuGroup>

					<DropdownMenuSeparator className="my-1" />

					<DropdownMenuItem
						onClick={() => {
							setCustomW(currentWidth);
							setCustomH(currentHeight);
							setIsCustomDialogOpen(true);
						}}
						className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs font-medium text-foreground hover:text-primary"
					>
						<SlidersHorizontal className="size-3.5 text-muted-foreground" />
						<span>Tùy chỉnh kích thước...</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Custom Size Dialog */}
			<Dialog open={isCustomDialogOpen} onOpenChange={setIsCustomDialogOpen}>
				<DialogContent className="sm:max-w-[380px]">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold">
							Tùy chỉnh kích thước video
						</DialogTitle>
						<DialogDescription className="text-xs text-muted-foreground">
							Nhập kích thước pixel (Chiều rộng × Chiều cao) cho khung hình video.
						</DialogDescription>
					</DialogHeader>

					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3">
						<div className="space-y-1.5">
							<Label htmlFor="custom-width" className="text-xs font-medium">
								Chiều rộng (px)
							</Label>
							<Input
								id="custom-width"
								type="number"
								min={100}
								max={7680}
								value={customW}
								onChange={(e) => setCustomW(Number(e.target.value))}
								className="h-8 text-sm"
							/>
						</div>

						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={handleSwapDimensions}
							className="mt-5 size-8 shrink-0 rounded-full hover:bg-muted"
							title="Đổi ngang / dọc"
						>
							<ArrowLeftRight className="size-3.5 text-muted-foreground" />
						</Button>

						<div className="space-y-1.5">
							<Label htmlFor="custom-height" className="text-xs font-medium">
								Chiều cao (px)
							</Label>
							<Input
								id="custom-height"
								type="number"
								min={100}
								max={4320}
								value={customH}
								onChange={(e) => setCustomH(Number(e.target.value))}
								className="h-8 text-sm"
							/>
						</div>
					</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md">
						<span>Tỷ lệ tương ứng:</span>
						<span className="font-mono font-medium text-foreground">
							{Math.round((customW / Math.max(1, customH)) * 100) / 100} : 1 (
							{customW} × {customH})
						</span>
					</div>

					<DialogFooter className="gap-2 sm:gap-0 mt-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setIsCustomDialogOpen(false)}
						>
							Hủy
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={handleApplyCustom}
						>
							Áp dụng
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
