"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/hooks/use-editor";
import {
	insertCaptionChunksAsTextTrack,
	removeGeneratedCjkCaptionTracks,
} from "@/dubbing/adapters/captions";
import {
	CheckmarkCircle01Icon,
	ClosedCaptionIcon,
	Delete02Icon,
	Download01Icon,
	Settings01Icon,
	SparklesIcon,
	TranslateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { z } from "zod";
import { useDubbingStore } from "../dubbing-store";
import {
	useTranslationStore,
	type TranslationProvider,
} from "../translation-store";
import type { TranslationStylePreset } from "../translation-presets";
import { translateRecognitionCues } from "../services/translation-pipeline";
import {
	buildTranslatedTimelineCaptions,
	hasCompleteTranslations,
} from "../services/translated-timeline-captions";
import { SpeakerSelectDropdown } from "./speaker-select-dropdown";
import { syncCueTextToTimeline } from "../services/timeline-caption-sync";
import { mediaTimeFromSeconds } from "@/dubbing/adapters/time";
import { useTranscriptionSettingsStore } from "@/stores/transcription-settings-store";
import { useAISettingsStore } from "@/stores/ai-settings-store";
import { CueTimingSettingsButton } from "./cue-timing-settings";
import { SrtImportButton } from "./srt-import-button";
import { SpeakerRolePanel } from "./speaker-role-panel";
import { toast } from "sonner";

function getResolvedOpenRouterKey({
	openRouterApiKey,
}: {
	openRouterApiKey?: string;
}): string {
	if (openRouterApiKey?.trim()) return openRouterApiKey.trim();
	const transcriptionKey =
		useTranscriptionSettingsStore.getState().apiKey?.trim();
	if (transcriptionKey) return transcriptionKey;
	const aiState = useAISettingsStore.getState();
	if (aiState.imageApiKey?.trim()) return aiState.imageApiKey.trim();
	if (aiState.videoApiKey?.trim()) return aiState.videoApiKey.trim();
	return "";
}

const TARGET_LANGUAGES = [
	{ code: "vi", name: "Tiếng Việt (Vietnamese)" },
	{ code: "en", name: "English" },
	{ code: "zh", name: "中文 (Chinese)" },
	{ code: "ja", name: "日本語 (Japanese)" },
	{ code: "ko", name: "한국어 (Korean)" },
	{ code: "es", name: "Español (Spanish)" },
	{ code: "fr", name: "Français (French)" },
	{ code: "de", name: "Deutsch (German)" },
] as const;

const modelsResponseSchema = z.object({
	models: z.array(z.string()).optional(),
});

const errorResponseSchema = z
	.object({ error: z.string().optional() })
	.passthrough();

function createStyleDraft(
	style?: TranslationStylePreset,
): TranslationStylePreset {
	return style
		? { ...style }
		: { id: `custom-${Date.now()}`, name: "Phong cách mới", prompt: "" };
}

export function TranslationView() {
	const editor = useEditor();
	const {
		extractedCues,
		speakerProfiles,
		setCues,
		settings,
	} = useDubbingStore();
	const {
		provider,
		openRouterApiKey,
		openRouterModel,
		customEndpoint,
		customApiKey,
		customModel,
		customModels,
		targetLanguage,
		styles,
		selectedStyleId,
		translations,
		setProvider,
		updateConfig,
		setSelectedStyleId,
		upsertStyle,
		deleteStyle,
		setTranslations,
		setTranslation,
		clearTranslations,
	} = useTranslationStore();

	const [isTranslating, setIsTranslating] = useState(false);
	const [isFetchingModels, setIsFetchingModels] = useState(false);
	const [isTestingConnection, setIsTestingConnection] = useState(false);
	const [testSuccessMessage, setTestSuccessMessage] = useState("");
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const [styleDialogOpen, setStyleDialogOpen] = useState(false);
	const [styleDraft, setStyleDraft] = useState<TranslationStylePreset>(() =>
		createStyleDraft(styles[0]),
	);
	const [appliedSuccess, setAppliedSuccess] = useState(false);
	const [appliedCaptionTrackId, setAppliedCaptionTrackId] = useState<
		string | null
	>(null);

	const resolvedOpenRouterKey = useMemo(
		() => getResolvedOpenRouterKey({ openRouterApiKey }),
		[openRouterApiKey],
	);
	const selectedStyle = useMemo(
		() => styles.find((style) => style.id === selectedStyleId),
		[styles, selectedStyleId],
	);
	const targetLanguageName =
		TARGET_LANGUAGES.find((language) => language.code === targetLanguage)
			?.name ?? targetLanguage;
	const activeApiKey =
		provider === "openrouter" ? resolvedOpenRouterKey : customApiKey;
	const activeModel = provider === "openrouter" ? openRouterModel : customModel;
	const canApplyToTimeline = hasCompleteTranslations({
		cues: extractedCues,
		translations,
	});

	const requestJson = async ({
		url,
		body,
	}: {
		url: string;
		body: unknown;
	}): Promise<unknown> => {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const parsedError = errorResponseSchema.safeParse(payload);
			throw new Error(parsedError.data?.error || `HTTP ${response.status}`);
		}
		return payload;
	};

	const handleTestConnection = async () => {
		setError("");
		setTestSuccessMessage("");
		if (!activeModel.trim()) {
			setError("Vui lòng nhập hoặc chọn Model trước khi kiểm tra.");
			return;
		}
		if (provider === "openrouter" && !activeApiKey) {
			setError(
				"Vui lòng nhập API Key OpenRouter (sk-or-v1-...) trước khi kiểm tra.",
			);
			return;
		}
		if (provider === "custom" && !customEndpoint.trim()) {
			setError("Vui lòng nhập API Endpoint cho Custom provider.");
			return;
		}

		setIsTestingConnection(true);
		setStatus("Đang gửi yêu cầu kiểm tra kết nối tới AI...");
		try {
			const res = await fetch("/api/translation/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					endpoint: provider === "custom" ? customEndpoint : undefined,
					apiKey: activeApiKey,
					model: activeModel,
				}),
			});
			const payload: { error?: string; message?: string } = await res.json();
			if (!res.ok) {
				throw new Error(payload.error || `HTTP ${res.status}`);
			}
			setTestSuccessMessage(
				`✓ ${payload.message || `Kết nối thành công tới ${activeModel}!`}`,
			);
			setStatus("");
		} catch (cause) {
			setError(
				cause instanceof Error
					? `Lỗi kết nối: ${cause.message}`
					: "Kiểm tra kết nối thất bại.",
			);
			setStatus("");
		} finally {
			setIsTestingConnection(false);
		}
	};

	const handleFetchModels = async () => {
		setError("");
		setStatus("Đang tải danh sách model...");
		setIsFetchingModels(true);
		try {
			const payload = modelsResponseSchema.parse(
				await requestJson({
					url: "/api/translation/models",
					body: {
						provider,
						endpoint: customEndpoint,
						apiKey: activeApiKey,
					},
				}),
			);
			const models = payload.models ?? [];
			if (models.length === 0) {
				throw new Error("Không tìm thấy model nào từ endpoint.");
			}
			updateConfig({ customModels: models });
			if (!customModel) updateConfig({ customModel: models[0] });
			setStatus(`Đã tải ${models.length} model.`);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Tải danh sách model thất bại.",
			);
			setStatus("");
		} finally {
			setIsFetchingModels(false);
			setError("");
		}
	};

	const handleTranslate = async () => {
		setError("");
		setTestSuccessMessage("");
		if (!extractedCues.length) {
			setError("Chưa có phụ đề. Hãy nhận dạng ASR/OCR trước khi dịch.");
			return;
		}
		if (!activeModel.trim()) {
			setError("Vui lòng nhập hoặc chọn model AI.");
			return;
		}
		const effectiveApiKey =
			provider === "openrouter" ? resolvedOpenRouterKey : customApiKey.trim();

		if (provider === "openrouter" && !effectiveApiKey) {
			setError(
				"Chưa có OpenRouter API key. Hãy nhập API key bên dưới để tiến hành dịch.",
			);
			return;
		}
		if (provider === "custom" && !customEndpoint.trim()) {
			setError("Vui lòng nhập API endpoint cho Custom provider.");
			return;
		}

		setIsTranslating(true);
		setProgress(0);
		setStatus("AI đang tự động phát hiện ngôn ngữ nguồn...");
		try {
			const allTranslations = await translateRecognitionCues({
				cues: extractedCues,
				speakerProfiles,
				config: {
					provider,
					endpoint: provider === "custom" ? customEndpoint : undefined,
					apiKey: effectiveApiKey,
					model: activeModel,
					targetLanguage,
					stylePrompt: selectedStyle?.prompt,
				},
				onProgress: ({ completed, total }) => {
					setStatus(`Đã dịch ${completed} / ${total} câu`);
					setProgress(Math.round((completed / total) * 100));
				},
			});
			setTranslations(allTranslations);

			const translationMap = new Map(
				allTranslations.map((item) => [item.id, item.text]),
			);
			setCues(
				extractedCues.map((cue) => ({
					id: cue.id,
					startTime: cue.startTime,
					endTime: cue.endTime,
					text: translationMap.get(cue.id) || cue.text,
					originalText: cue.text,
					translatedText: translationMap.get(cue.id) || cue.text,
					speaker: cue.speakerName || cue.speaker || "Speaker",
					status: "ready" as const,
				})),
			);
			setStatus(`Đã dịch xong ${extractedCues.length} câu.`);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Dịch phụ đề thất bại.",
			);
			setStatus("");
		} finally {
			setIsTranslating(false);
		}
	};

	const handleApplyToTimeline = () => {
		if (!editor || !canApplyToTimeline) return;
		try {
			removeGeneratedCjkCaptionTracks({ editor });
			const captions = buildTranslatedTimelineCaptions({
				cues: extractedCues,
				translations,
				timingOffsets: {
					cueLeadSeconds: settings.cueLeadSeconds,
					cueTailSeconds: settings.cueTailSeconds,
				},
				profiles: speakerProfiles,
			});
			// Re-applying a translation replaces the generated caption track so an
			// older source-language layer cannot remain in exported video.
			if (appliedCaptionTrackId) {
				editor.timeline.removeTrack({ trackId: appliedCaptionTrackId });
			}
			const trackId = insertCaptionChunksAsTextTrack({
				editor,
				captions,
			});
			setAppliedCaptionTrackId(trackId);
			setAppliedSuccess(true);
			toast.success(`Đã đưa ${captions.length} câu phụ đề vào Timeline.`);
			setTimeout(() => setAppliedSuccess(false), 2500);
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Đưa vào Timeline thất bại.",
			);
		}
	};

	const handleExportSrt = () => {
		const formatTime = (seconds: number) => {
			const totalMs = Math.max(0, Math.round(seconds * 1000));
			const hours = Math.floor(totalMs / 3_600_000);
			const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
			const secs = Math.floor((totalMs % 60_000) / 1000);
			const ms = totalMs % 1000;
			return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
		};
		const srt = extractedCues
			.map(
				(cue, index) =>
					`${index + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${translations[cue.id] || cue.text}\n`,
			)
			.join("\n");
		const url = URL.createObjectURL(
			new Blob([srt], { type: "text/plain;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `subtitles-${targetLanguage}.srt`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	const openStyleManager = (style?: TranslationStylePreset) => {
		setStyleDraft(createStyleDraft(style ?? selectedStyle));
		setStyleDialogOpen(true);
	};

	return (
		<div className="@container flex h-full flex-col overflow-hidden bg-background">
			<div className="flex shrink-0 items-center justify-between border-b bg-card/50 px-2 py-1.5">
				<div className="flex items-center gap-2">
					<div className="flex size-6 items-center justify-center rounded-md border border-violet-500/20 bg-violet-500/10 text-violet-500">
						<HugeiconsIcon icon={TranslateIcon} className="size-3.5" />
					</div>
					<div>
						<h2 className="text-sm font-semibold">Dịch Thuật AI</h2>
						<p className="text-[9px] text-muted-foreground">
							Tự nhận diện ngôn ngữ nguồn · OpenAI-compatible
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<CueTimingSettingsButton compact />
					<Badge variant="outline" className="text-[9px] text-violet-500">
						{extractedCues.length} câu
					</Badge>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 @min-[760px]:flex-row @min-[760px]:overflow-hidden">
				<section className="min-w-0 space-y-2 @min-[760px]:w-full @min-[760px]:overflow-y-auto @min-[760px]:pr-1">
					<div className="rounded-lg border bg-card p-2 text-xs">
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Ngôn ngữ đích
								</Label>
								<select
									value={targetLanguage}
									onChange={(event) =>
										updateConfig({ targetLanguage: event.target.value })
									}
									className="h-7 w-full rounded-md border bg-background px-2 text-[11px]"
								>
									{TARGET_LANGUAGES.map((language) => (
										<option key={language.code} value={language.code}>
											{language.name}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-1">
								<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Nhà cung cấp AI
								</Label>
								<div className="grid grid-cols-2 gap-1">
									{(["openrouter", "custom"] as TranslationProvider[]).map(
										(item) => (
											<button
												key={item}
												type="button"
												onClick={() => setProvider(item)}
												className={`h-7 rounded-md border px-1 text-[10px] ${provider === item ? "border-violet-500 bg-violet-500/10 font-semibold text-violet-500" : "text-muted-foreground"}`}
											>
												{item === "openrouter" ? "OpenRouter" : "Custom"}
											</button>
										),
									)}
								</div>
							</div>
						</div>
						<p className="mt-1.5 text-[9px] text-emerald-600">
							✓ Ngôn ngữ nguồn được AI tự động phát hiện từ phụ đề.
						</p>
					</div>

					{provider === "openrouter" ? (
						<div className="space-y-2 rounded-lg border bg-card p-2 text-xs">
							<div className="flex items-center justify-between">
								<span className="font-semibold text-violet-500">
									Cấu hình OpenRouter
								</span>
								{resolvedOpenRouterKey ? (
									<span className="text-[9px] font-medium text-emerald-600">
										✓ Đã kết nối API Key
									</span>
								) : (
									<span className="text-[9px] font-semibold text-amber-500">
										⚠️ Chưa có API Key
									</span>
								)}
							</div>
							<div className="space-y-1">
								<Label className="text-[10px] text-muted-foreground">
									Model AI
								</Label>
								<Input
									value={openRouterModel}
									onChange={(event) =>
										updateConfig({ openRouterModel: event.target.value })
									}
									placeholder="google/gemini-3.7-flash:batch"
									className="h-7 font-mono text-[10px]"
								/>
							</div>
							<div className="space-y-1">
								<div className="flex items-center justify-between">
									<Label className="text-[10px] text-muted-foreground">
										API Key OpenRouter
									</Label>
									{resolvedOpenRouterKey && (
										<span className="text-[8px] font-medium text-emerald-600">
											✓ Đang dùng key đã lưu
										</span>
									)}
								</div>
								<Input
									type="password"
									value={openRouterApiKey}
									onChange={(event) => {
										const key = event.target.value;
										updateConfig({ openRouterApiKey: key });
										useTranscriptionSettingsStore.getState().setApiKey(key);
									}}
									placeholder={
										resolvedOpenRouterKey
											? "sk-or-v1-•••••••• (đã có key)"
											: "sk-or-v1-..."
									}
									className="h-7 font-mono text-[10px]"
								/>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={isTestingConnection}
									onClick={handleTestConnection}
									className="h-6 gap-1 px-2 text-[10px] text-violet-600 hover:bg-violet-500/10 hover:text-violet-700"
								>
									<HugeiconsIcon icon={SparklesIcon} className="size-3" />
									{isTestingConnection ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
								</Button>
								{testSuccessMessage && (
									<span className="truncate text-[9px] font-semibold text-emerald-600">
										{testSuccessMessage}
									</span>
								)}
							</div>
						</div>
					) : (
						<div className="space-y-2 rounded-lg border bg-card p-2 text-xs">
							<div className="flex items-center justify-between">
								<span className="font-semibold">Cấu hình Custom API</span>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-[9px]"
									onClick={handleFetchModels}
									disabled={isFetchingModels}
								>
									{isFetchingModels ? "Đang tải..." : "Fetch Models"}
								</Button>
							</div>
							<div className="space-y-1">
								<Label className="text-[10px] text-muted-foreground">
									API endpoint
								</Label>
								<Input
									value={customEndpoint}
									onChange={(event) =>
										updateConfig({ customEndpoint: event.target.value })
									}
									placeholder="http://localhost:1234/v1"
									className="h-7 text-[10px]"
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-[10px] text-muted-foreground">
									API key
								</Label>
								<Input
									type="password"
									value={customApiKey}
									onChange={(event) =>
										updateConfig({ customApiKey: event.target.value })
									}
									placeholder="API key (nếu máy chủ yêu cầu)"
									className="h-7 font-mono text-[10px]"
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-[10px] text-muted-foreground">Model</Label>
								<Input
									value={customModel}
									onChange={(event) =>
										updateConfig({ customModel: event.target.value })
									}
									placeholder="Chọn hoặc nhập model"
									className="h-7 font-mono text-[10px]"
								/>
								{customModels.length > 0 && (
									<>
										<select
											aria-label="Chọn model đã tải"
											value={customModel}
											onChange={(event) =>
												updateConfig({ customModel: event.target.value })
											}
											className="h-7 w-full rounded-md border bg-background px-2 font-mono text-[10px]"
										>
											{customModels.map((model) => (
												<option key={model} value={model}>
													{model}
												</option>
											))}
										</select>
										<p className="text-[9px] text-muted-foreground">
											{customModels.length} model đã tải.
										</p>
									</>
								)}
							</div>
							<div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={isTestingConnection}
									onClick={handleTestConnection}
									className="h-6 gap-1 px-2 text-[10px] text-violet-600 hover:bg-violet-500/10 hover:text-violet-700"
								>
									<HugeiconsIcon icon={SparklesIcon} className="size-3" />
									{isTestingConnection ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
								</Button>
								{testSuccessMessage && (
									<span className="truncate text-[9px] font-semibold text-emerald-600">
										{testSuccessMessage}
									</span>
								)}
							</div>
						</div>
					)}

					<div className="space-y-2 rounded-lg border bg-card p-2 text-xs">
						<div className="flex items-center justify-between">
							<span className="font-semibold">Phong cách dịch</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 gap-1 px-1.5 text-[9px]"
								onClick={() => openStyleManager()}
							>
								<HugeiconsIcon icon={Settings01Icon} className="size-3" /> Quản
								lý
							</Button>
						</div>
						<select
							value={selectedStyleId}
							onChange={(event) => setSelectedStyleId(event.target.value)}
							className="h-8 w-full rounded-md border bg-background px-2 text-[11px]"
						>
							{styles.map((style) => (
								<option key={style.id} value={style.id}>
									{style.name}
								</option>
							))}
						</select>
						<p className="line-clamp-3 whitespace-pre-line text-[9px] leading-relaxed text-muted-foreground">
							{selectedStyle?.prompt || "Chưa có hướng dẫn phong cách."}
						</p>
					</div>

					<SpeakerRolePanel />

					{(error || status) && (
						<div
							className={`rounded-md border p-2 text-[10px] ${error ? "border-red-500/30 bg-red-500/5 text-red-500" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"}`}
						>
							{error || status}
						</div>
					)}
					{isTranslating && <Progress value={progress} className="h-1.5" />}

					<div className="sticky bottom-0 space-y-1.5 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur-xs">
						<Button
							type="button"
							onClick={handleTranslate}
							disabled={isTranslating || extractedCues.length === 0}
							className="h-9 w-full gap-2 bg-violet-600 text-xs font-bold text-white shadow-md hover:bg-violet-500 disabled:opacity-50"
						>
							<HugeiconsIcon icon={SparklesIcon} className="size-4" />
							{isTranslating
								? `ĐANG DỊCH PHỤ ĐỀ (${progress}%)...`
								: `DỊCH TỰ ĐỘNG BẰNG AI (${extractedCues.length} CÂU)`}
						</Button>

						{canApplyToTimeline && (
							<div className="grid grid-cols-2 gap-1.5 pt-0.5">
								<Button
									type="button"
									variant="outline"
									onClick={handleApplyToTimeline}
									className="h-7 gap-1 text-[10px]"
								>
									<HugeiconsIcon
										icon={
											appliedSuccess ? CheckmarkCircle01Icon : ClosedCaptionIcon
										}
										className="size-3.5"
									/>
									{appliedSuccess ? "Đã đưa vào Timeline" : "Đưa vào Timeline"}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={handleExportSrt}
									className="h-7 gap-1 text-[10px]"
								>
									<HugeiconsIcon icon={Download01Icon} className="size-3.5" />
									Xuất SRT
								</Button>
							</div>
						)}
					</div>
				</section>

				<section className="hidden flex min-h-[300px] min-w-0 flex-1 flex-col rounded-lg border bg-card/30 p-2 @min-[760px]:min-h-0">
					<div className="mb-2 flex shrink-0 items-center justify-between gap-2">
						<div>
							<h3 className="text-xs font-semibold">Bản dịch phụ đề</h3>
							<p className="text-[9px] text-muted-foreground">
								Nguồn được phát hiện tự động → {targetLanguageName}
							</p>
						</div>
						<div className="flex items-center gap-1">
							<SrtImportButton mode="translation" />
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-1.5 text-[9px]"
								onClick={clearTranslations}
							>
								Xóa bản dịch
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 gap-1 px-1.5 text-[9px]"
								onClick={handleExportSrt}
							>
								<HugeiconsIcon icon={Download01Icon} className="size-3" /> SRT
							</Button>
						</div>
					</div>

					<div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
						{extractedCues.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
								<HugeiconsIcon icon={ClosedCaptionIcon} className="size-7" />
								<p className="text-xs">Chưa có phụ đề để dịch.</p>
								<p className="text-[10px]">Hãy nhận dạng ASR hoặc OCR trước.</p>
							</div>
						) : (
							extractedCues.map((cue, index) => (
								<div
									key={cue.id}
									className="space-y-1.5 rounded-md border bg-card p-1.5"
								>
									<div className="flex items-center justify-between gap-2 font-mono text-[9px] text-muted-foreground">
										<div className="flex items-center gap-1.5 flex-wrap">
											<span className="font-bold text-foreground/80">
												#{index + 1} [{cue.startTime.toFixed(1)}s →{" "}
												{cue.endTime.toFixed(1)}s]
											</span>
											<SpeakerSelectDropdown
												cue={cue}
												cueIndex={index}
												editor={editor}
												preferredTrackId={appliedCaptionTrackId}
											/>
											{(() => {
												const role = speakerProfiles.find(
													(profile) => profile.id === cue.speakerId,
												);
												return role?.selfPronoun
													? <span className="text-muted-foreground/80">· xưng {role.selfPronoun}/{role.addressPronoun || "?"}</span>
													: null;
											})()}
										</div>
										{translations[cue.id] && (
											<Badge
												variant="outline"
												className="px-1 py-0 text-[8px] text-emerald-500"
											>
												Đã dịch
											</Badge>
										)}
									</div>
									<div className="space-y-0.5">
										<p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
											Ngôn ngữ gốc
										</p>
										<p className="whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1 text-[11px] leading-snug text-foreground">
											{cue.text}
										</p>
									</div>
									<div className="space-y-0.5">
										<p className="text-[8px] font-semibold uppercase tracking-wide text-violet-500">
											Bản dịch
										</p>
										<Textarea
											value={translations[cue.id] ?? ""}
											onChange={(event) => {
												const text = event.target.value;
												setTranslation({ id: cue.id, text });
												if (editor) {
													syncCueTextToTimeline({
														editor,
														cue,
														cueIndex: index,
														preferredTrackId: appliedCaptionTrackId,
														text,
														cueStartTime: mediaTimeFromSeconds({
															seconds: cue.startTime,
														}),
													});
												}
											}}
										placeholder="Bản dịch sẽ xuất hiện tại đây..."
										className="min-h-8 resize-y bg-background px-2 py-1 text-[11px] leading-snug"
									/>
									</div>
								</div>
							))
						)}
					</div>

					<div className="mt-2 grid shrink-0 grid-cols-[1fr_auto] gap-1.5">
						<Button
							onClick={handleTranslate}
							disabled={isTranslating || extractedCues.length === 0}
							className="h-8 gap-1.5 bg-violet-600 text-[11px] font-bold text-white hover:bg-violet-500"
						>
							<HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
							{isTranslating
								? `ĐANG DỊCH ${progress}%`
								: "DỊCH TỰ ĐỘNG BẰNG AI"}
						</Button>
						<Button
							variant="outline"
							onClick={handleApplyToTimeline}
							disabled={!canApplyToTimeline}
							className="h-8 gap-1 px-2 text-[10px]"
						>
							<HugeiconsIcon
								icon={
									appliedSuccess ? CheckmarkCircle01Icon : ClosedCaptionIcon
								}
								className="size-3.5"
							/>
							{appliedSuccess ? "Đã đưa vào Timeline" : "Đưa vào Timeline"}
						</Button>
					</div>
				</section>
			</div>

			<Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
				<DialogContent className="flex h-[82vh] max-w-5xl flex-col overflow-hidden">
					<DialogHeader className="shrink-0 p-4">
						<DialogTitle className="flex items-center gap-2 text-base">
							<HugeiconsIcon
								icon={TranslateIcon}
								className="size-4 text-violet-500"
							/>
							Chỉnh sửa phong cách dịch
						</DialogTitle>
					</DialogHeader>
					<DialogBody className="min-h-0 flex-1 flex-row gap-0 overflow-hidden p-0">
						<div className="flex w-64 shrink-0 flex-col border-r p-2">
							<div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
								{styles.map((style) => (
									<button
										key={style.id}
										type="button"
										onClick={() => setStyleDraft(createStyleDraft(style))}
										className={`w-full truncate rounded-md border px-2 py-2 text-left text-[11px] ${styleDraft.id === style.id ? "border-violet-500 bg-violet-500/10 font-semibold text-violet-500" : "border-transparent hover:bg-muted"}`}
										title={style.name}
									>
										{style.name}
									</button>
								))}
							</div>
							<Button
								variant="outline"
								className="mt-2 h-8 text-xs"
								onClick={() => setStyleDraft(createStyleDraft())}
							>
								+ Thêm phong cách
							</Button>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
							<div className="space-y-1">
								<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Tên phong cách
								</Label>
								<Input
									value={styleDraft.name}
									onChange={(event) =>
										setStyleDraft({ ...styleDraft, name: event.target.value })
									}
									className="h-8 text-xs"
								/>
							</div>
							<div className="flex min-h-0 flex-1 flex-col space-y-1">
								<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Nội dung hướng dẫn dịch
								</Label>
								<Textarea
									value={styleDraft.prompt}
									onChange={(event) =>
										setStyleDraft({ ...styleDraft, prompt: event.target.value })
									}
									className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
								/>
							</div>
						</div>
					</DialogBody>
					<DialogFooter className="shrink-0 flex-row justify-between p-3">
						<Button
							variant="outline"
							className="h-8 gap-1 text-xs text-red-500"
							disabled={!styles.some((style) => style.id === styleDraft.id)}
							onClick={() => {
								deleteStyle(styleDraft.id);
								setStyleDraft(
									createStyleDraft(
										styles.find((style) => style.id !== styleDraft.id),
									),
								);
							}}
						>
							<HugeiconsIcon icon={Delete02Icon} className="size-3.5" /> Xóa
						</Button>
						<Button
							className="h-8 bg-violet-600 text-xs text-white hover:bg-violet-500"
							disabled={!styleDraft.name.trim() || !styleDraft.prompt.trim()}
							onClick={() => {
								upsertStyle({
									...styleDraft,
									name: styleDraft.name.trim(),
									prompt: styleDraft.prompt.trim(),
								});
								setStyleDialogOpen(false);
							}}
						>
							Lưu phong cách
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
