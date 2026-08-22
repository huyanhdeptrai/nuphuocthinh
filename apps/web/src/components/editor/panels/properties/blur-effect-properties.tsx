"use client";

import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState, useReducer, useRef } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { PanelBaseView } from "@/components/editor/panels/panel-base-view";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { KeyframeRow } from "./keyframe-row";
import { clamp } from "@/utils/math";
import { useEditor } from "@/hooks/use-editor";
import type { BlurEffectElement, OverlayEffectMode } from "@/types/timeline";
import {
	Grid3X3,
	Move,
	Sparkles,
	Rows3,
	SquareSlash,
	Palette,
	RotateCw,
	Maximize2,
	ScanLine,
} from "lucide-react";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import {
	dematerializeSubtitleSyncedEffects,
	materializeSubtitleSyncedEffects,
} from "@/lib/timeline/subtitle-effect-sync";
import { OriginalSubtitleScanTab } from "./original-subtitle-scan-tab";

export function BlurEffectProperties({
	_element: element,
	trackId,
}: {
	_element: BlurEffectElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const editor = useEditor();
	const [, forceRender] = useReducer((x: number) => x + 1, 0);

	const [activeSubTab, setActiveSubTab] = useState<"style" | "position" | "ocr">(
		"position",
	);

	const activeProject = editor.project.getActive();
	const canvasWidth = activeProject?.settings.canvasSize.width ?? 1920;
	const canvasHeight = activeProject?.settings.canvasSize.height ?? 1080;
	const originalSubtitleCues = activeProject?.settings.originalSubtitleCues ?? [];

	// Calculate pixel dimensions and top-left positions on canvas
	const pixelWidth = Math.round(
		canvasWidth * element.transform.scale * (element.boxWidth ?? 1),
	);
	const pixelHeight = Math.round(
		canvasHeight * element.transform.scale * (element.boxHeight ?? 1),
	);
	const pixelX = Math.round(
		canvasWidth / 2 + element.transform.position.x - pixelWidth / 2,
	);
	const pixelY = Math.round(
		canvasHeight / 2 + element.transform.position.y - pixelHeight / 2,
	);

	const startTimeSec = Number(element.startTime.toFixed(2));
	const endTimeSec = Number((element.startTime + element.duration).toFixed(2));

	// Drafting refs for smooth text input without stuttering
	const isEditingPosX = useRef(false);
	const isEditingPosY = useRef(false);
	const isEditingWidth = useRef(false);
	const isEditingHeight = useRef(false);
	const isEditingStartTime = useRef(false);
	const isEditingEndTime = useRef(false);
	const isEditingIntensity = useRef(false);
	const isEditingFeather = useRef(false);
	const isEditingOpacity = useRef(false);
	const isEditingPixelSize = useRef(false);
	const isEditingDarken = useRef(false);
	const isEditingRadius = useRef(false);
	const isEditingScale = useRef(false);
	const isEditingRotate = useRef(false);

	const posXDraft = useRef("");
	const posYDraft = useRef("");
	const widthDraft = useRef("");
	const heightDraft = useRef("");
	const startTimeDraft = useRef("");
	const endTimeDraft = useRef("");
	const intensityDraft = useRef("");
	const featherDraft = useRef("");
	const opacityDraft = useRef("");
	const pixelSizeDraft = useRef("");
	const darkenDraft = useRef("");
	const radiusDraft = useRef("");
	const scaleDraft = useRef("");
	const rotateDraft = useRef("");

	const initialIntensityRef = useRef<number | null>(null);
	const initialFeatherRef = useRef<number | null>(null);
	const initialOpacityRef = useRef<number | null>(null);
	const initialPixelSizeRef = useRef<number | null>(null);
	const initialDarkenRef = useRef<number | null>(null);
	const initialRadiusRef = useRef<number | null>(null);

	const updateElement = ({
		updates,
		pushHistory = true,
	}: {
		updates: Partial<Record<string, unknown>>;
		pushHistory?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, updates }],
			pushHistory,
		});
	};

	// Migrate effects created by the earlier renderer-only implementation. The
	// first time such an effect is selected, materialize all subtitle cues as
	// real timeline elements so the timeline and renderer share one source.
	useEffect(() => {
		if (!element.syncWithSubtitles || element.syncGroupId) return;
		const nextTracks = materializeSubtitleSyncedEffects({
			tracks: editor.timeline.getTracks(),
			trackId,
			elementId: element.id,
			canvasSize: { width: canvasWidth, height: canvasHeight },
			originalSubtitleCues,
		});
		const nextElement = nextTracks
			.find((track) => track.id === trackId)
			?.elements.find((candidate) => candidate.id === element.id);
		if (nextElement?.type === "blur-effect" && nextElement.syncGroupId) {
			editor.timeline.updateTracks(nextTracks);
		}
	}, [
		canvasHeight,
		canvasWidth,
		editor,
		element.id,
		element.syncGroupId,
		element.syncWithSubtitles,
		originalSubtitleCues,
		trackId,
	]);

	const updateSubtitleSync = ({
		updates,
		pushHistory = true,
	}: {
		updates: Partial<BlurEffectElement>;
		pushHistory?: boolean;
	}) => {
		if (!element.syncWithSubtitles) {
			updateElement({ updates, pushHistory });
			return;
		}

		const tracks = editor.timeline.getTracks();
		const groupId = element.syncGroupId ?? element.id;
		let masterTrackId = trackId;
		let masterElementId = element.id;
		const withUpdatedMaster = tracks.map((track) => ({
			...track,
			elements: track.elements.map((candidate) => {
				if (
					candidate.type === "blur-effect" &&
					candidate.syncGroupId === groupId &&
					!candidate.syncGenerated
				) {
					masterTrackId = track.id;
					masterElementId = candidate.id;
					return { ...candidate, ...updates };
				}
				return candidate;
			}),
		})) as typeof tracks;
		editor.timeline.updateTracks(
			materializeSubtitleSyncedEffects({
				tracks: withUpdatedMaster,
				trackId: masterTrackId,
				elementId: masterElementId,
				canvasSize: { width: canvasWidth, height: canvasHeight },
				originalSubtitleCues,
			}),
		);
	};

	const updateTransform = ({
		updates,
		pushHistory = true,
	}: {
		updates: Partial<typeof element.transform>;
		pushHistory?: boolean;
	}) => {
		updateElement({
			updates: { transform: { ...element.transform, ...updates } },
			pushHistory,
		});
	};

	const currentMode = element.effectMode ?? "blur-strip";
	const isPixelate = currentMode === "pixelate";

	const MODE_CONFIG: Record<
		OverlayEffectMode,
		{
			name: string;
			displayTitle: string;
			headerBadge: string;
			icon: React.ElementType;
		}
	> = {
		"blur-strip": {
			name: "Dải làm mờ",
			displayTitle: "Dải làm mờ",
			headerBadge: "DẢI LÀM MỜ",
			icon: Rows3,
		},
		blur: {
			name: "Làm mờ (Gaussian)",
			displayTitle: "Làm mờ (Gaussian)",
			headerBadge: "LÀM MỜ",
			icon: Sparkles,
		},
		pixelate: {
			name: "Ô khảm (Pixelate)",
			displayTitle: "Pixelate",
			headerBadge: "PIXELATE",
			icon: Grid3X3,
		},
		"frosted-glass": {
			name: "Kính mờ (Frosted)",
			displayTitle: "Frosted Glass",
			headerBadge: "KÍNH MỜ",
			icon: Sparkles,
		},
		"remove-logo": {
			name: "Kính mờ",
			displayTitle: "Kính mờ",
			headerBadge: "KÍNH MỜ",
			icon: SquareSlash,
		},
		"remove-subtitle": {
			// Kept only so older saved projects remain editable after this preset
			// was removed from the assets panel.
			name: "Kính mờ",
			displayTitle: "Kính mờ",
			headerBadge: "KÍNH MỜ",
			icon: SquareSlash,
		},
	};

	const modeInfo = MODE_CONFIG[currentMode] ?? MODE_CONFIG["blur-strip"];
	const ModeIcon = modeInfo.icon;

	return (
		<div className="flex h-full flex-col bg-background select-none text-foreground">
			{/* Top Header */}
			<div className="border-b px-4 pt-3.5 pb-2.5 bg-muted/10">
				<div className="flex items-center justify-between mb-3">
					<span className="text-xs font-bold uppercase tracking-wider text-amber-500">
						THUỘC TÍNH
					</span>
					<span className="text-xs font-bold uppercase tracking-wider text-amber-500 font-mono">
						{modeInfo.headerBadge}
					</span>
				</div>

				{/* Two tabs: Kiểu (Style) & Vị trí (Position) */}
				<div className="grid grid-cols-3 gap-1 p-0.5 bg-muted/60 rounded-md border border-border/40">
					<button
						type="button"
						onClick={() => setActiveSubTab("style")}
						className={cn(
							"text-xs py-1.5 px-3 rounded font-medium transition-all text-center cursor-pointer flex items-center justify-center gap-1.5",
							activeSubTab === "style"
								? "bg-background text-foreground shadow-xs font-semibold"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Palette className="size-3.5" />
						<span>Kiểu</span>
					</button>
					<button
						type="button"
						onClick={() => setActiveSubTab("position")}
						className={cn(
							"text-xs py-1.5 px-3 rounded font-medium transition-all text-center cursor-pointer flex items-center justify-center gap-1.5",
							activeSubTab === "position"
								? "bg-background text-foreground shadow-xs font-semibold"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Move className="size-3.5" />
						<span>Vị trí</span>
					</button>
					<button
						type="button"
						onClick={() => setActiveSubTab("ocr")}
						className={cn(
							"text-xs py-1.5 px-2 rounded font-medium transition-all text-center cursor-pointer flex items-center justify-center gap-1",
							activeSubTab === "ocr"
								? "bg-background text-foreground shadow-xs font-semibold"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<ScanLine className="size-3.5" />
						<span>Quét OCR</span>
					</button>
				</div>
			</div>

			<PanelBaseView className="p-0 flex-1 overflow-y-auto">
				{activeSubTab === "ocr" ? (
					<OriginalSubtitleScanTab />
				) : activeSubTab === "position" ? (
					/* TAB VỊ TRÍ (POSITION) */
					<div className="p-4 space-y-4">
						{/* Row 1: TỌA ĐỘ X | TỌA ĐỘ Y */}
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									TỌA ĐỘ X
								</label>
								<Input
									type="number"
									value={isEditingPosX.current ? posXDraft.current : pixelX}
									onFocus={() => {
										isEditingPosX.current = true;
										posXDraft.current = pixelX.toString();
										forceRender();
									}}
									onChange={(e) => {
										posXDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed)) {
											const newPositionX =
												parsed + pixelWidth / 2 - canvasWidth / 2;
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														x: newPositionX,
													},
												},
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(posXDraft.current);
										if (!Number.isNaN(parsed)) {
											const newPositionX =
												parsed + pixelWidth / 2 - canvasWidth / 2;
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														x: newPositionX,
													},
												},
												pushHistory: true,
											});
										}
										isEditingPosX.current = false;
										posXDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>

							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									TỌA ĐỘ Y
								</label>
								<Input
									type="number"
									value={isEditingPosY.current ? posYDraft.current : pixelY}
									onFocus={() => {
										isEditingPosY.current = true;
										posYDraft.current = pixelY.toString();
										forceRender();
									}}
									onChange={(e) => {
										posYDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed)) {
											const newPositionY =
												parsed + pixelHeight / 2 - canvasHeight / 2;
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														y: newPositionY,
													},
												},
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(posYDraft.current);
										if (!Number.isNaN(parsed)) {
											const newPositionY =
												parsed + pixelHeight / 2 - canvasHeight / 2;
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														y: newPositionY,
													},
												},
												pushHistory: true,
											});
										}
										isEditingPosY.current = false;
										posYDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									CHIỀU RỘNG
								</label>
								<Input
									type="number"
									min={1}
									value={
										isEditingWidth.current ? widthDraft.current : pixelWidth
									}
									onFocus={() => {
										isEditingWidth.current = true;
										widthDraft.current = pixelWidth.toString();
										forceRender();
									}}
									onChange={(e) => {
										widthDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed) && parsed > 0) {
											const scale = element.transform.scale || 1;
											updateElement({
												updates: { boxWidth: parsed / (canvasWidth * scale) },
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(widthDraft.current);
										if (!Number.isNaN(parsed) && parsed > 0) {
											const scale = element.transform.scale || 1;
											updateElement({
												updates: { boxWidth: parsed / (canvasWidth * scale) },
												pushHistory: true,
											});
										}
										isEditingWidth.current = false;
										widthDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>
							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									CHIỀU CAO
								</label>
								<Input
									type="number"
									min={1}
									value={
										isEditingHeight.current ? heightDraft.current : pixelHeight
									}
									onFocus={() => {
										isEditingHeight.current = true;
										heightDraft.current = pixelHeight.toString();
										forceRender();
									}}
									onChange={(e) => {
										heightDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed) && parsed > 0) {
											const scale = element.transform.scale || 1;
											updateElement({
												updates: { boxHeight: parsed / (canvasHeight * scale) },
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(heightDraft.current);
										if (!Number.isNaN(parsed) && parsed > 0) {
											const scale = element.transform.scale || 1;
											updateElement({
												updates: { boxHeight: parsed / (canvasHeight * scale) },
												pushHistory: true,
											});
										}
										isEditingHeight.current = false;
										heightDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>
						</div>

						{/* Row 3: BẮT ĐẦU (S) | KẾT THÚC (S) */}
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									BẮT ĐẦU (S)
								</label>
								<Input
									type="number"
									step={0.01}
									min={0}
									value={
										isEditingStartTime.current
											? startTimeDraft.current
											: startTimeSec
									}
									onFocus={() => {
										isEditingStartTime.current = true;
										startTimeDraft.current = startTimeSec.toString();
										forceRender();
									}}
									onChange={(e) => {
										startTimeDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed) && parsed >= 0) {
											const currentEnd = element.startTime + element.duration;
											const newDuration = Math.max(0.1, currentEnd - parsed);
											updateElement({
												updates: { startTime: parsed, duration: newDuration },
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(startTimeDraft.current);
										if (!Number.isNaN(parsed) && parsed >= 0) {
											const currentEnd = element.startTime + element.duration;
											const newDuration = Math.max(0.1, currentEnd - parsed);
											updateElement({
												updates: { startTime: parsed, duration: newDuration },
												pushHistory: true,
											});
										}
										isEditingStartTime.current = false;
										startTimeDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>

							<div className="space-y-1.5">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
									KẾT THÚC (S)
								</label>
								<Input
									type="number"
									step={0.01}
									min={0}
									value={
										isEditingEndTime.current ? endTimeDraft.current : endTimeSec
									}
									onFocus={() => {
										isEditingEndTime.current = true;
										endTimeDraft.current = endTimeSec.toString();
										forceRender();
									}}
									onChange={(e) => {
										endTimeDraft.current = e.target.value;
										forceRender();
										const parsed = Number.parseFloat(e.target.value);
										if (!Number.isNaN(parsed) && parsed > element.startTime) {
											const newDuration = parsed - element.startTime;
											updateElement({
												updates: { duration: newDuration },
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										const parsed = Number.parseFloat(endTimeDraft.current);
										if (!Number.isNaN(parsed) && parsed > element.startTime) {
											const newDuration = parsed - element.startTime;
											updateElement({
												updates: { duration: newDuration },
												pushHistory: true,
											});
										}
										isEditingEndTime.current = false;
										endTimeDraft.current = "";
										forceRender();
									}}
									className="bg-card border-border/70 h-9 rounded-md text-sm font-mono px-3 text-foreground"
								/>
							</div>
						</div>

						{/* Keyframe Transforms */}
						<div className="pt-2 border-t border-border/40">
							<PropertyGroup title="Biến đổi & Khung hình chính (Keyframe)">
								<div className="space-y-3 pt-1">
									{/* Position X Keyframe */}
									<PropertyItem direction="column">
										<div className="flex items-center justify-between w-full">
											<PropertyItemLabel>Vị trí X</PropertyItemLabel>
											<KeyframeRow
												trackId={trackId}
												elementId={element.id}
												property="position.x"
												baseTransform={element.transform}
												baseOpacity={element.opacity}
												elementStartTime={element.startTime}
												elementDuration={element.duration}
												keyframes={element.keyframes}
											/>
										</div>
									</PropertyItem>

									{/* Position Y Keyframe */}
									<PropertyItem direction="column">
										<div className="flex items-center justify-between w-full">
											<PropertyItemLabel>Vị trí Y</PropertyItemLabel>
											<KeyframeRow
												trackId={trackId}
												elementId={element.id}
												property="position.y"
												baseTransform={element.transform}
												baseOpacity={element.opacity}
												elementStartTime={element.startTime}
												elementDuration={element.duration}
												keyframes={element.keyframes}
											/>
										</div>
									</PropertyItem>

									{/* Scale Keyframe */}
									<PropertyItem direction="column">
										<div className="flex items-center justify-between w-full">
											<PropertyItemLabel>Tỉ lệ phóng to</PropertyItemLabel>
											<KeyframeRow
												trackId={trackId}
												elementId={element.id}
												property="scale"
												baseTransform={element.transform}
												baseOpacity={element.opacity}
												elementStartTime={element.startTime}
												elementDuration={element.duration}
												keyframes={element.keyframes}
											/>
										</div>
										<PropertyItemValue>
											<Slider
												value={[element.transform.scale * 100]}
												min={10}
												max={300}
												step={1}
												onValueChange={([val]) => {
													updateTransform({
														updates: { scale: val / 100 },
														pushHistory: false,
													});
												}}
												onValueCommit={([val]) => {
													updateTransform({
														updates: { scale: val / 100 },
														pushHistory: true,
													});
												}}
												className="w-full"
											/>
										</PropertyItemValue>
									</PropertyItem>

									{/* Rotate Keyframe */}
									<PropertyItem direction="column">
										<div className="flex items-center justify-between w-full">
											<PropertyItemLabel>Góc xoay</PropertyItemLabel>
											<KeyframeRow
												trackId={trackId}
												elementId={element.id}
												property="rotate"
												baseTransform={element.transform}
												baseOpacity={element.opacity}
												elementStartTime={element.startTime}
												elementDuration={element.duration}
												keyframes={element.keyframes}
											/>
										</div>
										<PropertyItemValue>
											<Slider
												value={[element.transform.rotate]}
												min={-180}
												max={180}
												step={1}
												onValueChange={([val]) => {
													updateTransform({
														updates: { rotate: val },
														pushHistory: false,
													});
												}}
												onValueCommit={([val]) => {
													updateTransform({
														updates: { rotate: val },
														pushHistory: true,
													});
												}}
												className="w-full"
											/>
										</PropertyItemValue>
									</PropertyItem>
								</div>
							</PropertyGroup>
						</div>
					</div>
				) : (
					/* TAB KIỂU (STYLE) - DEDICATED CLEAN CONTROLS PER MODE */
					<div className="p-4 space-y-4">
						{/* Mode Title & Icon */}
						<div className="flex items-center gap-2 pb-2 text-amber-500 font-semibold text-xs border-b border-border/40">
							<ModeIcon className="size-4 text-amber-500" />
							<span>{modeInfo.displayTitle}</span>
						</div>

						{/* --- MODE 1: FROSTED GLASS --- */}
						{currentMode === "frosted-glass" && (
							<div className="space-y-3">
								{/* Mềm (Feather) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Mềm
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{(element.feather ?? 0.5).toFixed(2)}
										</span>
									</div>
									<Slider
										value={[element.feather ?? 0.5]}
										min={0}
										max={1}
										step={0.01}
										onValueChange={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Độ mờ (0-200%) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Độ mờ
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round((element.blurIntensity / 50) * 100)}%
										</span>
									</div>
									<Slider
										value={[Math.round((element.blurIntensity / 50) * 100)]}
										min={0}
										max={200}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { blurIntensity: (v / 100) * 50 },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { blurIntensity: (v / 100) * 50 },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Hạt kính (0-100%) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Hạt kính
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.grainIntensity ?? 30)}%
										</span>
									</div>
									<Slider
										value={[element.grainIntensity ?? 30]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { grainIntensity: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { grainIntensity: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>
							</div>
						)}

						{/* --- MODE 2: KÍNH MỜ --- */}
		{currentMode === "remove-logo" && (
			<div className="space-y-3">
				{/* Độ mờ */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground font-medium">
							Độ mờ
						</span>
						<span className="font-mono text-foreground text-xs font-semibold">
							{Math.round(element.blurIntensity)}%
						</span>
					</div>
					<Slider
						value={[element.blurIntensity]}
						min={0}
						max={100}
						step={1}
						onValueChange={([v]) => {
							updateElement({
								updates: { blurIntensity: v },
								pushHistory: false,
							});
						}}
						onValueCommit={([v]) => {
							updateElement({
								updates: { blurIntensity: v },
								pushHistory: true,
							});
						}}
						className="w-full"
					/>
				</div>

				{/* Mềm (Feather) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Mềm
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{(element.feather ?? 0.5).toFixed(2)}
										</span>
									</div>
									<Slider
										value={[element.feather ?? 0.5]}
										min={0}
										max={1}
										step={0.01}
										onValueChange={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Viền (px) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Viền
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.borderPadding ?? 4)}
										</span>
									</div>
									<Slider
										value={[element.borderPadding ?? 4]}
										min={0}
										max={50}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { borderPadding: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { borderPadding: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								<p className="text-[10px] text-muted-foreground/75 pt-1">
									Xoá bằng thuật toán delogo khi xuất video (content-aware
									fill).
								</p>
							</div>
						)}

						{/* --- MODE 3: REMOVE SUBTITLE --- */}
						{currentMode === "remove-subtitle" && (
							<div className="space-y-3">
								{/* Mềm (Feather) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Mềm
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{(element.feather ?? 0.5).toFixed(2)}
										</span>
									</div>
									<Slider
										value={[element.feather ?? 0.5]}
										min={0}
										max={1}
										step={0.01}
										onValueChange={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Viền (px) */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Viền
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.borderPadding ?? 6)}
										</span>
									</div>
									<Slider
										value={[element.borderPadding ?? 6]}
										min={0}
										max={50}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { borderPadding: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { borderPadding: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								<p className="text-[10px] text-muted-foreground/75 pt-1">
									Xoá bằng thuật toán delogo khi xuất video (content-aware
									fill).
								</p>
							</div>
						)}

						{/* --- MODE 4: PIXELATE --- */}
						{currentMode === "pixelate" && (
							<div className="space-y-3">
								{/* Mềm */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Mềm
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{(element.feather ?? 0.5).toFixed(2)}
										</span>
									</div>
									<Slider
										value={[element.feather ?? 0.5]}
										min={0}
										max={1}
										step={0.01}
										onValueChange={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Kích thước điểm ảnh */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Ô pixel
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.pixelSize ?? 16)}
										</span>
									</div>
									<Slider
										value={[element.pixelSize ?? 16]}
										min={4}
										max={64}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { pixelSize: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { pixelSize: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>
							</div>
						)}

						{/* --- MODE 5: BLUR STRIP & GAUSSIAN BLUR --- */}
						{(currentMode === "blur-strip" || currentMode === "blur") && (
							<div className="space-y-3">
								{/* Mềm */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Mềm
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{(element.feather ?? 0.4).toFixed(2)}
										</span>
									</div>
									<Slider
										value={[element.feather ?? 0.4]}
										min={0}
										max={1}
										step={0.01}
										onValueChange={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { feather: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Độ mờ */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Độ mờ
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.blurIntensity)}%
										</span>
									</div>
									<Slider
										value={[element.blurIntensity]}
										min={0}
										max={200}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { blurIntensity: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { blurIntensity: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Phủ tối viền */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground font-medium">
											Độ tối
										</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(
												element.darkenOverlay ??
													(currentMode === "blur-strip" ? 35 : 0),
											)}
											%
										</span>
									</div>
									<Slider
										value={[
											element.darkenOverlay ??
												(currentMode === "blur-strip" ? 35 : 0),
										]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { darkenOverlay: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { darkenOverlay: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>
							</div>
						)}

						{/* --- ĐỒNG BỘ THEO PHỤ ĐỀ (Tất cả các mode) --- */}
						<div className="pt-3 border-t border-border/40 space-y-2.5">
							<div className="flex items-center justify-between">
								<span className="text-xs font-medium text-foreground">
									Đồng bộ theo phụ đề
								</span>
								<Switch
									checked={element.syncWithSubtitles ?? false}
									onCheckedChange={(checked) => {
										const tracks = editor.timeline.getTracks();
										const nextTracks = checked
											? materializeSubtitleSyncedEffects({
													tracks,
													trackId,
													elementId: element.id,
													canvasSize: { width: canvasWidth, height: canvasHeight },
													originalSubtitleCues,
												})
											: dematerializeSubtitleSyncedEffects({
													tracks,
													groupId: element.syncGroupId ?? element.id,
												});
										editor.timeline.updateTracks(nextTracks);
									}}
								/>
							</div>

							<div className="space-y-1.5">
								<label className="text-xs text-muted-foreground" htmlFor="overlay-subtitle-sync-source">
									Nguồn đồng bộ
								</label>
								<select
									id="overlay-subtitle-sync-source"
									value={element.subtitleSyncSource ?? "timeline-subtitles"}
									onChange={(event) => {
										const source = event.target.value as BlurEffectElement["subtitleSyncSource"];
										if (source === "original-subtitles" && originalSubtitleCues.length === 0) {
											toast.error("Chưa có cue phụ đề gốc. Hãy quét trong mục Lớp phủ trước.");
											return;
										}
										updateSubtitleSync({ updates: { subtitleSyncSource: source } });
									}}
									className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
								>
									<option value="timeline-subtitles">Phụ đề đã tạo / đã dịch</option>
									<option value="original-subtitles">
										Phụ đề gốc trong video ({originalSubtitleCues.length} cue)
									</option>
								</select>
								<p className="text-[10px] leading-relaxed text-muted-foreground">
									Phụ đề gốc dùng thời gian và vị trí đã quét trực tiếp từ video.
								</p>
							</div>

							{/* Đệm đầu */}
							<div className="space-y-1.5">
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Đệm đầu</span>
									<span className="font-mono text-foreground text-xs font-semibold">
										{(element.subtitlePaddingStart ?? 0.1).toFixed(2)}
									</span>
								</div>
								<Slider
									value={[element.subtitlePaddingStart ?? 0.1]}
									min={0}
									max={1}
									step={0.01}
									onValueChange={([v]) => {
										updateSubtitleSync({
											updates: { subtitlePaddingStart: v },
											pushHistory: false,
										});
									}}
									onValueCommit={([v]) => {
										updateSubtitleSync({
											updates: { subtitlePaddingStart: v },
											pushHistory: true,
										});
									}}
									className="w-full"
								/>
							</div>

							{/* Đệm cuối */}
							<div className="space-y-1.5">
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Đệm cuối</span>
									<span className="font-mono text-foreground text-xs font-semibold">
										{(element.subtitlePaddingEnd ?? 0.1).toFixed(2)}
									</span>
								</div>
								<Slider
									value={[element.subtitlePaddingEnd ?? 0.1]}
									min={0}
									max={1}
									step={0.01}
									onValueChange={([v]) => {
										updateSubtitleSync({
											updates: { subtitlePaddingEnd: v },
											pushHistory: false,
										});
									}}
									onValueCommit={([v]) => {
										updateSubtitleSync({
											updates: { subtitlePaddingEnd: v },
											pushHistory: true,
										});
									}}
									className="w-full"
								/>
							</div>

							{/* Extra coverage around the subtitle/input rectangle */}
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Phủ trái / phải</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.subtitleExpandX ?? 0)} px
										</span>
									</div>
									<Slider
										value={[element.subtitleExpandX ?? 0]}
										min={0}
										max={200}
										step={1}
										onValueChange={([v]) => updateSubtitleSync({
											updates: { subtitleExpandX: v },
											pushHistory: false,
										})}
										onValueCommit={([v]) => updateSubtitleSync({
											updates: { subtitleExpandX: v },
										})}
									/>
								</div>
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Phủ trên / dưới</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.subtitleExpandY ?? 0)} px
										</span>
									</div>
									<Slider
										value={[element.subtitleExpandY ?? 0]}
										min={0}
										max={200}
										step={1}
										onValueChange={([v]) => updateSubtitleSync({
											updates: { subtitleExpandY: v },
											pushHistory: false,
										})}
										onValueCommit={([v]) => updateSubtitleSync({
											updates: { subtitleExpandY: v },
										})}
									/>
								</div>
							</div>

							<p className="text-[10px] text-muted-foreground/75 pt-0.5">
								Hiệu ứng chỉ hiện khi có phụ đề đang hiển thị (kèm đệm thời gian
								tuỳ chọn).
							</p>
						</div>

						{/* --- Legacy saved-project controls --- */}
						{currentMode === "remove-subtitle" && (
							<div className="pt-3 border-t border-border/40 space-y-2.5">
								<div className="flex items-center gap-1.5">
									<Maximize2 className="size-3.5 text-amber-500" />
									<span className="text-xs font-medium text-foreground">
										Nối vùng xoá (theo cạnh)
									</span>
								</div>

								{/* Trên */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Trên</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.expandTop ?? 0)}
										</span>
									</div>
									<Slider
										value={[element.expandTop ?? 0]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { expandTop: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { expandTop: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Dưới */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Dưới</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.expandBottom ?? 0)}
										</span>
									</div>
									<Slider
										value={[element.expandBottom ?? 0]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { expandBottom: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { expandBottom: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Trái */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Trái</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.expandLeft ?? 0)}
										</span>
									</div>
									<Slider
										value={[element.expandLeft ?? 0]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { expandLeft: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { expandLeft: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								{/* Phải */}
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Phải</span>
										<span className="font-mono text-foreground text-xs font-semibold">
											{Math.round(element.expandRight ?? 0)}
										</span>
									</div>
									<Slider
										value={[element.expandRight ?? 0]}
										min={0}
										max={100}
										step={1}
										onValueChange={([v]) => {
											updateElement({
												updates: { expandRight: v },
												pushHistory: false,
											});
										}}
										onValueCommit={([v]) => {
											updateElement({
												updates: { expandRight: v },
												pushHistory: true,
											});
										}}
										className="w-full"
									/>
								</div>

								<p className="text-[10px] text-muted-foreground/75 pt-0.5">
									Vùng xoá bám theo vị trí phụ đề (OCR), nới/co từng cạnh để
									trùm hết sub gốc (px video).
								</p>
							</div>
						)}
					</div>
				)}
			</PanelBaseView>
		</div>
	);
}
