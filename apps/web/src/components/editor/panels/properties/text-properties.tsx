"use client";

import { Textarea } from "@/components/ui/textarea";
import { FontPicker } from "@/components/ui/font-picker";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import type { FontFamily } from "@/constants/font-constants";
import type {
	TextElement,
	TextStroke,
	TextShadow,
	Transform,
} from "@/types/timeline";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelBaseView } from "@/components/editor/panels/panel-base-view";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { KeyframeRow } from "./keyframe-row";
import { useAnimatedProperty } from "./use-animated-property";
import { useAnimatedValueWriter } from "./use-animated-value-writer";
import { TextAnimationTab } from "./text-animation-tab";
import { ColorPicker } from "@/components/ui/color-picker";
import { uppercase } from "@/utils/string";
import { clamp } from "@/utils/math";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_COLOR } from "@/constants/project-constants";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "@/constants/text-constants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TextSpeechPanel } from "./text-speech-panel";
import { OriginalSubtitleScanTab } from "./original-subtitle-scan-tab";
import {
	TEXT_STYLE_PRESETS,
	type TextStylePreset,
} from "@/constants/text-style-presets";
import {
	useCustomTextPresetsStore,
	type CustomTextStylePreset,
} from "@/stores/custom-text-presets-store";
import {
	syncSubtitleStyles,
	isSubtitleTextElement,
	getElementSpeakerInfo,
} from "@/dubbing/services/subtitle-style-sync";
import {
	SparklesIcon,
	UserIcon,
	Bookmark02Icon,
	PlusSignIcon,
	Delete02Icon,
	LayersIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";

interface TextElementRef {
	element: TextElement;
	trackId: string;
}

export function TextProperties({
	elements: elementRefs,
}: {
	elements: TextElementRef[];
}) {
	const element = elementRefs[0].element;
	// For keyframe-awareness, we bind to the first element only (batch stays
	// static when multiple text elements are selected — see plan).
	const firstRef = elementRefs[0];
	// Keyframe-aware display values (sampled at playhead when animated).
	const posX = useAnimatedProperty({
		keyframes: element.keyframes,
		property: "position.x",
		baseValue: element.transform.position.x,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const posY = useAnimatedProperty({
		keyframes: element.keyframes,
		property: "position.y",
		baseValue: element.transform.position.y,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const scaleProp = useAnimatedProperty({
		keyframes: element.keyframes,
		property: "scale",
		baseValue: element.transform.scale,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const rotateProp = useAnimatedProperty({
		keyframes: element.keyframes,
		property: "rotate",
		baseValue: element.transform.rotate,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const opacityProp = useAnimatedProperty({
		keyframes: element.keyframes,
		property: "opacity",
		baseValue: element.opacity,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	// Auto-keyframe writers (only operate on the first element).
	const posXWriter = useAnimatedValueWriter({
		keyframes: element.keyframes,
		property: "position.x",
		trackId: firstRef.trackId,
		elementId: firstRef.element.id,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const posYWriter = useAnimatedValueWriter({
		keyframes: element.keyframes,
		property: "position.y",
		trackId: firstRef.trackId,
		elementId: firstRef.element.id,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const scaleWriter = useAnimatedValueWriter({
		keyframes: element.keyframes,
		property: "scale",
		trackId: firstRef.trackId,
		elementId: firstRef.element.id,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const rotateWriter = useAnimatedValueWriter({
		keyframes: element.keyframes,
		property: "rotate",
		trackId: firstRef.trackId,
		elementId: firstRef.element.id,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const opacityWriter = useAnimatedValueWriter({
		keyframes: element.keyframes,
		property: "opacity",
		trackId: firstRef.trackId,
		elementId: firstRef.element.id,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});

	const { t } = useTranslation();
	const editor = useEditor();
	const containerRef = useRef<HTMLDivElement>(null);
	const [, forceRender] = useReducer((x: number) => x + 1, 0);
	const isEditingFontSize = useRef(false);
	const isEditingOpacity = useRef(false);
	const isEditingContent = useRef(false);
	const isEditingPosX = useRef(false);
	const isEditingPosY = useRef(false);
	const isEditingScale = useRef(false);
	const isEditingRotation = useRef(false);
	const fontSizeDraft = useRef("");
	const opacityDraft = useRef("");
	const contentDraft = useRef("");
	const posXDraft = useRef("");
	const posYDraft = useRef("");
	const scaleDraft = useRef("");
	const rotationDraft = useRef("");

	const buildBatchUpdates = (updates: Partial<Record<string, unknown>>) =>
		elementRefs.map((ref) => ({
			trackId: ref.trackId,
			elementId: ref.element.id,
			updates,
		}));

	const fontSizeDisplay = isEditingFontSize.current
		? fontSizeDraft.current
		: element.fontSize.toString();
	const opacityDisplay = isEditingOpacity.current
		? opacityDraft.current
		: Math.round(opacityProp.resolvedValue * 100).toString();
	const contentDisplay = isEditingContent.current
		? contentDraft.current
		: element.content;

	const lastSelectedColor = useRef(DEFAULT_COLOR);
	const initialFontSizeRef = useRef<number | null>(null);
	const initialOpacityRef = useRef<number | null>(null);
	const initialContentRef = useRef<string | null>(null);
	const initialColorRef = useRef<string | null>(null);
	const initialBgColorRef = useRef<string | null>(null);
	const initialPosXRef = useRef<number | null>(null);
	const initialPosYRef = useRef<number | null>(null);
	const initialScaleRef = useRef<number | null>(null);
	const initialRotationRef = useRef<number | null>(null);
	const initialStrokeRef = useRef<TextStroke | null>(null);
	const initialShadowRef = useRef<TextShadow | null>(null);
	const initialStrokeColorRef = useRef<string | null>(null);
	const initialShadowColorRef = useRef<string | null>(null);
	const initialBgOpacityRef = useRef<number | null>(null);
	const initialBgBorderRadiusRef = useRef<number | null>(null);
	const initialBgPaddingXRef = useRef<number | null>(null);
	const initialBgPaddingYRef = useRef<number | null>(null);

	const scalePercent = Math.round(scaleProp.resolvedValue * 100);
	const posXDisplay = isEditingPosX.current
		? posXDraft.current
		: Math.round(posX.resolvedValue).toString();
	const posYDisplay = isEditingPosY.current
		? posYDraft.current
		: Math.round(posY.resolvedValue).toString();
	const scaleDisplay = isEditingScale.current
		? scaleDraft.current
		: scalePercent.toString();
	const rotationDisplay = isEditingRotation.current
		? rotationDraft.current
		: Math.round(rotateProp.resolvedValue).toString();

	const updateTransform = ({
		updates: transformUpdates,
		pushHistory = true,
	}: {
		updates: Partial<Transform>;
		pushHistory?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: elementRefs.map((ref) => ({
				trackId: ref.trackId,
				elementId: ref.element.id,
				updates: {
					transform: { ...ref.element.transform, ...transformUpdates },
				},
			})),
			pushHistory,
		});
	};

	const strokeEnabled = !!element.stroke;
	const currentStroke: TextStroke = element.stroke ?? {
		color: "#000000",
		width: 2,
	};
	const shadowEnabled = !!element.shadow;
	const currentShadow: TextShadow = element.shadow ?? {
		color: "#000000",
		offsetX: 2,
		offsetY: 2,
		blur: 4,
	};
	const backgroundEnabled =
		element.backgroundColor !== "transparent" && element.backgroundColor !== "";

	const updateStroke = ({
		stroke,
		pushHistory = true,
	}: {
		stroke: TextStroke | undefined;
		pushHistory?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: buildBatchUpdates({ stroke }),
			pushHistory,
		});
	};

	const updateShadow = ({
		shadow,
		pushHistory = true,
	}: {
		shadow: TextShadow | undefined;
		pushHistory?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: buildBatchUpdates({ shadow }),
			pushHistory,
		});
	};

	const [isSavingPreset, setIsSavingPreset] = useState(false);
	const [presetNameDraft, setPresetNameDraft] = useState("");
	const {
		presets: customPresets,
		savePreset,
		deletePreset,
	} = useCustomTextPresetsStore();

	const isSub = isSubtitleTextElement(element);
	const speakerInfo = getElementSpeakerInfo(element);

	const handleSavePreset = () => {
		const name = presetNameDraft.trim();
		const saved = savePreset({
			name: name || `Mẫu ${customPresets.length + 1}`,
			element,
		});
		toast.success(`Đã lưu phong cách thành mẫu "${saved.name}"!`);
		setIsSavingPreset(false);
		setPresetNameDraft("");
	};

	const handleFontSizeChange = ({ value }: { value: string }) => {
		fontSizeDraft.current = value;
		forceRender();

		if (value.trim() !== "") {
			if (initialFontSizeRef.current === null) {
				initialFontSizeRef.current = element.fontSize;
			}
			const parsed = parseInt(value, 10);
			const fontSize = Number.isNaN(parsed)
				? element.fontSize
				: clamp({ value: parsed, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE });
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ fontSize }),
				pushHistory: false,
			});
		}
	};

	const handleFontSizeBlur = () => {
		if (initialFontSizeRef.current !== null) {
			const parsed = parseInt(fontSizeDraft.current, 10);
			const fontSize = Number.isNaN(parsed)
				? element.fontSize
				: clamp({ value: parsed, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE });
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ fontSize: initialFontSizeRef.current }),
				pushHistory: false,
			});
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ fontSize }),
				pushHistory: true,
			});
			initialFontSizeRef.current = null;
		}
		isEditingFontSize.current = false;
		fontSizeDraft.current = "";
		forceRender();
	};

	const handleOpacityChange = ({ value }: { value: string }) => {
		opacityDraft.current = value;
		forceRender();

		if (value.trim() !== "") {
			if (initialOpacityRef.current === null) {
				initialOpacityRef.current = opacityProp.resolvedValue;
			}
			const parsed = parseInt(value, 10);
			const opacityPercent = Number.isNaN(parsed)
				? Math.round(opacityProp.resolvedValue * 100)
				: clamp({ value: parsed, min: 0, max: 100 });
			opacityWriter.commitValue(opacityPercent / 100, false, () =>
				editor.timeline.updateElements({
					updates: buildBatchUpdates({ opacity: opacityPercent / 100 }),
					pushHistory: false,
				}),
			);
		}
	};

	const handleOpacityBlur = () => {
		if (initialOpacityRef.current !== null) {
			const initial = initialOpacityRef.current;
			const parsed = parseInt(opacityDraft.current, 10);
			const opacityPercent = Number.isNaN(parsed)
				? Math.round(opacityProp.resolvedValue * 100)
				: clamp({ value: parsed, min: 0, max: 100 });
			opacityWriter.commitValue(initial, false, () =>
				editor.timeline.updateElements({
					updates: buildBatchUpdates({ opacity: initial }),
					pushHistory: false,
				}),
			);
			opacityWriter.commitValue(opacityPercent / 100, true, () =>
				editor.timeline.updateElements({
					updates: buildBatchUpdates({ opacity: opacityPercent / 100 }),
					pushHistory: true,
				}),
			);
			initialOpacityRef.current = null;
		}
		isEditingOpacity.current = false;
		opacityDraft.current = "";
		forceRender();
	};

	const handleColorChange = ({ color }: { color: string }) => {
		if (color !== "transparent") {
			lastSelectedColor.current = color;
		}
		if (initialBgColorRef.current === null) {
			initialBgColorRef.current = element.backgroundColor;
		}
		if (initialBgColorRef.current !== null) {
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ backgroundColor: color }),
				pushHistory: false,
			});
		} else {
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ backgroundColor: color }),
			});
		}
	};

	const handleColorChangeEnd = ({ color }: { color: string }) => {
		if (initialBgColorRef.current !== null) {
			editor.timeline.updateElements({
				updates: buildBatchUpdates({
					backgroundColor: initialBgColorRef.current,
				}),
				pushHistory: false,
			});
			editor.timeline.updateElements({
				updates: buildBatchUpdates({ backgroundColor: `#${color}` }),
				pushHistory: true,
			});
			initialBgColorRef.current = null;
		}
	};

	return (
		<div className="flex h-full flex-col" ref={containerRef}>
			<Tabs defaultValue="style" className="flex h-full flex-col">
				<TabsList className="border-b px-3 py-2">
					<TabsTrigger value="style">{t("Style")}</TabsTrigger>
					<TabsTrigger value="animation">{t("Animation")}</TabsTrigger>
					<TabsTrigger value="speech">{t("Speech")}</TabsTrigger>
					<TabsTrigger value="ocr">Quét OCR</TabsTrigger>
				</TabsList>
				<TabsContent value="style" className="mt-0 flex-1 overflow-auto">
					<PanelBaseView className="p-0">
						{/* Đồng bộ phong cách phụ đề (Đưa lên trên cùng để tiện thao tác) */}
						<div className="border-b bg-muted/25 px-3 py-2.5 space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
									<HugeiconsIcon icon={SparklesIcon} className="size-3.5 text-primary" />
									Đồng bộ phong cách
								</span>
								{speakerInfo.speakerName || speakerInfo.speakerId ? (
									<span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
										Vai: {speakerInfo.speakerName || speakerInfo.speakerId}
									</span>
								) : null}
							</div>

							<div className="grid grid-cols-1 gap-1.5">
								{speakerInfo.speakerName || speakerInfo.speakerId ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											const res = syncSubtitleStyles({
												editor,
												sourceElement: element,
												scope: "speaker",
												targetSpeakerId: speakerInfo.speakerId,
												targetSpeakerName: speakerInfo.speakerName,
											});
											toast.success(
												`Đã đồng bộ phong cách cho ${res.updatedCount} câu phụ đề thuộc phân vai [${res.speakerName}]!`,
											);
										}}
										className="h-7.5 w-full justify-start gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer shadow-2xs"
									>
										<HugeiconsIcon icon={UserIcon} className="size-3.5" />
										<span>
											⚡ Đồng bộ cho phân vai [{speakerInfo.speakerName || speakerInfo.speakerId}]
										</span>
									</Button>
								) : null}

								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										const res = syncSubtitleStyles({
											editor,
											sourceElement: element,
											scope: "all",
										});
										toast.success(
											`Đã đồng bộ phong cách cho toàn bộ ${res.updatedCount} câu phụ đề trên Timeline!`,
										);
									}}
									className="h-7.5 w-full justify-start gap-1.5 border-primary/40 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 cursor-pointer shadow-2xs"
								>
									<HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
									<span>🌐 Đồng bộ cho TẤT CẢ phụ đề</span>
								</Button>
							</div>
						</div>

						<PropertyGroup
							title={t("Content")}
							hasBorderTop={false}
							collapsible={false}
						>
							<Textarea
								placeholder="Name"
								value={contentDisplay}
								className="bg-accent min-h-20"
								onFocus={() => {
									isEditingContent.current = true;
									contentDraft.current = element.content;
									initialContentRef.current = element.content;
									forceRender();
								}}
								onChange={(event) => {
									contentDraft.current = event.target.value;
									forceRender();
									if (initialContentRef.current === null) {
										initialContentRef.current = element.content;
									}
									editor.timeline.updateElements({
										updates: buildBatchUpdates({
											content: event.target.value,
										}),
										pushHistory: false,
									});
								}}
								onBlur={() => {
									if (initialContentRef.current !== null) {
										const finalContent = contentDraft.current;
										editor.timeline.updateElements({
											updates: buildBatchUpdates({
												content: initialContentRef.current,
											}),
											pushHistory: false,
										});
										editor.timeline.updateElements({
											updates: buildBatchUpdates({
												content: finalContent,
											}),
											pushHistory: true,
										});
										initialContentRef.current = null;
									}
									isEditingContent.current = false;
									contentDraft.current = "";
									forceRender();
								}}
							/>
						</PropertyGroup>
						<PropertyGroup title={t("Typography")} collapsible={false}>
							<div className="space-y-6">
								<PropertyItem direction="column">
									<PropertyItemLabel>{t("Font")}</PropertyItemLabel>
									<PropertyItemValue>
										<FontPicker
											value={element.fontFamily}
											defaultValue={element.fontFamily}
											onValueChange={(value: FontFamily) =>
												editor.timeline.updateElements({
													updates: buildBatchUpdates({
														fontFamily: value,
													}),
												})
											}
										/>
									</PropertyItemValue>
								</PropertyItem>
								<PropertyItem direction="column">
									<PropertyItemLabel>{t("Style")}</PropertyItemLabel>
									<PropertyItemValue>
										<div className="flex items-center gap-2">
											<Button
												variant={
													element.fontWeight === "bold" ? "default" : "outline"
												}
												size="sm"
												onClick={() =>
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															fontWeight:
																element.fontWeight === "bold"
																	? "normal"
																	: "bold",
														}),
													})
												}
												className="h-8 px-3 font-bold"
											>
												B
											</Button>
											<Button
												variant={
													element.fontStyle === "italic" ? "default" : "outline"
												}
												size="sm"
												onClick={() =>
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															fontStyle:
																element.fontStyle === "italic"
																	? "normal"
																	: "italic",
														}),
													})
												}
												className="h-8 px-3 italic"
											>
												I
											</Button>
											<Button
												variant={
													element.textDecoration === "underline"
														? "default"
														: "outline"
												}
												size="sm"
												onClick={() =>
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															textDecoration:
																element.textDecoration === "underline"
																	? "none"
																	: "underline",
														}),
													})
												}
												className="h-8 px-3 underline"
											>
												U
											</Button>
											<Button
												variant={
													element.textDecoration === "line-through"
														? "default"
														: "outline"
												}
												size="sm"
												onClick={() =>
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															textDecoration:
																element.textDecoration === "line-through"
																	? "none"
																	: "line-through",
														}),
													})
												}
												className="h-8 px-3 line-through"
											>
												S
											</Button>
										</div>
									</PropertyItemValue>
								</PropertyItem>
								<PropertyItem direction="column">
									<PropertyItemLabel>{t("Font size")}</PropertyItemLabel>
									<PropertyItemValue>
										<div className="flex items-center gap-2">
											<Slider
												value={[element.fontSize]}
												min={MIN_FONT_SIZE}
												max={MAX_FONT_SIZE}
												step={1}
												onValueChange={([value]) => {
													if (initialFontSizeRef.current === null) {
														initialFontSizeRef.current = element.fontSize;
													}
													editor.timeline.updateElements({
														updates: buildBatchUpdates({ fontSize: value }),
														pushHistory: false,
													});
												}}
												onValueCommit={([value]) => {
													if (initialFontSizeRef.current !== null) {
														editor.timeline.updateElements({
															updates: buildBatchUpdates({
																fontSize: initialFontSizeRef.current,
															}),
															pushHistory: false,
														});
														editor.timeline.updateElements({
															updates: buildBatchUpdates({ fontSize: value }),
															pushHistory: true,
														});
														initialFontSizeRef.current = null;
													}
												}}
												className="w-full"
											/>
											<Input
												type="number"
												value={fontSizeDisplay}
												min={MIN_FONT_SIZE}
												max={MAX_FONT_SIZE}
												onFocus={() => {
													isEditingFontSize.current = true;
													fontSizeDraft.current = element.fontSize.toString();
													forceRender();
												}}
												onChange={(e) =>
													handleFontSizeChange({ value: e.target.value })
												}
												onBlur={handleFontSizeBlur}
												className="bg-accent h-7 w-12 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
											/>
										</div>
									</PropertyItemValue>
								</PropertyItem>
								<PropertyItem direction="column">
									<div className="flex items-center justify-between">
										<PropertyItemLabel>Độ rộng khung (Tự xuống dòng)</PropertyItemLabel>
										<span className="font-mono text-[9px] text-muted-foreground">
											{element.boxWidth && element.boxWidth > 0
												? `${Math.round(element.boxWidth)}%`
												: "1 dòng"}
										</span>
									</div>
									<PropertyItemValue>
										<div className="flex items-center gap-2">
											<Slider
												value={[
													element.boxWidth && element.boxWidth > 0
														? element.boxWidth
														: 75,
												]}
												min={30}
												max={95}
												step={1}
												onValueChange={([value]) => {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({ boxWidth: value }),
														pushHistory: false,
													});
												}}
												onValueCommit={([value]) => {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({ boxWidth: value }),
														pushHistory: true,
													});
												}}
												className="w-full"
											/>
											<Input
												type="number"
												value={
													element.boxWidth && element.boxWidth > 0
														? Math.round(element.boxWidth)
														: 75
												}
												min={30}
												max={95}
												onChange={(e) => {
													const val = parseInt(e.target.value, 10);
													if (!Number.isNaN(val)) {
														editor.timeline.updateElements({
															updates: buildBatchUpdates({
																boxWidth: clamp({
																	value: val,
																	min: 20,
																	max: 95,
																}),
															}),
															pushHistory: true,
														});
													}
												}}
												className="bg-accent h-7 w-12 [appearance:textfield] rounded-sm px-2 text-center font-mono !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
											/>
										</div>
									</PropertyItemValue>
								</PropertyItem>
							</div>
						</PropertyGroup>
						<PropertyGroup title={t("Presets")} collapsible={false}>
							<div className="space-y-3">
								<div>
									<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Mẫu có sẵn</p>
									<div className="flex flex-wrap gap-1.5">
										{TEXT_STYLE_PRESETS.map((preset) => (
											<PresetButton
												key={preset.id}
												preset={preset}
												onClick={() => {
													const hasBg =
														preset.styles.backgroundColor &&
														preset.styles.backgroundColor !== "transparent";
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															color: preset.styles.color ?? "#ffffff",
															backgroundColor:
																preset.styles.backgroundColor ?? "transparent",
															stroke: preset.styles.stroke,
															shadow: preset.styles.shadow,
															...(hasBg
																? {
																		backgroundBorderRadius:
																			preset.styles.backgroundBorderRadius ?? 6,
																		backgroundPaddingX:
																			preset.styles.backgroundPaddingX ?? 6,
																		backgroundPaddingY:
																			preset.styles.backgroundPaddingY ?? 3,
																	}
																: {}),
															...(preset.styles.fontWeight
																? { fontWeight: preset.styles.fontWeight }
																: {}),
														}),
													});
												}}
											/>
										))}
									</div>
								</div>

								{customPresets.length > 0 && (
									<div>
										<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
											Mẫu của bạn ({customPresets.length})
										</p>
										<div className="flex flex-wrap gap-1.5">
											{customPresets.map((preset) => (
												<PresetButton
													key={preset.id}
													preset={preset}
													isCustom={true}
													onDelete={() => {
														deletePreset(preset.id);
														toast.success(`Đã xóa preset "${preset.name}".`);
													}}
													onClick={() => {
														editor.timeline.updateElements({
															updates: buildBatchUpdates({
																...preset.styles,
																...(preset.styles.positionY !== undefined
																	? {
																			transform: {
																				...element.transform,
																				position: {
																					...element.transform.position,
																					y: preset.styles.positionY,
																				},
																			},
																		}
																	: {}),
															}),
														});
													}}
												/>
											))}
										</div>
									</div>
								)}

								<div className="pt-0.5">
									{isSavingPreset ? (
										<div className="flex items-center gap-1.5 rounded-md border bg-muted/40 p-1.5">
											<Input
												value={presetNameDraft}
												onChange={(e) => setPresetNameDraft(e.target.value)}
												placeholder="Đặt tên cho mẫu..."
												className="h-6 flex-1 text-xs"
												autoFocus
												onKeyDown={(e) => {
													if (e.key === "Enter") handleSavePreset();
													if (e.key === "Escape") {
														setIsSavingPreset(false);
														setPresetNameDraft("");
													}
												}}
											/>
											<Button
												type="button"
												size="sm"
												className="h-6 px-2 text-[10px] font-bold"
												onClick={handleSavePreset}
											>
												Lưu
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-6 px-2 text-[10px]"
												onClick={() => {
													setIsSavingPreset(false);
													setPresetNameDraft("");
												}}
											>
												Hủy
											</Button>
										</div>
									) : (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												setIsSavingPreset(true);
												setPresetNameDraft(`Mẫu ${customPresets.length + 1}`);
											}}
											className="h-7 w-full gap-1.5 text-[11px] font-medium hover:border-primary/50"
										>
											<HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
											<span>Lưu phong cách hiện tại thành Preset</span>
										</Button>
									)}
								</div>
							</div>
						</PropertyGroup>
						<PropertyGroup title={t("Appearance")} collapsible={false}>
							<div className="space-y-6">
								<PropertyItem direction="column">
									<PropertyItemLabel>{t("Color")}</PropertyItemLabel>
									<PropertyItemValue>
										<ColorPicker
											value={uppercase({
												string: (element.color || "FFFFFF").replace("#", ""),
											})}
											onChange={(color) => {
												if (initialColorRef.current === null) {
													initialColorRef.current = element.color || "#FFFFFF";
												}
												if (initialColorRef.current !== null) {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															color: `#${color}`,
														}),
														pushHistory: false,
													});
												} else {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															color: `#${color}`,
														}),
													});
												}
											}}
											onChangeEnd={(color) => {
												if (initialColorRef.current !== null) {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															color: initialColorRef.current,
														}),
														pushHistory: false,
													});
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															color: `#${color}`,
														}),
														pushHistory: true,
													});
													initialColorRef.current = null;
												}
											}}
											containerRef={containerRef}
										/>
									</PropertyItemValue>
								</PropertyItem>
								<PropertyItem direction="column">
									<PropertyItemLabel className="flex items-center gap-1.5">
										{t("Opacity")}
										<KeyframeRow
											property="opacity"
											trackId={elementRefs[0].trackId}
											elementId={element.id}
											keyframes={element.keyframes}
											baseTransform={element.transform}
											baseOpacity={element.opacity}
											elementStartTime={element.startTime}
											elementDuration={element.duration}
										/>
									</PropertyItemLabel>
									<PropertyItemValue>
										<div className="flex items-center gap-2">
											<Slider
												value={[opacityProp.resolvedValue * 100]}
												min={0}
												max={100}
												step={1}
												onValueChange={([value]) => {
													if (initialOpacityRef.current === null) {
														initialOpacityRef.current = opacityProp.resolvedValue;
													}
													opacityWriter.commitValue(value / 100, false, () =>
														editor.timeline.updateElements({
															updates: buildBatchUpdates({
																opacity: value / 100,
															}),
															pushHistory: false,
														}),
													);
												}}
												onValueCommit={([value]) => {
													if (initialOpacityRef.current !== null) {
														const initial = initialOpacityRef.current;
														opacityWriter.commitValue(initial, false, () =>
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	opacity: initial,
																}),
																pushHistory: false,
															}),
														);
														opacityWriter.commitValue(value / 100, true, () =>
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	opacity: value / 100,
																}),
																pushHistory: true,
															}),
														);
														initialOpacityRef.current = null;
													}
												}}
												className="w-full"
											/>
											<Input
												type="number"
												value={opacityDisplay}
												min={0}
												max={100}
												onFocus={() => {
													isEditingOpacity.current = true;
													opacityDraft.current = Math.round(
														opacityProp.resolvedValue * 100,
													).toString();
													forceRender();
												}}
												onChange={(e) =>
													handleOpacityChange({ value: e.target.value })
												}
												onBlur={handleOpacityBlur}
												className="bg-accent h-7 w-12 [appearance:textfield] rounded-sm text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
											/>
										</div>
									</PropertyItemValue>
								</PropertyItem>
							</div>
						</PropertyGroup>
						<PropertyGroup
							title={t("Background")}
							defaultExpanded={backgroundEnabled}
						>
							<div className="space-y-6">
								<PropertyItem>
									<PropertyItemLabel>{t("Enable")}</PropertyItemLabel>
									<PropertyItemValue>
										<Switch
											checked={backgroundEnabled}
											onCheckedChange={(checked) => {
												if (checked) {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															backgroundColor: lastSelectedColor.current,
														}),
													});
												} else {
													editor.timeline.updateElements({
														updates: buildBatchUpdates({
															backgroundColor: "transparent",
														}),
													});
												}
											}}
										/>
									</PropertyItemValue>
								</PropertyItem>
								{backgroundEnabled && (
									<>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Color")}</PropertyItemLabel>
											<PropertyItemValue>
												<ColorPicker
													value={element.backgroundColor.replace("#", "")}
													onChange={(color) =>
														handleColorChange({ color: `#${color}` })
													}
													onChangeEnd={(color) =>
														handleColorChangeEnd({ color })
													}
													containerRef={containerRef}
												/>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Opacity")}</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[
															Math.round(
																(element.backgroundOpacity ?? 1) * 100,
															),
														]}
														min={0}
														max={100}
														step={1}
														onValueChange={([value]) => {
															if (initialBgOpacityRef.current === null) {
																initialBgOpacityRef.current =
																	element.backgroundOpacity ?? 1;
															}
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	backgroundOpacity: value / 100,
																}),
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialBgOpacityRef.current !== null) {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundOpacity:
																			initialBgOpacityRef.current,
																	}),
																	pushHistory: false,
																});
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundOpacity: value / 100,
																	}),
																	pushHistory: true,
																});
																initialBgOpacityRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs">
														{Math.round((element.backgroundOpacity ?? 1) * 100)}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<div className="flex items-center justify-between">
												<PropertyItemLabel>
													Độ phủ nền (Vừa chữ ➔ Full khung)
												</PropertyItemLabel>
												<span className="font-mono text-[10px] font-semibold text-primary">
													{typeof element.backgroundWidthRatio === "number"
														? `${Math.round(element.backgroundWidthRatio)}%`
														: element.backgroundWidthMode === "full"
															? "100% (Full)"
															: "0% (Vừa chữ)"}
												</span>
											</div>
											<PropertyItemValue>
												<div className="space-y-2 pt-1">
													<div className="flex items-center gap-2">
														<Slider
															value={[
																typeof element.backgroundWidthRatio === "number"
																	? element.backgroundWidthRatio
																	: element.backgroundWidthMode === "full"
																		? 100
																		: 0,
															]}
															min={0}
															max={100}
															step={1}
															onValueChange={([value]) => {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundWidthRatio: value,
																		backgroundWidthMode:
																			value >= 100 ? "full" : "auto",
																	}),
																	pushHistory: false,
																});
															}}
															onValueCommit={([value]) => {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundWidthRatio: value,
																		backgroundWidthMode:
																			value >= 100 ? "full" : "auto",
																	}),
																	pushHistory: true,
																});
															}}
															className="w-full"
														/>
														<span className="w-9 text-center font-mono text-xs text-muted-foreground">
															{typeof element.backgroundWidthRatio === "number"
																? `${Math.round(element.backgroundWidthRatio)}%`
																: element.backgroundWidthMode === "full"
																	? "100%"
																	: "0%"}
														</span>
													</div>
													<div className="grid grid-cols-3 gap-1">
														<Button
															type="button"
															variant={
																element.backgroundWidthRatio === 0 ||
																(element.backgroundWidthRatio === undefined &&
																	element.backgroundWidthMode !== "full")
																	? "default"
																	: "outline"
															}
															size="sm"
															onClick={() => {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundWidthRatio: 0,
																		backgroundWidthMode: "auto",
																	}),
																});
															}}
															className="h-6.5 text-[10px] font-medium cursor-pointer"
														>
															✨ Vừa chữ (0%)
														</Button>
														<Button
															type="button"
															variant={
																element.backgroundWidthRatio === 50
																	? "default"
																	: "outline"
															}
															size="sm"
															onClick={() => {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundWidthRatio: 50,
																		backgroundWidthMode: "auto",
																	}),
																});
															}}
															className="h-6.5 text-[10px] font-medium cursor-pointer"
														>
															⚖️ Giữa (50%)
														</Button>
														<Button
															type="button"
															variant={
																element.backgroundWidthRatio === 100 ||
																(element.backgroundWidthRatio === undefined &&
																	element.backgroundWidthMode === "full")
																	? "default"
																	: "outline"
															}
															size="sm"
															onClick={() => {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundWidthRatio: 100,
																		backgroundWidthMode: "full",
																	}),
																});
															}}
															className="h-6.5 text-[10px] font-medium cursor-pointer"
														>
															📏 Full (100%)
														</Button>
													</div>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>
												{t("Border Radius")} (Bo góc)
											</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[element.backgroundBorderRadius ?? 0]}
														min={0}
														max={50}
														step={1}
														onValueChange={([value]) => {
															if (initialBgBorderRadiusRef.current === null) {
																initialBgBorderRadiusRef.current =
																	element.backgroundBorderRadius ?? 0;
															}
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	backgroundBorderRadius: value,
																}),
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialBgBorderRadiusRef.current !== null) {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundBorderRadius:
																			initialBgBorderRadiusRef.current,
																	}),
																	pushHistory: false,
																});
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundBorderRadius: value,
																	}),
																	pushHistory: true,
																});
																initialBgBorderRadiusRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs font-mono">
														{element.backgroundBorderRadius ?? 0}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>Đệm trên / dưới (Padding Y)</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[element.backgroundPaddingY ?? 4]}
														min={0}
														max={50}
														step={1}
														onValueChange={([value]) => {
															if (initialBgPaddingYRef.current === null) {
																initialBgPaddingYRef.current =
																	element.backgroundPaddingY ?? 4;
															}
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	backgroundPaddingY: value,
																}),
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialBgPaddingYRef.current !== null) {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundPaddingY:
																			initialBgPaddingYRef.current,
																	}),
																	pushHistory: false,
																});
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundPaddingY: value,
																	}),
																	pushHistory: true,
																});
																initialBgPaddingYRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs font-mono">
														{element.backgroundPaddingY ?? 4}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>Đệm trái / phải (Padding X)</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[element.backgroundPaddingX ?? 8]}
														min={0}
														max={50}
														step={1}
														onValueChange={([value]) => {
															if (initialBgPaddingXRef.current === null) {
																initialBgPaddingXRef.current =
																	element.backgroundPaddingX ?? 8;
															}
															editor.timeline.updateElements({
																updates: buildBatchUpdates({
																	backgroundPaddingX: value,
																}),
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialBgPaddingXRef.current !== null) {
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundPaddingX:
																			initialBgPaddingXRef.current,
																	}),
																	pushHistory: false,
																});
																editor.timeline.updateElements({
																	updates: buildBatchUpdates({
																		backgroundPaddingX: value,
																	}),
																	pushHistory: true,
																});
																initialBgPaddingXRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs font-mono">
														{element.backgroundPaddingX ?? 8}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
									</>
								)}
							</div>
						</PropertyGroup>
						<PropertyGroup title={t("Stroke")} defaultExpanded={strokeEnabled}>
							<div className="space-y-6">
								<PropertyItem>
									<PropertyItemLabel>{t("Enable")}</PropertyItemLabel>
									<PropertyItemValue>
										<Switch
											checked={strokeEnabled}
											onCheckedChange={(checked) => {
												updateStroke({
													stroke: checked
														? { color: "#000000", width: 2 }
														: undefined,
												});
											}}
										/>
									</PropertyItemValue>
								</PropertyItem>
								{strokeEnabled && (
									<>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Color")}</PropertyItemLabel>
											<PropertyItemValue>
												<ColorPicker
													value={uppercase({
														string: currentStroke.color.replace("#", ""),
													})}
													onChange={(color) => {
														if (initialStrokeColorRef.current === null) {
															initialStrokeColorRef.current =
																currentStroke.color;
														}
														updateStroke({
															stroke: { ...currentStroke, color: `#${color}` },
															pushHistory: false,
														});
													}}
													onChangeEnd={(color) => {
														if (initialStrokeColorRef.current !== null) {
															updateStroke({
																stroke: {
																	...currentStroke,
																	color: initialStrokeColorRef.current,
																},
																pushHistory: false,
															});
															updateStroke({
																stroke: {
																	...currentStroke,
																	color: `#${color}`,
																},
															});
															initialStrokeColorRef.current = null;
														}
													}}
													containerRef={containerRef}
												/>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Width")}</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[currentStroke.width]}
														min={1}
														max={20}
														step={1}
														onValueChange={([value]) => {
															if (initialStrokeRef.current === null) {
																initialStrokeRef.current = { ...currentStroke };
															}
															updateStroke({
																stroke: { ...currentStroke, width: value },
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialStrokeRef.current !== null) {
																updateStroke({
																	stroke: initialStrokeRef.current,
																	pushHistory: false,
																});
																updateStroke({
																	stroke: { ...currentStroke, width: value },
																});
																initialStrokeRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs">
														{currentStroke.width}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
									</>
								)}
							</div>
						</PropertyGroup>
						<PropertyGroup title={t("Shadow")} defaultExpanded={shadowEnabled}>
							<div className="space-y-6">
								<PropertyItem>
									<PropertyItemLabel>{t("Enable")}</PropertyItemLabel>
									<PropertyItemValue>
										<Switch
											checked={shadowEnabled}
											onCheckedChange={(checked) => {
												updateShadow({
													shadow: checked
														? {
																color: "#000000",
																offsetX: 2,
																offsetY: 2,
																blur: 4,
															}
														: undefined,
												});
											}}
										/>
									</PropertyItemValue>
								</PropertyItem>
								{shadowEnabled && (
									<>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Color")}</PropertyItemLabel>
											<PropertyItemValue>
												<ColorPicker
													value={uppercase({
														string: currentShadow.color.replace("#", ""),
													})}
													onChange={(color) => {
														if (initialShadowColorRef.current === null) {
															initialShadowColorRef.current =
																currentShadow.color;
														}
														updateShadow({
															shadow: { ...currentShadow, color: `#${color}` },
															pushHistory: false,
														});
													}}
													onChangeEnd={(color) => {
														if (initialShadowColorRef.current !== null) {
															updateShadow({
																shadow: {
																	...currentShadow,
																	color: initialShadowColorRef.current,
																},
																pushHistory: false,
															});
															updateShadow({
																shadow: {
																	...currentShadow,
																	color: `#${color}`,
																},
															});
															initialShadowColorRef.current = null;
														}
													}}
													containerRef={containerRef}
												/>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Offset X")}</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[currentShadow.offsetX]}
														min={-20}
														max={20}
														step={1}
														onValueChange={([value]) => {
															if (initialShadowRef.current === null) {
																initialShadowRef.current = { ...currentShadow };
															}
															updateShadow({
																shadow: { ...currentShadow, offsetX: value },
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialShadowRef.current !== null) {
																updateShadow({
																	shadow: initialShadowRef.current,
																	pushHistory: false,
																});
																updateShadow({
																	shadow: { ...currentShadow, offsetX: value },
																});
																initialShadowRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs">
														{currentShadow.offsetX}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Offset Y")}</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[currentShadow.offsetY]}
														min={-20}
														max={20}
														step={1}
														onValueChange={([value]) => {
															if (initialShadowRef.current === null) {
																initialShadowRef.current = { ...currentShadow };
															}
															updateShadow({
																shadow: { ...currentShadow, offsetY: value },
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialShadowRef.current !== null) {
																updateShadow({
																	shadow: initialShadowRef.current,
																	pushHistory: false,
																});
																updateShadow({
																	shadow: { ...currentShadow, offsetY: value },
																});
																initialShadowRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs">
														{currentShadow.offsetY}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
										<PropertyItem direction="column">
											<PropertyItemLabel>{t("Blur")}</PropertyItemLabel>
											<PropertyItemValue>
												<div className="flex items-center gap-2">
													<Slider
														value={[currentShadow.blur]}
														min={0}
														max={30}
														step={1}
														onValueChange={([value]) => {
															if (initialShadowRef.current === null) {
																initialShadowRef.current = { ...currentShadow };
															}
															updateShadow({
																shadow: { ...currentShadow, blur: value },
																pushHistory: false,
															});
														}}
														onValueCommit={([value]) => {
															if (initialShadowRef.current !== null) {
																updateShadow({
																	shadow: initialShadowRef.current,
																	pushHistory: false,
																});
																updateShadow({
																	shadow: { ...currentShadow, blur: value },
																});
																initialShadowRef.current = null;
															}
														}}
														className="w-full"
													/>
													<span className="text-muted-foreground w-8 text-center text-xs">
														{currentShadow.blur}
													</span>
												</div>
											</PropertyItemValue>
										</PropertyItem>
									</>
								)}
							</div>
						</PropertyGroup>
						<PropertyGroup title={t("Transform")}>
							<div className="space-y-6">
								<PropertyItem>
									<PropertyItemLabel className="flex items-center gap-1.5">
										{t("Position X")}
										<KeyframeRow
											property="position.x"
											trackId={elementRefs[0].trackId}
											elementId={element.id}
											keyframes={element.keyframes}
											baseTransform={element.transform}
											baseOpacity={element.opacity}
											elementStartTime={element.startTime}
											elementDuration={element.duration}
										/>
									</PropertyItemLabel>
									<PropertyItemValue>
										<Input
											type="number"
											value={posXDisplay}
											onFocus={() => {
												isEditingPosX.current = true;
												posXDraft.current = Math.round(
													posX.resolvedValue,
												).toString();
												forceRender();
											}}
											onChange={(e) => {
												posXDraft.current = e.target.value;
												forceRender();
												if (initialPosXRef.current === null) {
													initialPosXRef.current = posX.resolvedValue;
												}
												const parsed = Number.parseFloat(e.target.value);
												if (!Number.isNaN(parsed)) {
													posXWriter.commitValue(parsed, false, () =>
														updateTransform({
															updates: {
																position: {
																	...element.transform.position,
																	x: parsed,
																},
															},
															pushHistory: false,
														}),
													);
												}
											}}
											onBlur={() => {
												if (initialPosXRef.current !== null) {
													const initial = initialPosXRef.current;
													const parsed = Number.parseFloat(posXDraft.current);
													const value = Number.isNaN(parsed)
														? posX.resolvedValue
														: parsed;
													posXWriter.commitValue(initial, false, () =>
														updateTransform({
															updates: {
																position: {
																	...element.transform.position,
																	x: initial,
																},
															},
															pushHistory: false,
														}),
													);
													posXWriter.commitValue(value, true, () =>
														updateTransform({
															updates: {
																position: {
																	...element.transform.position,
																	x: value,
																},
															},
															pushHistory: true,
														}),
													);
													initialPosXRef.current = null;
												}
												isEditingPosX.current = false;
												posXDraft.current = "";
												forceRender();
											}}
											className="bg-accent h-7 w-full [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
										/>
									</PropertyItemValue>
								</PropertyItem>
									<PropertyItem>
										<PropertyItemLabel className="flex items-center gap-1.5">
											{t("Position Y")}
											<KeyframeRow
												property="position.y"
												trackId={elementRefs[0].trackId}
												elementId={element.id}
												keyframes={element.keyframes}
												baseTransform={element.transform}
												baseOpacity={element.opacity}
												elementStartTime={element.startTime}
												elementDuration={element.duration}
											/>
										</PropertyItemLabel>
										<PropertyItemValue>
											<Input
												type="number"
												value={posYDisplay}
												onFocus={() => {
													isEditingPosY.current = true;
													posYDraft.current = Math.round(
														posY.resolvedValue,
													).toString();
													forceRender();
												}}
												onChange={(e) => {
													posYDraft.current = e.target.value;
													forceRender();
													if (initialPosYRef.current === null) {
														initialPosYRef.current = posY.resolvedValue;
													}
													const parsed = Number.parseFloat(e.target.value);
													if (!Number.isNaN(parsed)) {
														posYWriter.commitValue(parsed, false, () =>
															updateTransform({
																updates: {
																	position: {
																		...element.transform.position,
																		y: parsed,
																	},
																},
																pushHistory: false,
															}),
														);
													}
												}}
												onBlur={() => {
													if (initialPosYRef.current !== null) {
														const initial = initialPosYRef.current;
														const parsed = Number.parseFloat(posYDraft.current);
														const value = Number.isNaN(parsed)
															? posY.resolvedValue
															: parsed;
														posYWriter.commitValue(initial, false, () =>
															updateTransform({
																updates: {
																	position: {
																		...element.transform.position,
																		y: initial,
																	},
																},
																pushHistory: false,
															}),
														);
														posYWriter.commitValue(value, true, () =>
															updateTransform({
																updates: {
																	position: {
																		...element.transform.position,
																		y: value,
																	},
																},
																pushHistory: true,
															}),
														);
														initialPosYRef.current = null;
													}
													isEditingPosY.current = false;
													posYDraft.current = "";
													forceRender();
												}}
												className="bg-accent h-7 w-full [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
											/>
										</PropertyItemValue>
									</PropertyItem>
									<PropertyItem direction="column">
											<PropertyItemLabel className="flex items-center gap-1.5">
												{t("Scale")}
												<KeyframeRow
													property="scale"
													trackId={elementRefs[0].trackId}
													elementId={element.id}
													keyframes={element.keyframes}
													baseTransform={element.transform}
													baseOpacity={element.opacity}
													elementStartTime={element.startTime}
													elementDuration={element.duration}
												/>
											</PropertyItemLabel>
										<PropertyItemValue>
											<div className="flex items-center gap-2">
												<Slider
													value={[scalePercent]}
													min={10}
													max={500}
													step={1}
													onValueChange={([value]) => {
														if (initialScaleRef.current === null) {
															initialScaleRef.current = scaleProp.resolvedValue;
														}
														scaleWriter.commitValue(value / 100, false, () =>
															updateTransform({
																updates: { scale: value / 100 },
																pushHistory: false,
															}),
														);
													}}
													onValueCommit={([value]) => {
														if (initialScaleRef.current !== null) {
															const initial = initialScaleRef.current;
															scaleWriter.commitValue(initial, false, () =>
																updateTransform({
																	updates: { scale: initial },
																	pushHistory: false,
																}),
															);
															scaleWriter.commitValue(value / 100, true, () =>
																updateTransform({
																	updates: { scale: value / 100 },
																	pushHistory: true,
																}),
															);
															initialScaleRef.current = null;
														}
													}}
													className="w-full"
												/>
												<Input
													type="number"
													value={scaleDisplay}
													min={10}
													max={500}
													onFocus={() => {
														isEditingScale.current = true;
														scaleDraft.current = scalePercent.toString();
														forceRender();
													}}
													onChange={(e) => {
														scaleDraft.current = e.target.value;
														forceRender();
														if (initialScaleRef.current === null) {
															initialScaleRef.current = scaleProp.resolvedValue;
														}
														const parsed = parseInt(e.target.value, 10);
														if (!Number.isNaN(parsed)) {
															const clamped = clamp({
																value: parsed,
																min: 10,
																max: 500,
															});
															scaleWriter.commitValue(clamped / 100, false, () =>
																updateTransform({
																	updates: { scale: clamped / 100 },
																	pushHistory: false,
																}),
															);
														}
													}}
													onBlur={() => {
														if (initialScaleRef.current !== null) {
															const initial = initialScaleRef.current;
															const parsed = parseInt(scaleDraft.current, 10);
															const clamped = Number.isNaN(parsed)
																? scalePercent
																: clamp({ value: parsed, min: 10, max: 500 });
															scaleWriter.commitValue(initial, false, () =>
																updateTransform({
																	updates: { scale: initial },
																	pushHistory: false,
																}),
															);
															scaleWriter.commitValue(clamped / 100, true, () =>
																updateTransform({
																	updates: { scale: clamped / 100 },
																	pushHistory: true,
																}),
															);
															initialScaleRef.current = null;
														}
														isEditingScale.current = false;
														scaleDraft.current = "";
														forceRender();
													}}
													className="bg-accent h-7 w-14 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
												/>
											</div>
										</PropertyItemValue>
									</PropertyItem>
									<PropertyItem direction="column">
											<PropertyItemLabel className="flex items-center gap-1.5">
												{t("Rotation")}
												<KeyframeRow
													property="rotate"
													trackId={elementRefs[0].trackId}
													elementId={element.id}
													keyframes={element.keyframes}
													baseTransform={element.transform}
													baseOpacity={element.opacity}
													elementStartTime={element.startTime}
													elementDuration={element.duration}
												/>
											</PropertyItemLabel>
										<PropertyItemValue>
											<div className="flex items-center gap-2">
												<Slider
													value={[rotateProp.resolvedValue]}
													min={-180}
													max={180}
													step={1}
													onValueChange={([value]) => {
														if (initialRotationRef.current === null) {
															initialRotationRef.current = rotateProp.resolvedValue;
														}
														rotateWriter.commitValue(value, false, () =>
															updateTransform({
																updates: { rotate: value },
																pushHistory: false,
															}),
														);
													}}
													onValueCommit={([value]) => {
														if (initialRotationRef.current !== null) {
															const initial = initialRotationRef.current;
															rotateWriter.commitValue(initial, false, () =>
																updateTransform({
																	updates: { rotate: initial },
																	pushHistory: false,
																}),
															);
															rotateWriter.commitValue(value, true, () =>
																updateTransform({
																	updates: { rotate: value },
																	pushHistory: true,
																}),
															);
															initialRotationRef.current = null;
														}
													}}
													className="w-full"
												/>
												<Input
													type="number"
													value={rotationDisplay}
													min={-360}
													max={360}
													onFocus={() => {
														isEditingRotation.current = true;
														rotationDraft.current = Math.round(
															rotateProp.resolvedValue,
														).toString();
														forceRender();
													}}
													onChange={(e) => {
														rotationDraft.current = e.target.value;
														forceRender();
														if (initialRotationRef.current === null) {
															initialRotationRef.current = rotateProp.resolvedValue;
														}
														const parsed = Number.parseFloat(e.target.value);
														if (!Number.isNaN(parsed)) {
															rotateWriter.commitValue(parsed, false, () =>
																updateTransform({
																	updates: { rotate: parsed },
																	pushHistory: false,
																}),
															);
														}
													}}
													onBlur={() => {
														if (initialRotationRef.current !== null) {
															const initial = initialRotationRef.current;
															const parsed = Number.parseFloat(
																rotationDraft.current,
															);
															const value = Number.isNaN(parsed)
																? rotateProp.resolvedValue
																: parsed;
															rotateWriter.commitValue(initial, false, () =>
																updateTransform({
																	updates: { rotate: initial },
																	pushHistory: false,
																}),
															);
															rotateWriter.commitValue(value, true, () =>
																updateTransform({
																	updates: { rotate: value },
																	pushHistory: true,
																}),
															);
															initialRotationRef.current = null;
														}
														isEditingRotation.current = false;
														rotationDraft.current = "";
														forceRender();
													}}
													className="bg-accent h-7 w-14 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
												/>
											</div>
										</PropertyItemValue>
									</PropertyItem>
								</div>
							</PropertyGroup>
					</PanelBaseView>
				</TabsContent>
				<TabsContent value="animation" className="mt-0 flex-1 overflow-auto">
					<TextAnimationTab
						element={element}
						onChange={(textAnimations) =>
							editor.timeline.updateElements({
								updates: buildBatchUpdates({ textAnimations }),
								pushHistory: true,
							})
						}
					/>
				</TabsContent>
				<TabsContent value="speech" className="mt-0 flex-1 overflow-auto">
					<TextSpeechPanel elements={elementRefs} />
				</TabsContent>
				<TabsContent value="ocr" className="mt-0 flex-1 overflow-auto">
					<OriginalSubtitleScanTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PresetButton({
	preset,
	onClick,
	onDelete,
	isCustom,
}: {
	preset: TextStylePreset | CustomTextStylePreset;
	onClick: () => void;
	onDelete?: () => void;
	isCustom?: boolean;
}) {
	const { preview } = preset;
	const isClearAll = preset.id === "clear-all";

	const previewStyle: React.CSSProperties = isClearAll
		? {}
		: {
				color: preview.color,
				backgroundColor: preview.backgroundColor,
				fontWeight: 900,
				WebkitTextStroke: preview.stroke
					? `${Math.max(preview.stroke.width * 0.5, 0.75)}px ${preview.stroke.color}`
					: undefined,
				textShadow: preview.shadow
					? `${preview.shadow.offsetX}px ${preview.shadow.offsetY}px ${preview.shadow.blur}px ${preview.shadow.color}`
					: undefined,
			};

	const hasBg = !isClearAll && !!preview.backgroundColor;

	return (
		<div className="group/preset relative inline-block">
			<button
				type="button"
				title={preset.name}
				className={cn(
					"flex h-9 w-10 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-[#18181b] text-sm font-black transition-all select-none",
					"hover:border-primary/60 hover:bg-[#27272a] hover:scale-105 active:scale-95 shadow-2xs",
					isClearAll && "relative overflow-hidden",
				)}
				onClick={onClick}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						onClick();
					}
				}}
			>
				{isClearAll ? (
					<svg
						width="18"
						height="18"
						viewBox="0 0 22 22"
						fill="none"
						className="text-muted-foreground"
					>
						<title>Mặc định</title>
						<circle
							cx="11"
							cy="11"
							r="9"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
						<line
							x1="4.5"
							y1="17.5"
							x2="17.5"
							y2="4.5"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
					</svg>
				) : (
					<span
						style={previewStyle}
						className={cn(
							"font-sans font-black leading-none tracking-tight",
							hasBg ? "rounded px-1 py-0.5 text-[11px]" : "text-sm",
						)}
					>
						Aa
					</span>
				)}
			</button>
			{isCustom && onDelete && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					title="Xóa preset này"
					className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground opacity-90 shadow-sm transition-opacity hover:opacity-100 group-hover/preset:flex cursor-pointer"
				>
					×
				</button>
			)}
		</div>
	);
}
