"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Loader2, AudioLines, Volume2, Sparkles, AlertTriangle, CheckCircle2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/hooks/use-editor";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import { formatTimeCode } from "@/lib/time";
import {
	applyVoiceReductionToSourceClips,
	createDuckedSourceAudio,
	createMusicStemAudio,
	findTargetVideoInfo,
	forceExtractOriginalSourceAudio,
	hasSourceAudioClips,
} from "@/dubbing/adapters/source-audio";
import {
	refreshNarrationDuck,
	syncNarrationSourceAudio,
} from "@/dubbing/adapters/source-audio-sync";
import { collectNarrationDuckWindows } from "@/dubbing/services/duck-envelope";
import { dbToLinear } from "@/dubbing/adapters/narration-insert";
import { cn } from "@/utils/ui";

export function VoiceReductionToolbarControl() {
	const editor = useEditor();
	const { settings, updateSettings } = useDubbingStore();
	const [isOpen, setIsOpen] = useState(false);
	const [isExtractingSource, setIsExtractingSource] = useState(false);
	const [isIsolatingVoice, setIsIsolatingVoice] = useState(false);
	const [isMixing, setIsMixing] = useState(false);
	const mixTimer = useRef<number | null>(null);

	// Track timeline selection so we detect whenever user clicks a video clip
	const selectedElements = useSyncExternalStore(
		(listener) => editor.selection.subscribe(listener),
		() => editor.selection.getSelectedElements(),
	);

	const targetIds = useMemo(
		() => selectedElements.map((el) => el.elementId),
		[selectedElements],
	);

	const targetInfo = useMemo(() => {
		return findTargetVideoInfo({
			editor,
			targetElementIds: targetIds,
		});
	}, [editor, targetIds, isOpen]);

	// Per-clip gain state: if a single clip is selected, prioritize its specific gains
	const [clipMusicGain, setClipMusicGain] = useState<number | null>(null);
	const [clipVocalGain, setClipVocalGain] = useState<number | null>(null);

	useEffect(() => {
		if (targetInfo.isSingleVideo) {
			setClipMusicGain(
				targetInfo.musicGain ?? settings.stemMusicVolume ?? 1,
			);
			setClipVocalGain(
				targetInfo.vocalGain ?? settings.stemVocalVolume ?? 0,
			);
		} else {
			setClipMusicGain(null);
			setClipVocalGain(null);
		}
	}, [
		targetInfo.targetName,
		targetInfo.startTime,
		targetInfo.musicGain,
		targetInfo.vocalGain,
		targetInfo.isSingleVideo,
	]);

	const musicGain = clipMusicGain ?? settings.stemMusicVolume ?? 1;
	const vocalGain = clipVocalGain ?? settings.stemVocalVolume ?? 0;
	const isProcessing = isExtractingSource || isIsolatingVoice;

	const runSourceSync = async ({
		next,
		announceExtract = true,
		isolating = false,
	}: {
		next: typeof settings;
		announceExtract?: boolean;
		isolating?: boolean;
	}): Promise<void> => {
		const alreadyHasStem = hasSourceAudioClips({
			tracks: editor.timeline.getTracks(),
		});
		if (!alreadyHasStem) setIsExtractingSource(true);
		if (isolating) setIsIsolatingVoice(true);
		const toastId = isolating
			? "source-audio-isolate"
			: announceExtract
				? "source-audio-extract"
				: null;
		if (toastId) {
			toast.loading(
				isolating
					? "Đang gỡ giọng gốc, giữ nhạc nền…"
					: "Đang trích xuất âm thanh video gốc…",
				{ id: toastId },
			);
		}
		try {
			await syncNarrationSourceAudio({
				editor,
				settings: next,
			});
			if (toastId) {
				if (isolating) {
					toast.success("Đã tách nhạc nền và giọng gốc.", { id: toastId });
				} else {
					toast.dismiss(toastId);
				}
			}
		} catch (error) {
			const errorMsg =
				error instanceof Error
					? error.message
					: isolating
						? "Không tách được giọng khỏi nhạc."
						: "Không tách được âm thanh video gốc.";
			if (toastId) {
				toast.error(errorMsg, { id: toastId });
			} else {
				toast.error(errorMsg);
			}
			throw error;
		} finally {
			if (!alreadyHasStem) setIsExtractingSource(false);
			if (isolating) setIsIsolatingVoice(false);
		}
	};

	const handleToggle = async (checked: boolean) => {
		const previous = settings.voiceReductionEnabled;
		const next = {
			...settings,
			voiceReductionEnabled: checked,
		};
		updateSettings({ voiceReductionEnabled: checked });
		try {
			await runSourceSync({
				next,
				announceExtract: checked,
				isolating: checked,
			});
		} catch {
			updateSettings({ voiceReductionEnabled: previous });
		}
	};

	const applyMix = (nextMusic: number, nextVocal: number) => {
		if (!settings.voiceReductionEnabled && !targetInfo.hasStemOnTimeline) return;
		if (mixTimer.current !== null) {
			window.clearTimeout(mixTimer.current);
		}
		setIsMixing(true);
		mixTimer.current = window.setTimeout(() => {
			mixTimer.current = null;
			void applyVoiceReductionToSourceClips({
				editor,
				musicGain: nextMusic,
				vocalGain: nextVocal,
				targetElementIds: targetIds.length > 0 ? targetIds : undefined,
			})
				.then(() => {
					editor.audio.refreshScheduledClips();
				})
				.catch((error) => {
					toast.error(
						error instanceof Error
							? error.message
							: "Không chỉnh được âm lượng stem.",
					);
				})
				.finally(() => {
					setIsMixing(false);
				});
		}, 250);
	};

	const handleMusicChange = (value: number) => {
		if (targetInfo.isSingleVideo) {
			setClipMusicGain(value);
		}
		updateSettings({ stemMusicVolume: value });
	};

	const handleVocalChange = (value: number) => {
		if (targetInfo.isSingleVideo) {
			setClipVocalGain(value);
		}
		updateSettings({ stemVocalVolume: value });
	};

	const handleGenerateVocalAudio = async () => {
		updateSettings({ voiceReductionEnabled: true });
		setIsIsolatingVoice(true);
		const targetLabel = targetInfo.isSingleVideo
			? `clip "${targetInfo.targetName}"`
			: `${targetInfo.videoCount} video`;
		const toastId = "music-stem-extract";
		toast.loading(
			`Đang tách nhạc nền cho ${targetLabel} & đưa vào timeline...`,
			{ id: toastId },
		);
		try {
			await createMusicStemAudio({
				editor,
				musicGain,
				vocalGain,
				targetElementIds: targetIds.length > 0 ? targetIds : undefined,
			});
			editor.audio.refreshScheduledClips();
			toast.success(
				`Đã tạo track nhạc nền cho ${targetLabel} thành công!`,
				{ id: toastId },
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể tạo nhạc nền.",
				{ id: toastId },
			);
		} finally {
			setIsIsolatingVoice(false);
		}
	};

	useEffect(() => {
		return () => {
			if (mixTimer.current !== null) {
				window.clearTimeout(mixTimer.current);
			}
		};
	}, []);

	const triggerButton = (
		<PopoverTrigger asChild>
			<Button
				variant={settings.voiceReductionEnabled ? "secondary" : "text"}
				size="icon"
				type="button"
				onMouseDown={(e) => e.stopPropagation()}
				className={cn(
					"relative rounded-sm transition-colors",
					settings.voiceReductionEnabled &&
						"border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25",
					isProcessing && "animate-pulse",
				)}
			>
				{isProcessing ? (
					<Loader2 className="size-4 animate-spin text-amber-500" />
				) : (
					<AudioLines className="size-4" />
				)}
				{settings.voiceReductionEnabled && (
					<span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-500 ring-2 ring-background" />
				)}
			</Button>
		</PopoverTrigger>
	);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			{isOpen ? (
				triggerButton
			) : (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
					<TooltipContent>
						{settings.voiceReductionEnabled
							? `Vocal Remover: nhạc ${Math.round(musicGain * 100)}% · giọng ${Math.round(vocalGain * 100)}%`
							: "Vocal Remover — tách nhạc nền và giọng gốc"}
					</TooltipContent>
				</Tooltip>
			)}

			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-84 p-4 space-y-3 shadow-xl border bg-popover z-50"
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-0.5">
						<div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
							<AudioLines className="size-4 text-amber-500" />
							<span>Vocal Remover (Tách nhạc nền)</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							Tách nhạc nền và giọng gốc theo từng clip đã chọn trên timeline.
						</p>
					</div>
				</div>

				{/* Target clip indicator badge */}
				<div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px]">
					<Film className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
					<div className="truncate flex-1 text-xs">
						{targetInfo.isSingleVideo ? (
							<div className="flex items-center justify-between gap-1">
								<span className="font-medium text-foreground truncate">
									Clip: <span className="text-amber-600 dark:text-amber-400 font-semibold">{targetInfo.targetName}</span>
								</span>
								{targetInfo.startTime !== undefined && targetInfo.duration !== undefined && (
									<span className="text-[10px] text-muted-foreground font-mono shrink-0">
										{formatTimeCode({ timeInSeconds: targetInfo.startTime, format: "MM:SS" })} - {formatTimeCode({ timeInSeconds: targetInfo.startTime + targetInfo.duration, format: "MM:SS" })}
									</span>
								)}
							</div>
						) : (
							<div className="flex items-center justify-between gap-1">
								<span className="text-muted-foreground truncate">
									Áp dụng: <span className="font-medium text-foreground">{targetInfo.targetName}</span>
								</span>
								<span className="text-[10px] text-muted-foreground/80 italic shrink-0">
									(Chọn 1 clip để chỉnh riêng)
								</span>
							</div>
						)}
					</div>
				</div>

				{isProcessing && (
					<div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
						<Loader2 className="size-4 animate-spin shrink-0" />
						<div className="space-y-0.5">
							<p className="font-medium">Đang tách nhạc nền và giọng gốc...</p>
							<p className="text-[10px] text-muted-foreground">
								Chỉ chạy một lần cho mỗi clip, sau đó chỉnh fader tự do
							</p>
						</div>
					</div>
				)}

				<div className="space-y-3 rounded-lg border p-3 bg-muted/40 border-border">
					<div className="space-y-1.5">
						<div className="flex items-center justify-between text-xs">
							<span className="font-medium text-emerald-600 dark:text-emerald-400">
								Music
							</span>
							<span className="font-mono text-[11px] tabular-nums">
								{Math.round(musicGain * 100)}%
							</span>
						</div>
						<Slider
							min={0}
							max={1}
							step={0.05}
							disabled={isProcessing}
							value={[musicGain]}
							onValueChange={([val]) => handleMusicChange(val)}
							className="[&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
						/>
					</div>
					<div className="space-y-1.5">
						<div className="flex items-center justify-between text-xs">
							<div className="flex items-center gap-1.5">
								<span className="font-medium text-violet-600 dark:text-violet-400">
									Vocal
								</span>
								{isMixing && (
									<Loader2 className="size-3 animate-spin text-violet-500" />
								)}
							</div>
							<span className="font-mono text-[11px] tabular-nums">
								{Math.round(vocalGain * 100)}%
							</span>
						</div>
						<Slider
							min={0}
							max={1}
							step={0.05}
							disabled={isProcessing}
							value={[vocalGain]}
							onValueChange={([val]) => handleVocalChange(val)}
							className="[&_[data-slot=slider-range]]:bg-violet-500 [&_[data-slot=slider-thumb]]:border-violet-500"
						/>
					</div>
				</div>

				<div className="pt-0.5">
					<Button
						variant="default"
						size="sm"
						type="button"
						disabled={isProcessing || targetInfo.videoCount === 0}
						onClick={handleGenerateVocalAudio}
						className="w-full text-xs h-8.5 gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-sm cursor-pointer"
					>
						{isProcessing ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<AudioLines className="size-3.5" />
						)}
						<span>
							{targetInfo.isSingleVideo
								? `Tạo nhạc nền cho Clip này`
								: `Tạo nhạc nền & Đưa vào Timeline`}
						</span>
					</Button>
				</div>

				<div className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
					<Sparkles className="size-3 text-amber-500 shrink-0" />
					<span>Kéo Vocal lên nếu muốn giữ lại giọng gốc. Bấm nút để đưa vào timeline.</span>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function AutoDuckingToolbarControl() {
	const editor = useEditor();
	const { settings, updateSettings } = useDubbingStore();
	const [isOpen, setIsOpen] = useState(false);
	const [isExtractingSource, setIsExtractingSource] = useState(false);

	const tracks = editor.timeline.getTracks();
	const ttsWindows = collectNarrationDuckWindows({ tracks });
	const hasTts = ttsWindows.length > 0;

	// Base video volume (when no TTS is speaking)
	const baseVolumeLinear = dbToLinear({ db: settings.sourceVolume ?? 0 });
	const baseVolumePercent = Math.round(baseVolumeLinear * 100);

	// Ducking volume (when TTS is speaking)
	const duckingVolume = settings.duckingVolume ?? 0.15;
	const duckingPercent = Math.round(duckingVolume * 100);

	const handleToggle = async (checked: boolean) => {
		const previous = settings.autoDucking;
		const next = { ...settings, autoDucking: checked };
		updateSettings({ autoDucking: checked });

		if (checked && !hasTts) {
			toast.warning(
				"Chưa phát hiện giọng đọc TTS trên timeline. Hiệu ứng hạ âm sẽ tự động kích hoạt khi có câu thuyết minh.",
			);
		}

		if (checked) {
			const alreadyHasStem = hasSourceAudioClips({
				tracks: editor.timeline.getTracks(),
			});
			if (!alreadyHasStem) setIsExtractingSource(true);
			try {
				await syncNarrationSourceAudio({ editor, settings: next });
			} catch (error) {
				updateSettings({ autoDucking: previous });
				toast.error(
					error instanceof Error
						? error.message
						: "Không tách được âm thanh video gốc.",
				);
				return;
			} finally {
				if (!alreadyHasStem) setIsExtractingSource(false);
			}
		}
		refreshNarrationDuck({
			editor,
			settings: {
				sourceVolume: settings.sourceVolume,
				ttsVolume: settings.ttsVolume,
			},
		});
	};

	const handleBaseVolumeChange = (linearVal: number) => {
		const clamped = Math.min(1, Math.max(0, linearVal));
		const db = clamped <= 0 ? -60 : Math.round(20 * Math.log10(clamped));
		updateSettings({ sourceVolume: db });
		refreshNarrationDuck({
			editor,
			settings: {
				sourceVolume: db,
				ttsVolume: settings.ttsVolume,
			},
		});
	};

	const handleDuckingVolumeChange = (value: number) => {
		updateSettings({ duckingVolume: value, autoDucking: true });
		refreshNarrationDuck({
			editor,
			settings: {
				sourceVolume: settings.sourceVolume,
				ttsVolume: settings.ttsVolume,
			},
		});
	};

	const attackMs = settings.duckAttackMs ?? 150;
	const releaseMs = settings.duckReleaseMs ?? 400;

	const handleAttackChange = (value: number) => {
		updateSettings({ duckAttackMs: value, autoDucking: true });
		try {
			editor.audio.refreshScheduledClips();
		} catch {}
	};

	const handleReleaseChange = (value: number) => {
		updateSettings({ duckReleaseMs: value, autoDucking: true });
		try {
			editor.audio.refreshScheduledClips();
		} catch {}
	};

	const handleGenerateDuckingAudio = async () => {
		updateSettings({ autoDucking: true });
		const next = { ...settings, autoDucking: true };
		setIsExtractingSource(true);
		const toastId = "ducking-audio-generate";
		toast.loading(
			"Đang tạo âm thanh hạ âm từ video gốc & đưa vào timeline...",
			{ id: toastId },
		);
		try {
			await createDuckedSourceAudio({ editor, settings: next });
			toast.success(
				"Đã tạo âm thanh hạ âm từ video gốc đưa vào timeline thành công!",
				{ id: toastId },
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Không thể tạo âm thanh hạ âm.",
				{ id: toastId },
			);
		} finally {
			setIsExtractingSource(false);
		}
	};

	const handleDisableDucking = () => {
		updateSettings({ autoDucking: false });
		try {
			editor.audio.refreshScheduledClips();
		} catch {}
		toast.success("Đã tắt chế độ hạ âm (Giữ nguyên âm lượng gốc/nhạc nền 100%).");
	};

	const handleReExtractSourceAudio = async () => {
		setIsExtractingSource(true);
		const toastId = "re-extract-source-audio";
		toast.loading(
			"Đang trích xuất lại âm thanh video gốc (chuẩn tần số mẫu 100%)...",
			{ id: toastId },
		);
		try {
			await forceExtractOriginalSourceAudio({ editor });
			toast.success(
				"Đã trích xuất lại âm thanh video gốc thành công (Đúng tone 100%).",
				{ id: toastId },
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Không thể trích xuất âm thanh video.",
				{ id: toastId },
			);
		} finally {
			setIsExtractingSource(false);
		}
	};

	const triggerButton = (
		<PopoverTrigger asChild>
			<Button
				variant={settings.autoDucking ? "secondary" : "text"}
				size="icon"
				type="button"
				onMouseDown={(e) => e.stopPropagation()}
				className={cn(
					"relative rounded-sm transition-colors",
					settings.autoDucking &&
						"border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25",
					isExtractingSource && "animate-pulse",
				)}
			>
				{isExtractingSource ? (
					<Loader2 className="size-4 animate-spin text-blue-500" />
				) : (
					<Volume2 className="size-4" />
				)}
				{settings.autoDucking && (
					<span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-blue-500 ring-2 ring-background" />
				)}
			</Button>
		</PopoverTrigger>
	);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			{isOpen ? (
				triggerButton
			) : (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
					<TooltipContent>
						{settings.autoDucking
							? `Tự động hạ âm video: nền ${baseVolumePercent}% · khi đọc ${duckingPercent}% (Đang bật)`
							: "Tự động hạ âm video khi TTS đọc (Auto Ducking)"}
					</TooltipContent>
				</Tooltip>
			)}

			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-92 p-4 space-y-3.5 shadow-xl border bg-popover z-50"
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
							<Volume2 className="size-4 text-blue-500" />
							<span>Tự động hạ âm video (Auto Ducking)</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							Chỉnh các mức âm lượng & Fade, sau đó bấm nút để tạo audio hạ âm đưa vào timeline.
						</p>
					</div>
				</div>

				{/* TTS Cue status notification */}
				{hasTts ? (
					<div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
						<CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
						<span>
							Đã nhận diện <strong>{ttsWindows.length}</strong> đoạn TTS (khớp cue tự động)
						</span>
					</div>
				) : (
					<div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
						<AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
						<span>Chưa có giọng đọc TTS trên timeline (Tạo ở tab Thuyết minh)</span>
					</div>
				)}

				{isExtractingSource && (
					<div className="flex items-center gap-2 rounded-md bg-blue-500/10 border border-blue-500/20 p-2.5 text-[11px] text-blue-600 dark:text-blue-400">
						<Loader2 className="size-4 animate-spin shrink-0" />
						<span>Đang chuẩn bị âm thanh video gốc...</span>
					</div>
				)}

				{/* 2 Volume streams */}
				<div className="space-y-3.5 rounded-lg border p-3 bg-muted/40 border-border">
					{/* Stream 1: Base volume when no TTS is speaking */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground font-medium">
								Âm lượng video khi <strong className="text-foreground">KHÔNG có TTS</strong>:
							</span>
							<span className="font-bold text-foreground font-mono bg-background border px-1.5 py-0.5 rounded text-[11px]">
								{baseVolumePercent}%
							</span>
						</div>

						<Slider
							min={0}
							max={1}
							step={0.01}
							disabled={isExtractingSource}
							value={[baseVolumeLinear]}
							onValueChange={([val]) => handleBaseVolumeChange(val)}
							className="[&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
						/>

						<div className="flex items-center justify-between gap-1.5 pt-0.5">
							{[
								{ label: "50%", value: 0.5 },
								{ label: "80%", value: 0.8 },
								{ label: "100% (Gốc)", value: 1.0 },
							].map((preset) => {
								const isSelected =
									Math.abs(baseVolumeLinear - preset.value) < 0.03;
								return (
									<button
										key={preset.label}
										type="button"
										disabled={isExtractingSource}
										onClick={() => handleBaseVolumeChange(preset.value)}
										className={cn(
											"flex-1 rounded px-1.5 py-0.5 text-[10px] transition-colors border",
											isSelected
												? "bg-emerald-500 text-white font-semibold border-emerald-600 shadow-sm"
												: "bg-background hover:bg-muted text-muted-foreground border-border",
										)}
									>
										{preset.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="border-t border-border/60" />

					{/* Stream 2: Ducked volume when TTS is speaking */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground font-medium">
								Âm lượng video khi <strong className="text-blue-600 dark:text-blue-400">CÓ TTS đọc</strong>:
							</span>
							<span className="font-bold text-blue-600 dark:text-blue-400 font-mono bg-background border px-1.5 py-0.5 rounded text-[11px]">
								{duckingPercent}%
							</span>
						</div>

						<Slider
							min={0}
							max={1}
							step={0.01}
							disabled={isExtractingSource}
							value={[duckingVolume]}
							onValueChange={([val]) => handleDuckingVolumeChange(val)}
							className="[&_[data-slot=slider-range]]:bg-blue-500 [&_[data-slot=slider-thumb]]:border-blue-500"
						/>

						<div className="flex items-center justify-between gap-1.5 pt-0.5">
							{[
								{ label: "10%", value: 0.1 },
								{ label: "15% (Chuẩn)", value: 0.15 },
								{ label: "30%", value: 0.3 },
								{ label: "50%", value: 0.5 },
							].map((preset) => {
								const isSelected =
									Math.abs(duckingVolume - preset.value) < 0.02;
								return (
									<button
										key={preset.label}
										type="button"
										disabled={isExtractingSource}
										onClick={() => handleDuckingVolumeChange(preset.value)}
										className={cn(
											"flex-1 rounded px-1.5 py-0.5 text-[10px] transition-colors border",
											isSelected
												? "bg-blue-500 text-white font-semibold border-blue-600 shadow-sm"
												: "bg-background hover:bg-muted text-muted-foreground border-border",
										)}
									>
										{preset.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="border-t border-border/60" />

					{/* Fade in & Fade out controls */}
					<div className="grid grid-cols-2 gap-3">
						{/* Fade in (Attack) */}
						<div className="space-y-1">
							<div className="flex items-center justify-between text-[11px]">
								<span className="text-muted-foreground font-medium">Fade In (Hạ âm):</span>
								<span className="font-mono text-foreground font-semibold text-[10px] bg-background border px-1 py-0.2 rounded">
									{attackMs} ms
								</span>
							</div>
							<Slider
								min={20}
								max={1000}
								step={10}
								disabled={isExtractingSource}
								value={[attackMs]}
								onValueChange={([val]) => handleAttackChange(val)}
								className="[&_[data-slot=slider-range]]:bg-indigo-500 [&_[data-slot=slider-thumb]]:border-indigo-500"
							/>
							<div className="flex items-center justify-between gap-1 pt-0.5">
								{[
									{ label: "50ms", val: 50 },
									{ label: "150ms", val: 150 },
									{ label: "300ms", val: 300 },
								].map((p) => (
									<button
										key={p.label}
										type="button"
										onClick={() => handleAttackChange(p.val)}
										className={cn(
											"flex-1 text-[9px] py-0.5 rounded border transition-colors",
											Math.abs(attackMs - p.val) < 15
												? "bg-indigo-500 text-white font-medium border-indigo-600"
												: "bg-background hover:bg-muted text-muted-foreground border-border",
										)}
									>
										{p.label}
									</button>
								))}
							</div>
						</div>

						{/* Fade out (Release) */}
						<div className="space-y-1">
							<div className="flex items-center justify-between text-[11px]">
								<span className="text-muted-foreground font-medium">Fade Out (Hồi âm):</span>
								<span className="font-mono text-foreground font-semibold text-[10px] bg-background border px-1 py-0.2 rounded">
									{releaseMs} ms
								</span>
							</div>
							<Slider
								min={50}
								max={2000}
								step={25}
								disabled={isExtractingSource}
								value={[releaseMs]}
								onValueChange={([val]) => handleReleaseChange(val)}
								className="[&_[data-slot=slider-range]]:bg-indigo-500 [&_[data-slot=slider-thumb]]:border-indigo-500"
							/>
							<div className="flex items-center justify-between gap-1 pt-0.5">
								{[
									{ label: "200ms", val: 200 },
									{ label: "400ms", val: 400 },
									{ label: "800ms", val: 800 },
								].map((p) => (
									<button
										key={p.label}
										type="button"
										onClick={() => handleReleaseChange(p.val)}
										className={cn(
											"flex-1 text-[9px] py-0.5 rounded border transition-colors",
											Math.abs(releaseMs - p.val) < 25
												? "bg-indigo-500 text-white font-medium border-indigo-600"
												: "bg-background hover:bg-muted text-muted-foreground border-border",
										)}
									>
										{p.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				<div className="space-y-1.5 pt-0.5">
					<Button
						variant="default"
						size="sm"
						type="button"
						disabled={isExtractingSource}
						onClick={handleGenerateDuckingAudio}
						className="w-full text-xs h-8.5 gap-1.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
					>
						{isExtractingSource ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Sparkles className="size-3.5" />
						)}
						<span>Tạo âm thanh hạ âm & Đưa vào Timeline</span>
					</Button>

					{settings.autoDucking && (
						<Button
							variant="secondary"
							size="sm"
							type="button"
							onClick={handleDisableDucking}
							className="w-full text-[11px] h-7 gap-1.5 font-medium border text-muted-foreground hover:text-foreground"
						>
							<span>Tắt chế độ hạ âm (Giữ nguyên âm lượng)</span>
						</Button>
					)}

					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={isExtractingSource}
						onClick={handleReExtractSourceAudio}
						className="w-full text-[11px] h-7 gap-1.5 font-medium border-blue-500/30 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
					>
						{isExtractingSource ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Volume2 className="size-3.5" />
						)}
						<span>Trích xuất lại âm thanh video (Fix tone)</span>
					</Button>
				</div>

				<div className="text-[10px] text-muted-foreground/80 leading-tight">
					Tự động chuyển âm lượng mượt mà theo thời gian Fade In ({attackMs} ms) và Fade Out ({releaseMs} ms). Các câu TTS gối nhau sẽ tự động gộp liền mạch.
				</div>
			</PopoverContent>
		</Popover>
	);
}
