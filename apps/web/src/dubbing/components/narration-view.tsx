"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Gauge,
	SlidersHorizontal,
	Users,
	Volume2,
	WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/hooks/use-editor";
import { getActiveSceneOrNull } from "@/dubbing/adapters/editor";
import {
	applyNarrationMixSettings,
	buildElementFromMedia,
	collectPreviousNarrationElements,
	insertNarrationClips,
	processMediaAssets,
} from "@/dubbing/adapters/narration-insert";
import {
	hasSourceAudioClips,
} from "@/dubbing/adapters/source-audio";
import {
	syncNarrationSourceAudio,
} from "@/dubbing/adapters/source-audio-sync";
import {
	mediaTimeFromSeconds,
	subMediaTime,
	TICKS_PER_SECOND,
} from "@/dubbing/adapters/time";
import { cn } from "@/utils/ui";
import { useDubbingStore } from "../dubbing-store";
import {
	type NarrationVoiceSettings,
	useNarrationStore,
} from "../narration-store";
import { useTranslationStore } from "../translation-store";
import type { RecognitionCue, TtsProvider, VoiceCatalogItem } from "../types";
import {
	allocateNarrationLanes,
	buildNarrationElementName,
	mapWithConcurrency,
	narrationConcurrency,
	narrationCueIdFromElementName,
	narrationSynthesisAdjustments,
	planNarrationTiming,
} from "../services/narration-timing";
import { resolveSpeakerColor } from "../services/speaker-roles";
import { resolveNarrationCues } from "../services/narration-source";
import { fetchVoiceCatalog, generateTtsAudioResult } from "../services/tts";
import { VoicePickerDialog } from "./voice-picker-dialog";

type SpeakerSummary = {
	id: string;
	name: string;
	color: string;
	cues: RecognitionCue[];
	duration: number;
};

const PERFORMANCE_OPTIONS = [
	{
		id: "light" as const,
		name: "Nhẹ máy",
		multiplier: "1×",
		detail: "1 tác vụ · ưu tiên ONNX/CPU",
	},
	{
		id: "standard" as const,
		name: "Tiêu chuẩn",
		multiplier: "2×",
		detail: "2 tác vụ · bộ đọc native/C++",
	},
	{
		id: "maximum" as const,
		name: "Tối đa",
		multiplier: "3×",
		detail: "3 tác vụ · GPU nếu engine hỗ trợ",
	},
];

function cueSpeakerId(cue: RecognitionCue) {
	return cue.speakerId || "speaker-default";
}

function durationLabel(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.round(seconds % 60);
	return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function voiceKey({
	provider,
	voiceId,
}: {
	provider: TtsProvider;
	voiceId: string;
}) {
	return `${provider}:${voiceId}`;
}

function fileExtension(blob: Blob) {
	return blob.type.includes("wav") ? "wav" : "mp3";
}

export function NarrationView() {
	const editor = useEditor();
	const activeProject = editor.project.getActiveOrNull();
	const activeTracks = getActiveSceneOrNull({ editor })?.tracks ?? null;
	const { extractedCues, speakerProfiles, settings, updateSettings } =
		useDubbingStore();
	const translations = useTranslationStore((state) => state.translations);
	const narration = useNarrationStore();
	const [voices, setVoices] = useState<VoiceCatalogItem[]>([]);
	const [loadingVoices, setLoadingVoices] = useState(true);
	const [isGenerating, setIsGenerating] = useState(false);
	const [progress, setProgress] = useState(0);
	const [voicePickerSpeakerId, setVoicePickerSpeakerId] = useState<
		string | null
	>(null);
	const [isExtractingSource, setIsExtractingSource] = useState(false);
	const [isIsolatingVoice, setIsIsolatingVoice] = useState(false);
	const [storeHydrated, setStoreHydrated] = useState(() =>
		useDubbingStore.persist.hasHydrated(),
	);
	const didMountEnsure = useRef(false);
	const narrationCueSource = useMemo(
		() =>
			resolveNarrationCues({
				tracks: activeTracks,
				extractedCues,
				ticksPerSecond: TICKS_PER_SECOND,
			}),
		[activeTracks, extractedCues],
	);
	const narrationCues = narrationCueSource.cues;

	useEffect(() => {
		if (storeHydrated) return;
		if (useDubbingStore.persist.hasHydrated()) {
			setStoreHydrated(true);
			return;
		}
		return useDubbingStore.persist.onFinishHydration(() => {
			setStoreHydrated(true);
		});
	}, [storeHydrated]);



	useEffect(() => {
		let cancelled = false;
		fetchVoiceCatalog()
			.then((result) => {
				if (!cancelled)
					setVoices(result.voices.filter((voice) => voice.available));
			})
			.catch((error) =>
				toast.error(
					error instanceof Error ? error.message : "Không thể tải kho giọng",
				),
			)
			.finally(() => !cancelled && setLoadingVoices(false));
		return () => {
			cancelled = true;
		};
	}, []);

	const speakers = useMemo<SpeakerSummary[]>(() => {
		if (narration.mode === "single") {
			return [
				{
					id: "single",
					name: "Một người thuyết minh",
					color: "#f59e0b",
					cues: narrationCues,
					duration: narrationCues.reduce(
						(sum, cue) => sum + Math.max(0, cue.endTime - cue.startTime),
						0,
					),
				},
			];
		}
		const groups = new Map<string, SpeakerSummary>();
		for (const cue of narrationCues) {
			const id = cueSpeakerId(cue);
			const profile = speakerProfiles.find((item) => item.id === id);
			const current = groups.get(id) || {
				id,
				name: cue.speakerName || cue.speaker || profile?.name || "Người nói 1",
				color: cue.speakerColor || profile?.color || "#60a5fa",
				cues: [],
				duration: 0,
			};
			current.cues.push(cue);
			current.duration += Math.max(0, cue.endTime - cue.startTime);
			groups.set(id, current);
		}
		return Array.from(groups.values());
	}, [narration.mode, narrationCues, speakerProfiles]);

	const defaultVoice = useMemo(
		() =>
			voices.find(
				(voice) =>
					voice.provider === settings.voiceEngine &&
					voice.voiceId === settings.selectedVoiceId,
			) || voices[0],
		[settings.selectedVoiceId, settings.voiceEngine, voices],
	);

	const speakerSettings = (speakerId: string): NarrationVoiceSettings => {
		const assigned = narration.assignments[speakerId];
		if (assigned) return assigned;
		return {
			provider: defaultVoice?.provider || settings.voiceEngine,
			voiceId: defaultVoice?.voiceId || settings.selectedVoiceId,
			speed: defaultVoice?.defaultRate ?? narration.globalSpeed,
			pitch: defaultVoice?.defaultPitch ?? narration.globalPitch,
		};
	};

	const updateSpeaker = ({
		speakerId,
		partial,
	}: {
		speakerId: string;
		partial: Partial<NarrationVoiceSettings>;
	}) => {
		narration.setAssignment({
			speakerId,
			value: { ...speakerSettings(speakerId), ...partial },
		});
	};

	const handleVoiceChange = ({
		speakerId,
		selected,
	}: {
		speakerId: string;
		selected: VoiceCatalogItem;
	}) => {
		const clonedSpeed = selected.defaultRate ?? narration.globalSpeed;
		const clonedPitch = selected.defaultPitch ?? narration.globalPitch;
		if (narration.mode === "single") {
			updateSettings({
				voiceEngine: selected.provider,
				selectedVoiceId: selected.voiceId,
			});
			if (selected.defaultRate !== undefined) {
				narration.setGlobalSpeed(clonedSpeed);
			}
			if (selected.defaultPitch !== undefined) {
				narration.setGlobalPitch(clonedPitch);
			}
		} else {
			updateSpeaker({
				speakerId,
				partial: {
					provider: selected.provider,
					voiceId: selected.voiceId,
					...(selected.defaultRate !== undefined
						? { speed: clonedSpeed }
						: {}),
					...(selected.defaultPitch !== undefined
						? { pitch: clonedPitch }
						: {}),
				},
			});
		}
	};

	const voicePickerSpeaker = speakers.find(
		(speaker) => speaker.id === voicePickerSpeakerId,
	);
	const voicePickerSettings = voicePickerSpeaker
		? speakerSettings(voicePickerSpeaker.id)
		: null;
	const voicePickerSelectedId = voicePickerSettings
		? voiceKey({
				provider: voicePickerSettings.provider,
				voiceId: voicePickerSettings.voiceId,
			})
		: undefined;

	const handleGenerateAll = async () => {
		if (!activeProject) return toast.error("Không có dự án đang mở");
		if (narrationCues.length === 0)
			return toast.error("Chưa có cue để tạo thuyết minh");
		const jobs = narrationCues
			.map((cue) => ({ cue, text: (translations[cue.id] || cue.text).trim() }))
			.filter((job) => job.text.length > 0);
		if (jobs.length === 0) return toast.error("Các cue chưa có nội dung");

		setIsGenerating(true);
		setProgress(0);
		let completed = 0;
		try {
			const generated = await mapWithConcurrency({
				items: jobs,
				concurrency: narrationConcurrency(narration.performance),
				worker: async (job, index) => {
					const speakerId =
						narration.mode === "single" ? "single" : cueSpeakerId(job.cue);
					const voice = speakerSettings(speakerId);
					const adjustments = narrationSynthesisAdjustments({
						autoMatchDuration: narration.autoMatchDuration,
						speed: voice.speed,
						pitch: voice.pitch,
					});
					try {
						const targetDuration = Math.max(
							0.1,
							job.cue.endTime - job.cue.startTime,
						);
						const generatedAudio = await generateTtsAudioResult({
							text: job.text,
							options: {
								provider: voice.provider,
								voiceId: voice.voiceId,
								rate: adjustments.rate,
								pitch: adjustments.pitch,
								targetDuration: narration.autoMatchDuration
									? targetDuration
									: undefined,
							},
						});
						return {
							job,
							index,
							speakerId,
							voice,
							...generatedAudio,
							error: null as string | null,
						};
					} catch (error) {
						return {
							job,
							index,
							speakerId,
							voice,
							blob: null,
							sourceDuration: null,
							appliedRate: null,
							outputDuration: null,
							error:
								error instanceof Error ? error.message : "Tạo giọng thất bại",
						};
					} finally {
						completed += 1;
						setProgress(Math.round((completed / jobs.length) * 70));
					}
				},
			});

			const results = [];
			const preparedClips: Array<{
				cueId: string;
				speakerId: string;
				speakerName?: string;
				speakerColor?: string;
				startTime: number;
				endTime: number;
				element: ReturnType<typeof buildElementFromMedia>;
			}> = [];
			for (let index = 0; index < generated.length; index++) {
				const item = generated[index];
				if (!item.blob) {
					results.push({
						cueId: item.job.cue.id,
						rawDuration: 0,
						targetDuration: item.job.cue.endTime - item.job.cue.startTime,
						playbackRate: 1,
						status: "error" as const,
						message: item.error || undefined,
					});
					continue;
				}
				const extension = fileExtension(item.blob);
				const file = new File(
					[item.blob],
					`Thuyet-minh-${String(index + 1).padStart(3, "0")}.${extension}`,
					{
						type:
							item.blob.type ||
							(extension === "wav" ? "audio/wav" : "audio/mpeg"),
					},
				);
				const processed = (await processMediaAssets({ files: [file] }))[0];
				if (!processed?.duration) {
					results.push({
						cueId: item.job.cue.id,
						rawDuration: 0,
						targetDuration: item.job.cue.endTime - item.job.cue.startTime,
						playbackRate: 1,
						status: "error" as const,
						message: "Không đo được thời lượng audio",
					});
					continue;
				}
				const mediaId = await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset: {
						...processed,
						ephemeral: true,
					},
				});
				if (!mediaId) throw new Error(`Không thể lưu ${file.name}`);
				const targetDuration = Math.max(
					0.1,
					item.job.cue.endTime - item.job.cue.startTime,
				);
				const serverMatched =
					narration.autoMatchDuration &&
					item.sourceDuration !== null &&
					item.appliedRate !== null &&
					item.outputDuration !== null;
				const rawDuration = serverMatched
					? (item.sourceDuration ?? processed.duration)
					: processed.duration;
				const timing = planNarrationTiming({
					rawDuration,
					targetDuration,
					autoMatchDuration: narration.autoMatchDuration,
				});
				const clipDuration = serverMatched
					? (item.outputDuration ?? timing.duration)
					: timing.duration;
				const timelineStart = mediaTimeFromSeconds({
					seconds: item.job.cue.startTime,
				});
				const timelineEnd = mediaTimeFromSeconds({
					seconds: item.job.cue.startTime + clipDuration,
				});
				const cue = item.job.cue;
				const speakerId =
					item.speakerId || cue.speakerId || "speaker-default";
				const speakerName =
					cue.speakerName ||
					cue.speaker ||
					(speakerId.startsWith("speaker-")
						? `N${speakerId.replace("speaker-", "")}`
						: speakerId);
				const speakerColor = resolveSpeakerColor({
					speakerId,
					speakerName,
					cueColor: cue.speakerColor,
					profiles: speakerProfiles,
				});

				const element = buildElementFromMedia({
					mediaId,
					mediaType: "audio",
					name: buildNarrationElementName({
						cueId: cue.id,
						label: `${speakerName} · câu ${index + 1}`,
					}),
					duration: subMediaTime({ a: timelineEnd, b: timelineStart }),
					startTime: timelineStart,
					speakerId,
					speakerName,
					speakerColor,
					color: speakerColor,
				});
				if (element.type !== "audio")
					throw new Error("Không thể tạo phần tử audio");
				element.audioRole = "narration";
				element.params.volume = settings.ttsVolume;
				element.sourceDuration = mediaTimeFromSeconds({
					seconds: processed.duration,
				});
				element.speakerId = speakerId;
				element.speakerName = speakerName;
				element.speakerColor = speakerColor;
				element.color = speakerColor;
				if (!serverMatched && Math.abs(timing.playbackRate - 1) > 0.001) {
					element.retime = {
						rate: timing.playbackRate,
						maintainPitch: true,
					};
				}
				preparedClips.push({
					cueId: cue.id,
					speakerId,
					speakerName,
					speakerColor,
					startTime: cue.startTime,
					endTime: cue.startTime + clipDuration,
					element,
				});
				results.push({
					cueId: cue.id,
					rawDuration,
					targetDuration,
					playbackRate: item.appliedRate ?? timing.playbackRate,
					status: timing.needsReview
						? ("warning" as const)
						: ("matched" as const),
					message: timing.needsReview
						? Math.abs(timing.difference) > 0.08
							? "Không thể khớp tuyệt đối trong giới hạn 0.2×–5×; đã giữ đủ nội dung"
							: "Đã khớp khung nhưng tốc độ thay đổi khá lớn"
						: undefined,
				});
				setProgress(70 + Math.round(((index + 1) / generated.length) * 30));
			}

			// Replace successful cues from a previous generation instead of stacking
			// duplicate narration clips on the timeline.
			const successfulCueIds = new Set(preparedClips.map((clip) => clip.cueId));
			const previousElements = collectPreviousNarrationElements({
				tracks: getActiveSceneOrNull({ editor })?.tracks,
				successfulCueIds,
				cueIdFromName: narrationCueIdFromElementName,
			});
			if (previousElements.length > 0) {
				editor.timeline.deleteElements({ elements: previousElements });
			}

			const lanes = allocateNarrationLanes(
				preparedClips.map((clip) => ({
					id: clip.cueId,
					speakerId: clip.speakerId,
					startTime: clip.startTime,
					endTime: clip.endTime,
				})),
			);
			insertNarrationClips({
				editor,
				clips: preparedClips.map((clip) => ({
					cueId: clip.cueId,
					speakerId: clip.speakerId,
					speakerName: clip.speakerName,
					speakerColor: clip.speakerColor,
					lane: lanes.get(clip.cueId) ?? 0,
					element: clip.element,
				})),
			});
			applyNarrationMixSettings({
				editor,
				sourceVolumeDb: settings.sourceVolume,
				ttsVolumeDb: settings.ttsVolume,
			});
			editor.audio.refreshScheduledClips();
			narration.setResults(narration.reviewAfterGeneration ? results : []);
			const failures = results.filter(
				(result) => result.status === "error",
			).length;
			if (failures > 0)
				toast.warning(
					`Đã tạo ${results.length - failures}/${results.length} câu; ${failures} câu lỗi`,
				);
			else
				toast.success(
					`Đã tạo ${results.length} câu thuyết minh và đưa vào timeline`,
				);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể tạo thuyết minh",
			);
		} finally {
			setIsGenerating(false);
			setProgress(0);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<VoicePickerDialog
				open={voicePickerSpeaker !== undefined}
				onOpenChange={(open) => {
					if (!open) setVoicePickerSpeakerId(null);
				}}
				speakerName={voicePickerSpeaker?.name ?? "Người nói"}
				voices={voices}
				selectedVoiceId={voicePickerSelectedId}
				previewAdjustments={
					voicePickerSettings
						? narrationSynthesisAdjustments({
								autoMatchDuration: narration.autoMatchDuration,
								speed: voicePickerSettings.speed,
								pitch: voicePickerSettings.pitch,
							})
						: undefined
				}
				onSelect={(voice) => {
					if (!voicePickerSpeaker) return;
					handleVoiceChange({
						speakerId: voicePickerSpeaker.id,
						selected: voice,
					});
					toast.success(`Đã chọn ${voice.name} cho ${voicePickerSpeaker.name}`);
				}}
			/>
			<div className="shrink-0 border-b px-3 py-3">
				<div className="flex items-center gap-2">
					<div className="flex size-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
						<Volume2 className="size-4" />
					</div>
					<div>
						<h2 className="text-sm font-semibold">Thuyết minh</h2>
						<p className="text-[10px] text-muted-foreground">
							Phân vai, tạo giọng và khớp chính xác từng cue.
						</p>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
				<div className="grid grid-cols-2 rounded-lg border bg-muted/25 p-1">
					<Button
						size="sm"
						variant={narration.mode === "single" ? "secondary" : "ghost"}
						className="h-8 text-[11px]"
						onClick={() => narration.setMode("single")}
					>
						<Volume2 className="size-3" /> Một giọng
					</Button>
					<Button
						size="sm"
						variant={narration.mode === "roles" ? "secondary" : "ghost"}
						className="h-8 text-[11px]"
						onClick={() => narration.setMode("roles")}
					>
						<Users className="size-3" /> Phân vai
					</Button>
				</div>

				<section className="space-y-2 rounded-lg border p-2.5">
					<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
						<Users className="size-3 text-amber-500" /> Phân vai giọng đọc
					</div>
					{narrationCues.length > 0 && (
						<p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[9px] text-emerald-600 dark:text-emerald-400">
							Đã tự động nạp {narrationCues.length} cue từ{" "}
							{narrationCueSource.source === "timeline"
								? "phụ đề trên timeline"
								: "bước nhận dạng"}
							.
						</p>
					)}
					{narrationCues.length === 0 && (
						<p className="rounded-md bg-muted p-2 text-[10px] text-muted-foreground">
							Chưa có cue. Hãy chạy nhận dạng hoặc nhập SRT trước.
						</p>
					)}
					{speakers.map((speaker) => {
						const selected = speakerSettings(speaker.id);
						const selectedCatalogId = voiceKey({
							provider: selected.provider,
							voiceId: selected.voiceId,
						});
						const selectedVoice = voices.find(
							(voice) => voice.id === selectedCatalogId,
						);
						return (
							<div
								key={speaker.id}
								className="space-y-2 rounded-md border bg-card p-2"
							>
								<div className="flex items-center gap-2 text-[10px]">
									<span
										className="size-2.5 rounded-full"
										style={{ backgroundColor: speaker.color }}
									/>
									<strong className="truncate text-[11px]">
										{speaker.name}
									</strong>
									<span className="ml-auto text-muted-foreground">
										{speaker.cues.length} câu ·{" "}
										{durationLabel(speaker.duration)}
									</span>
								</div>
								<Button
									variant="outline"
									className="h-10 w-full justify-start gap-2 px-2.5"
									aria-label={`Chọn giọng cho ${speaker.name}`}
									disabled={loadingVoices || voices.length === 0}
									onClick={() => setVoicePickerSpeakerId(speaker.id)}
								>
									<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
										<Volume2 className="size-3.5" />
									</div>
									<div className="min-w-0 flex-1 text-left">
										<span className="block truncate text-[11px] font-semibold">
											{loadingVoices
												? "Đang tải kho giọng..."
												: (selectedVoice?.name ?? "Chọn giọng đọc")}
										</span>
										{selectedVoice && (
											<span className="block truncate text-[9px] font-normal text-muted-foreground">
												{selectedVoice.provider} · {selectedVoice.lang}
											</span>
										)}
									</div>
									<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
								</Button>
								{narration.mode === "roles" && (
									<div className="grid grid-cols-2 gap-3 rounded-md bg-muted/35 p-2">
										<div>
											<div className="mb-1 flex justify-between text-[9px]">
												<span>Tốc độ</span>
												<span>{selected.speed.toFixed(2)}×</span>
											</div>
											<Slider
												min={0.5}
												max={2}
												step={0.05}
												value={[selected.speed]}
												onValueChange={([value]) => {
													// A manual speed and exact automatic duration are mutually
													// exclusive. Moving the slider explicitly selects manual mode.
													narration.setAutoMatchDuration(false);
													updateSpeaker({
														speakerId: speaker.id,
														partial: { speed: value },
													});
												}}
											/>
										</div>
										<div>
											<div className="mb-1 flex justify-between text-[9px]">
												<span>Tone</span>
												<span>
													{selected.pitch > 0 ? "+" : ""}
													{selected.pitch} st
												</span>
											</div>
											<Slider
												min={-6}
												max={6}
												step={1}
												value={[selected.pitch]}
												onValueChange={([value]) =>
													updateSpeaker({
														speakerId: speaker.id,
														partial: { pitch: value },
													})
												}
											/>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</section>

				<section className="space-y-3 rounded-lg border p-2.5">
					<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
						<SlidersHorizontal className="size-3 text-amber-500" /> Tham số
						giọng đọc
					</div>
					<div className="flex items-center justify-between gap-3 rounded-md border p-2">
						<div>
							<p className="text-[10px] font-medium">Tự động khớp thời lượng</p>
							<p className="text-[9px] text-muted-foreground">
								Đổi tốc độ đọc, giữ nguyên cao độ và kết thúc đúng cue
							</p>
						</div>
						<Switch
							aria-label="Tự động khớp thời lượng"
							checked={narration.autoMatchDuration}
							onCheckedChange={narration.setAutoMatchDuration}
						/>
					</div>
					{narration.mode === "single" && (
						<div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-2">
							<div>
								<div className="mb-1 flex justify-between text-[9px]">
									<span>Tốc độ tay</span>
									<span>{narration.globalSpeed.toFixed(2)}×</span>
								</div>
								<Slider
									min={0.5}
									max={2}
									step={0.05}
									value={[narration.globalSpeed]}
									onValueChange={([value]) => {
										narration.setAutoMatchDuration(false);
										narration.setGlobalSpeed(value);
									}}
								/>
							</div>
							<div>
								<div className="mb-1 flex justify-between text-[9px]">
									<span>Tone giọng</span>
									<span>
										{narration.globalPitch > 0 ? "+" : ""}
										{narration.globalPitch} st
									</span>
								</div>
								<Slider
									min={-6}
									max={6}
									step={1}
									value={[narration.globalPitch]}
									onValueChange={([value]) => narration.setGlobalPitch(value)}
								/>
							</div>
						</div>
					)}
					<div className="flex items-center justify-between gap-3 rounded-md border p-2">
						<div>
							<p className="text-[10px] font-medium">
								Rà khớp thời lượng sau khi tạo
							</p>
							<p className="text-[9px] text-muted-foreground">
								Báo câu phải tăng/giảm tốc quá nhiều
							</p>
						</div>
						<Switch
							aria-label="Rà khớp thời lượng sau khi tạo"
							checked={narration.reviewAfterGeneration}
							onCheckedChange={narration.setReviewAfterGeneration}
						/>
					</div>
				</section>

				<section className="space-y-2 rounded-lg border p-2.5">
					<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
						<Gauge className="size-3 text-amber-500" /> Hiệu năng máy
					</div>
					<div className="grid grid-cols-3 gap-1.5">
						{PERFORMANCE_OPTIONS.map((option) => (
							<button
								type="button"
								key={option.id}
								onClick={() => narration.setPerformance(option.id)}
								className={cn(
									"rounded-md border p-2 text-center transition-colors",
									narration.performance === option.id
										? "border-amber-500 bg-amber-500/10 text-amber-500"
										: "hover:bg-muted",
								)}
							>
								<span className="block text-[10px] font-medium">
									{option.name}
								</span>
								<span className="block text-[9px]">{option.multiplier}</span>
							</button>
						))}
					</div>
					<p className="text-[9px] text-muted-foreground">
						{
							PERFORMANCE_OPTIONS.find(
								(option) => option.id === narration.performance,
							)?.detail
						}
						. Chỉ ảnh hưởng số câu xử lý đồng thời, không giảm chất lượng giọng.
					</p>
				</section>

				{narration.results.length > 0 && (
					<section className="space-y-1.5 rounded-lg border p-2.5">
						<div className="text-[10px] font-semibold uppercase tracking-wide">
							Rà soát thời lượng
						</div>
						{narration.results.map((result, index) => (
							<div
								key={result.cueId}
								className="flex items-center gap-2 rounded-md bg-muted/35 px-2 py-1.5 text-[9px]"
							>
								{result.status === "matched" ? (
									<CheckCircle2 className="size-3 text-emerald-500" />
								) : (
									<AlertTriangle
										className={cn(
											"size-3",
											result.status === "error"
												? "text-red-500"
												: "text-amber-500",
										)}
									/>
								)}
								<span>Câu {index + 1}</span>
								<span className="ml-auto">
									{result.rawDuration.toFixed(2)}s →{" "}
									{result.targetDuration.toFixed(2)}s ·{" "}
									{result.playbackRate.toFixed(2)}×
								</span>
							</div>
						))}
					</section>
				)}
			</div>

			<div className="shrink-0 border-t p-3">
				{isGenerating && (
					<div className="mb-2 space-y-1">
						<Progress value={progress} className="h-1.5" />
						<p className="text-center text-[9px] text-muted-foreground">
							Đang tạo và khớp giọng… {progress}%
						</p>
					</div>
				)}
				<Button
					className="h-10 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400"
					disabled={
						isGenerating || narrationCues.length === 0 || voices.length === 0
					}
					onClick={handleGenerateAll}
				>
					<WandSparkles className="size-4" />{" "}
					{isGenerating ? "Đang tạo giọng…" : "Tạo giọng cho tất cả"}
				</Button>
			</div>
		</div>
	);
}
