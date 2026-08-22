"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { i18next } from "@/lib/i18n";
import { toast } from "sonner";
import {
	Languages,
	Loader2,
	Play,
	Plus,
	Sparkles,
	Square,
	UserCheck,
	Volume2,
	Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PanelBaseView } from "@/components/editor/panels/panel-base-view";
import { PropertyGroup } from "./property-item";
import { useEditor } from "@/hooks/use-editor";
import { useDubbingStore, VOICE_OPTIONS } from "@/dubbing/dubbing-store";
import { useNarrationStore } from "@/dubbing/narration-store";
import { useTranslationStore } from "@/dubbing/translation-store";
import { VoicePickerDialog } from "@/dubbing/components/voice-picker-dialog";
import {
	fetchVoiceCatalog,
	generateTtsAudioResult,
	playVoicePreview,
	stopVoicePreview,
} from "@/dubbing/services/tts";
import { translateRecognitionCues } from "@/dubbing/services/translation-pipeline";
import { getResolvedOpenRouterKey } from "@/dubbing/services/single-cue-actions";
import { planNarrationTiming } from "@/dubbing/services/narration-timing";
import { resolveSpeakerColor } from "@/dubbing/services/speaker-roles";
import {
	applyNarrationMixSettings,
	buildElementFromMedia,
	insertNarrationClips,
} from "@/dubbing/adapters/narration-insert";
import { createAudioContext } from "@/lib/media/audio";
import { mediaTimeFromSeconds, subMediaTime } from "@/dubbing/adapters/time";
import type { TextElement } from "@/types/timeline";
import type { TtsProvider, VoiceCatalogItem, VoiceOption } from "@/dubbing/types";

interface TextElementRef {
	element: TextElement;
	trackId: string;
}

function isSupportedVoiceOption(
	voice: VoiceOption,
): voice is VoiceOption & { provider: TtsProvider } {
	return voice.provider !== "openai";
}

function voiceOptionToCatalogItem(voice: VoiceOption & { provider: TtsProvider }): VoiceCatalogItem {
	return {
		id: voice.id,
		voiceId: voice.id,
		name: voice.name,
		gender: voice.gender,
		lang: voice.lang,
		region: "",
		provider: voice.provider,
		description: voice.description,
		sampleText: "",
		available: true,
	};
}

export function TextSpeechPanel({
	elements: elementRefs,
}: {
	elements: TextElementRef[];
}) {
	const { t } = useTranslation();
	const editor = useEditor();

	const dubbingStore = useDubbingStore();
	const narrationStore = useNarrationStore();
	const translationStore = useTranslationStore();

	const firstElement = elementRefs[0]?.element;
	const firstTrackId = elementRefs[0]?.trackId;

	const [speakerId, setSpeakerId] = useState<string>(() => {
		const firstProfile = dubbingStore.speakerProfiles[0];
		return firstProfile?.id || "speaker-1";
	});

	const [selectedProvider, setSelectedProvider] = useState<TtsProvider>("edge-tts");
	const [selectedVoiceId, setSelectedVoiceId] = useState<string>("vi-VN-HoaiMyNeural");
	const [speed, setSpeed] = useState<number>(1.0);
	const [pitch, setPitch] = useState<number>(0);
	const [speedMatch, setSpeedMatch] = useState<boolean>(true);
	const [alignDuration, setAlignDuration] = useState<boolean>(false);

	const [isVoicePickerOpen, setIsVoicePickerOpen] = useState<boolean>(false);
	const [isTranslating, setIsTranslating] = useState<boolean>(false);
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
	const [catalogVoices, setCatalogVoices] = useState<VoiceCatalogItem[]>([]);

	// Tải danh mục giọng đọc từ server
	useEffect(() => {
		let isMounted = true;
		fetchVoiceCatalog()
			.then((res) => {
				if (isMounted && res.voices?.length > 0) {
					setCatalogVoices(res.voices.filter((v) => v.available !== false));
				}
			})
			.catch(() => undefined);
		return () => {
			isMounted = false;
			stopVoicePreview();
		};
	}, []);

	// Đồng bộ giọng đã gán theo phân vai khi đổi người nói
	useEffect(() => {
		const assigned = narrationStore.assignments[speakerId];
		if (assigned?.voiceId && assigned?.provider) {
			setSelectedProvider(assigned.provider);
			setSelectedVoiceId(assigned.voiceId);
			if (assigned.speed !== undefined) setSpeed(assigned.speed);
			if (assigned.pitch !== undefined) setPitch(assigned.pitch);
			return;
		}

		const profile = dubbingStore.speakerProfiles.find((p) => p.id === speakerId);
		if (profile?.name) {
			const nameAssigned = narrationStore.assignments[profile.name];
			if (nameAssigned?.voiceId && nameAssigned?.provider) {
				setSelectedProvider(nameAssigned.provider);
				setSelectedVoiceId(nameAssigned.voiceId);
				if (nameAssigned.speed !== undefined) setSpeed(nameAssigned.speed);
				if (nameAssigned.pitch !== undefined) setPitch(nameAssigned.pitch);
			}
		}
	}, [speakerId, narrationStore.assignments, dubbingStore.speakerProfiles]);

	const currentSpeaker =
		dubbingStore.speakerProfiles.find((p) => p.id === speakerId) || {
			id: speakerId,
			name: speakerId === "speaker-1" ? "N1" : speakerId,
			color: "#3b82f6",
		};

	// Danh sách giọng đọc đầy đủ
	const effectiveVoices = useMemo<VoiceCatalogItem[]>(() => {
		const supportedPresets = VOICE_OPTIONS.filter(isSupportedVoiceOption);
		const list: VoiceCatalogItem[] = catalogVoices.length > 0
			? [...catalogVoices]
			: supportedPresets.map(voiceOptionToCatalogItem);

		for (const preset of supportedPresets) {
			if (!list.some((item) => item.id === preset.id)) {
				list.unshift(voiceOptionToCatalogItem(preset));
			}
		}
		return list;
	}, [catalogVoices]);

	const currentVoice = effectiveVoices.find((v) => v.id === selectedVoiceId) || {
		id: selectedVoiceId,
		name: selectedVoiceId,
		provider: selectedProvider,
		gender: "female" as const,
		lang: "vi-VN",
		description: "",
		available: true,
	};

	// Dịch nhanh nội dung Text sang ngôn ngữ đích
	const handleTranslateText = async () => {
		if (!firstElement || !firstElement.content.trim()) return;

		setIsTranslating(true);
		const toastId = "text-translate";
		toast.loading("Đang dịch văn bản bằng AI...", { id: toastId });

		try {
			const resolvedOpenRouterKey = getResolvedOpenRouterKey({
				openRouterApiKey: translationStore.openRouterApiKey,
			});
			const activeApiKey =
				translationStore.provider === "openrouter"
					? resolvedOpenRouterKey
					: translationStore.customApiKey.trim();
			const activeModel =
				translationStore.provider === "openrouter"
					? translationStore.openRouterModel
					: translationStore.customModel;

			if (!activeModel?.trim()) {
				throw new Error("Vui lòng nhập hoặc chọn model AI ở tab Dịch (Thuyết minh).");
			}
			if (translationStore.provider === "openrouter" && !activeApiKey) {
				throw new Error(
					"Chưa có OpenRouter API key. Hãy cấu hình API key ở tab Dịch (Thuyết minh).",
				);
			}
			if (
				translationStore.provider === "custom" &&
				!translationStore.customEndpoint.trim()
			) {
				throw new Error(
					"Vui lòng nhập API endpoint cho Custom provider ở tab Dịch (Thuyết minh).",
				);
			}

			const selectedStyle = translationStore.styles.find(
				(s) => s.id === translationStore.selectedStyleId,
			);

			const results = await translateRecognitionCues({
				cues: [
					{
						id: `text-${firstElement.id}`,
						startTime: firstElement.startTime,
						endTime: firstElement.startTime + firstElement.duration,
						text: firstElement.content.trim(),
						speaker: currentSpeaker.name,
						speakerId: currentSpeaker.id,
					},
				],
				speakerProfiles: dubbingStore.speakerProfiles,
				config: {
					provider: translationStore.provider,
					endpoint:
						translationStore.provider === "custom"
							? translationStore.customEndpoint.trim()
							: undefined,
					apiKey: activeApiKey,
					model: activeModel.trim(),
					targetLanguage: translationStore.targetLanguage || "vi",
					stylePrompt: selectedStyle?.prompt,
				},
			});

			const translated = results[0]?.text?.trim();
			if (!translated) {
				throw new Error("Không nhận được kết quả dịch.");
			}

			// Cập nhật text content trên timeline
			editor.timeline.updateElements({
				updates: [
					{
						trackId: firstTrackId,
						elementId: firstElement.id,
						updates: { content: translated },
					},
				],
				pushHistory: true,
			});

			toast.success("Đã dịch văn bản thành công!", { id: toastId });
		} catch (error) {
			console.error("Translation error:", error);
			toast.error(
				error instanceof Error ? error.message : "Dịch văn bản thất bại.",
				{ id: toastId },
			);
		} finally {
			setIsTranslating(false);
		}
	};

	// Nghe thử giọng đọc
	const handleTogglePreview = async () => {
		if (isPlayingPreview) {
			stopVoicePreview();
			setIsPlayingPreview(false);
			return;
		}

		const sampleText = firstElement?.content.trim() || "Xin chào, đây là giọng đọc mẫu thuyết minh.";
		setIsPlayingPreview(true);
		try {
			await playVoicePreview({
				text: sampleText.slice(0, 80),
				options: {
					provider: selectedProvider,
					voiceId: selectedVoiceId,
					rate: speed,
					pitch,
				},
			});
		} catch (error) {
			console.error("Preview voice failed:", error);
			toast.error("Không thể phát mẫu giọng đọc.");
		} finally {
			setIsPlayingPreview(false);
		}
	};

	// Tạo phân vai mới nhanh
	const handleAddSpeaker = () => {
		const nextIndex = dubbingStore.speakerProfiles.length + 1;
		const newProf = dubbingStore.addSpeakerProfile({
			name: `N${nextIndex}`,
		});
		setSpeakerId(newProf.id);
		toast.success(`Đã thêm phân vai ${newProf.name}`);
	};

	// Tạo giọng nói TTS và đưa vào timeline
	const handleGenerateTTS = async () => {
		if (elementRefs.length === 0) return;

		setIsGenerating(true);
		const toastId = "tts-generate-rich";
		toast.loading("Đang tạo giọng đọc TTS & đưa vào timeline...", { id: toastId });

		let successCount = 0;
		let failCount = 0;
		let lastErrorMsg = "";

		const activeProject = editor.project.getActive();
		if (!activeProject) {
			toast.error("Không tìm thấy dự án đang mở.", { id: toastId });
			setIsGenerating(false);
			return;
		}

		for (const { element, trackId: textTrackId } of elementRefs) {
			const textToRead = element.content?.trim();
			if (!textToRead) continue;

			try {
				const targetDuration = Math.max(0.5, element.duration);

				const generated = await generateTtsAudioResult({
					text: textToRead,
					options: {
						provider: selectedProvider,
						voiceId: selectedVoiceId,
						rate: speed,
						pitch,
						targetDuration: speedMatch ? targetDuration : undefined,
					},
				});

				const arrayBuffer = await generated.blob.arrayBuffer();
				const audioContext = createAudioContext();
				const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

				const file = new File(
					[generated.blob],
					`tts-${currentSpeaker.name}-${Date.now()}.mp3`,
					{ type: generated.blob.type || "audio/mp3" },
				);

				const mediaId = await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset: {
						name: `TTS: ${currentSpeaker.name} · ${textToRead.slice(0, 20)}`,
						type: "audio",
						file,
						url: URL.createObjectURL(generated.blob),
						duration: decodedBuffer.duration,
						ephemeral: true,
					},
				});

				const serverMatched =
					speedMatch &&
					generated.sourceDuration !== null &&
					generated.appliedRate !== null &&
					generated.outputDuration !== null;

				const rawDuration = serverMatched
					? (generated.sourceDuration ?? decodedBuffer.duration)
					: decodedBuffer.duration;

				const timing = planNarrationTiming({
					rawDuration,
					targetDuration,
					autoMatchDuration: speedMatch,
				});

				const clipDuration = serverMatched
					? (generated.outputDuration ?? timing.duration)
					: timing.duration;

				const timelineStart = mediaTimeFromSeconds({ seconds: element.startTime });
				const timelineEnd = mediaTimeFromSeconds({ seconds: element.startTime + clipDuration });

				const speakerColor = resolveSpeakerColor({
					speakerId: currentSpeaker.id,
					speakerName: currentSpeaker.name,
					profiles: dubbingStore.speakerProfiles,
				});

				const narrationElement = buildElementFromMedia({
					mediaId,
					mediaType: "audio",
					name: `[Thuyết minh:custom] ${currentSpeaker.name} · ${textToRead.slice(0, 15)}...`,
					duration: subMediaTime({ a: timelineEnd, b: timelineStart }),
					startTime: timelineStart,
					speakerId: currentSpeaker.id,
					speakerName: currentSpeaker.name,
					speakerColor,
					color: speakerColor,
				});

				if (narrationElement.type !== "audio") {
					throw new Error("Không thể tạo phần tử âm thanh.");
				}

				narrationElement.audioRole = "narration";
				narrationElement.params.volume = dubbingStore.settings.ttsVolume ?? 0;
				narrationElement.sourceDuration = mediaTimeFromSeconds({
					seconds: decodedBuffer.duration,
				});
				narrationElement.speakerId = currentSpeaker.id;
				narrationElement.speakerName = currentSpeaker.name;
				narrationElement.speakerColor = speakerColor;
				narrationElement.color = speakerColor;

				if (!serverMatched && Math.abs(timing.playbackRate - 1) > 0.001) {
					narrationElement.retime = {
						rate: timing.playbackRate,
						maintainPitch: true,
					};
				}

				// Đưa clip âm thanh vào timeline trên track phân vai
				insertNarrationClips({
					editor,
					clips: [
						{
							cueId: `custom-cue-${element.id}`,
							speakerId: currentSpeaker.id,
							speakerName: currentSpeaker.name,
							speakerColor,
							lane: 0,
							element: narrationElement,
						},
					],
				});

				// Nếu bật căn chỉnh độ dài text theo giọng đọc
				if (alignDuration) {
					editor.timeline.updateElements({
						updates: [
							{
								trackId: textTrackId,
								elementId: element.id,
								updates: { duration: clipDuration },
							},
						],
						pushHistory: true,
					});
				}

				// Lưu gán giọng vào narration store cho phân vai này
				const voiceConfig = {
					provider: selectedProvider,
					voiceId: selectedVoiceId,
					speed,
					pitch,
				};
				if (typeof narrationStore.setAssignment === "function") {
					narrationStore.setAssignment({
						speakerId: currentSpeaker.id,
						value: voiceConfig,
					});
				} else if (typeof narrationStore.setSpeakerVoice === "function") {
					narrationStore.setSpeakerVoice({
						speakerId: currentSpeaker.id,
						assignment: voiceConfig,
					});
				}

				successCount++;
			} catch (error) {
				console.error("TTS generation error:", error);
				lastErrorMsg = error instanceof Error ? error.message : "Không thể tạo giọng đọc";
				failCount++;
			}
		}

		// Làm mới thiết lập hòa âm và ducking
		applyNarrationMixSettings({
			editor,
			sourceVolumeDb: dubbingStore.settings.sourceVolume,
			ttsVolumeDb: dubbingStore.settings.ttsVolume,
		});
		editor.audio.refreshScheduledClips();

		if (failCount === 0) {
			toast.success(
				i18next.t("Đã tạo giọng đọc TTS và đưa vào timeline thành công!"),
				{ id: toastId },
			);
		} else {
			toast.error(
				lastErrorMsg || `Hoàn tất: ${successCount} thành công, ${failCount} thất bại`,
				{ id: toastId },
			);
		}

		setIsGenerating(false);
	};

	return (
		<PanelBaseView className="p-0">
			<PropertyGroup
				title={t("Chuyển văn bản thành giọng nói (TTS)")}
				hasBorderTop={false}
				collapsible={false}
			>
				<div className="space-y-4 text-xs">
					{/* Khối hiển thị nội dung & Dịch nhanh */}
					<div className="space-y-1.5 rounded-lg border p-2.5 bg-muted/40 border-border">
						<div className="flex items-center justify-between text-[11px]">
							<span className="font-semibold text-foreground flex items-center gap-1.5">
								<Volume2 className="size-3.5 text-blue-500" />
								Nội dung đọc ({elementRefs.length} văn bản):
							</span>
							<Button
								variant="outline"
								size="sm"
								type="button"
								disabled={isTranslating || !firstElement?.content?.trim()}
								onClick={handleTranslateText}
								className="h-6 px-2 text-[10px] gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
								title="Dịch văn bản sang tiếng Việt"
							>
								{isTranslating ? (
									<Loader2 className="size-3 animate-spin" />
								) : (
									<Languages className="size-3" />
								)}
								<span>Dịch tiếng Việt</span>
							</Button>
						</div>
						<div className="max-h-16 overflow-y-auto rounded bg-background/80 border p-1.5 text-[11px] font-mono text-muted-foreground leading-relaxed">
							{firstElement?.content || "(Chưa có nội dung văn bản)"}
						</div>
					</div>

					{/* 1. Phân vai người nói */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
								<UserCheck className="size-3.5 text-indigo-500" />
								Phân vai người nói:
							</label>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								onClick={handleAddSpeaker}
								className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
							>
								<Plus className="size-3" />
								<span>Thêm vai</span>
							</Button>
						</div>

						<Select value={speakerId} onValueChange={setSpeakerId}>
							<SelectTrigger className="h-8 text-xs">
								<div className="flex items-center gap-2 truncate">
									<span
										className="size-2.5 rounded-full shrink-0 ring-1 ring-border"
										style={{ backgroundColor: currentSpeaker.color }}
									/>
									<span className="font-medium truncate">{currentSpeaker.name}</span>
								</div>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectLabel className="text-[10px]">Danh sách phân vai</SelectLabel>
									{dubbingStore.speakerProfiles.map((prof) => (
										<SelectItem key={prof.id} value={prof.id}>
											<div className="flex items-center gap-2">
												<span
													className="size-2.5 rounded-full shrink-0"
													style={{ backgroundColor: prof.color }}
												/>
												<span>{prof.name}</span>
											</div>
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					{/* 2. Chọn giọng đọc AI - Bấm mở Kho Giọng Đọc */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
								<Waves className="size-3.5 text-blue-500" />
								Giọng đọc AI:
							</label>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onClick={handleTogglePreview}
									className="h-5 px-1.5 text-[10px] gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
								>
									{isPlayingPreview ? (
										<Square className="size-3 fill-current" />
									) : (
										<Play className="size-3 fill-current" />
									)}
									<span>{isPlayingPreview ? "Dừng" : "Nghe thử"}</span>
								</Button>
								<Button
									variant="outline"
									size="sm"
									type="button"
									onClick={() => setIsVoicePickerOpen(true)}
									className="h-5 px-2 text-[10px] gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
								>
									<span>Đổi giọng</span>
								</Button>
							</div>
						</div>

						{/* Thẻ hiển thị giọng hiện tại - Bấm vào mở Kho giọng như bên Thuyết minh */}
						<div
							onClick={() => setIsVoicePickerOpen(true)}
							className="group flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-blue-500/50 cursor-pointer transition-all shadow-xs"
						>
							<div className="flex items-center gap-2.5 min-w-0">
								<div className="size-8 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform">
									<Waves className="size-4" />
								</div>
								<div className="flex flex-col min-w-0">
									<div className="flex items-center gap-1.5">
										<span className="font-semibold text-xs text-foreground truncate">
											{currentVoice.name}
										</span>
										<span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-medium text-muted-foreground uppercase">
											{currentVoice.provider}
										</span>
									</div>
									<span className="text-[10px] text-muted-foreground truncate">
										{currentVoice.description || `${currentVoice.gender === "female" ? "Nữ" : "Nam"} · ${currentVoice.lang}`}
									</span>
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 text-[10px] px-2 text-muted-foreground group-hover:text-blue-500 shrink-0 font-medium"
							>
								Kho giọng →
							</Button>
						</div>
					</div>

					{/* Tốc độ & Cao độ */}
					<div className="grid grid-cols-2 gap-3 pt-1">
						<div className="space-y-1">
							<div className="flex items-center justify-between text-[10px]">
								<span className="text-muted-foreground">Tốc độ đọc:</span>
								<span className="font-mono font-bold text-foreground">
									{speed.toFixed(2)}x
								</span>
							</div>
							<Slider
								min={0.5}
								max={2.0}
								step={0.05}
								value={[speed]}
								onValueChange={([val]) => setSpeed(val)}
								className="[&_[data-slot=slider-range]]:bg-blue-500 [&_[data-slot=slider-thumb]]:border-blue-500"
							/>
						</div>

						<div className="space-y-1">
							<div className="flex items-center justify-between text-[10px]">
								<span className="text-muted-foreground">Cao độ (Pitch):</span>
								<span className="font-mono font-bold text-foreground">
									{pitch > 0 ? `+${pitch}` : pitch}
								</span>
							</div>
							<Slider
								min={-10}
								max={10}
								step={1}
								value={[pitch]}
								onValueChange={([val]) => setPitch(val)}
								className="[&_[data-slot=slider-range]]:bg-indigo-500 [&_[data-slot=slider-thumb]]:border-indigo-500"
							/>
						</div>
					</div>

					<div className="border-t border-border/60" />

					{/* 3. Tùy chọn khớp thời lượng & timeline */}
					<div className="space-y-2.5 rounded-lg border p-2.5 bg-muted/20 border-border/80">
						<div className="flex items-start gap-2">
							<Checkbox
								id="speed-match-opt"
								checked={speedMatch}
								onCheckedChange={(checked) => setSpeedMatch(checked === true)}
								className="mt-0.5"
							/>
							<div className="space-y-0.5 leading-none">
								<label
									htmlFor="speed-match-opt"
									className="cursor-pointer text-[11px] font-semibold text-foreground"
								>
									Tự động khớp thời lượng (Speed Match)
								</label>
								<p className="text-[10px] text-muted-foreground leading-normal">
									Tự động co giãn tốc độ nói vừa vặn với độ dài Text trên timeline (
									{firstElement ? `${firstElement.duration.toFixed(2)}s` : "0.00s"}).
								</p>
							</div>
						</div>

						<div className="flex items-start gap-2">
							<Checkbox
								id="align-text-opt"
								checked={alignDuration}
								onCheckedChange={(checked) => setAlignDuration(checked === true)}
								className="mt-0.5"
							/>
							<div className="space-y-0.5 leading-none">
								<label
									htmlFor="align-text-opt"
									className="cursor-pointer text-[11px] font-semibold text-foreground"
								>
									Căn chỉnh độ dài Text theo giọng đọc
								</label>
								<p className="text-[10px] text-muted-foreground leading-normal">
									Co giãn khối Text trên timeline bằng đúng độ dài âm thanh TTS tạo ra.
								</p>
							</div>
						</div>
					</div>

					{/* Nút hành động chính */}
					<Button
						type="button"
						className="w-full h-9 gap-1.5 font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all cursor-pointer"
						disabled={isGenerating || elementRefs.length === 0}
						onClick={handleGenerateTTS}
					>
						{isGenerating ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								<span>Đang tạo giọng nói AI...</span>
							</>
						) : (
							<>
								<Sparkles className="size-4 text-yellow-300 fill-yellow-300" />
								<span>Tạo giọng nói & Đưa vào Timeline</span>
							</>
						)}
					</Button>
				</div>
			</PropertyGroup>

			{/* Modal Kho Giọng Đọc (như bên Thuyết minh) */}
			<VoicePickerDialog
				open={isVoicePickerOpen}
				onOpenChange={setIsVoicePickerOpen}
				speakerName={currentSpeaker.name}
				voices={effectiveVoices}
				selectedVoiceId={selectedVoiceId}
				previewAdjustments={{ rate: speed, pitch }}
				onSelect={(voice) => {
					const actualVoiceId =
						voice.voiceId ||
						voice.id.replace(
							/^(edge-tts|capcut|vieneu|supertonic|omnivoice|elevenlabs|gemini):/,
							"",
						);
					setSelectedVoiceId(actualVoiceId);
					setSelectedProvider(voice.provider);
					const voiceConfig = {
						provider: voice.provider,
						voiceId: actualVoiceId,
						speed,
						pitch,
					};
					if (typeof narrationStore.setAssignment === "function") {
						narrationStore.setAssignment({
							speakerId: currentSpeaker.id,
							value: voiceConfig,
						});
					} else if (typeof narrationStore.setSpeakerVoice === "function") {
						narrationStore.setSpeakerVoice({
							speakerId: currentSpeaker.id,
							assignment: voiceConfig,
						});
					}
					setIsVoicePickerOpen(false);
					toast.success(`Đã chọn giọng: ${voice.name}`);
				}}
			/>
		</PanelBaseView>
	);
}
