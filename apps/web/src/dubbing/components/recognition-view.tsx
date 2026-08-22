"use client";

import { useEffect, useState, useRef } from "react";
import {
	useDubbingStore,
	ASR_ENGINE_OPTIONS,
	OCR_ENGINE_OPTIONS,
} from "../dubbing-store";
import type {
	OCREngineId,
	ASREngineId,
	RecognitionCue,
	OCRRegion,
} from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/hooks/use-editor";
import { insertCaptionChunksAsTextTrack } from "@/dubbing/adapters/captions";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import {
	isVideoOcrInput,
	mapCanvasOcrRegionsToSource,
	prepareVideoOcrRegions,
} from "../services/ocr-regions";
import {
	getSourceTimeAtClipTime,
	getVisibleElementsWithBounds,
} from "@/dubbing/adapters/media";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/dubbing/adapters/time";
import { findRecognitionCueElementRef } from "../services/cue-timeline-selection";
import { syncCueTextToTimeline } from "../services/timeline-caption-sync";
import { translateRecognitionCues } from "../services/translation-pipeline";
import {
	buildSourceTimelineCaptions,
	buildTranslatedTimelineCaptions,
} from "../services/translated-timeline-captions";
import { useTranslationStore } from "../translation-store";
import { CueTimingSettingsButton } from "./cue-timing-settings";
import { SrtImportButton } from "./srt-import-button";
import {
	ClosedCaptionIcon,
	SparklesIcon,
	CheckmarkCircle01Icon,
	Download01Icon,
	Delete01Icon,
	VolumeHighIcon,
	ViewIcon,
	Folder03Icon,
	UserGroup02Icon,
	Edit03Icon,
	TranslateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { z } from "zod";
import { toast } from "sonner";
import { transcribeRemote } from "@/lib/transcription/remote-transcribe";
import { getRemoteProvider } from "@/lib/transcription/providers";
import { useTranscriptionSettingsStore } from "@/stores/transcription-settings-store";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { useMobileDrawerStore } from "@/components/editor/mobile/hooks/use-mobile-drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	extractAudioSamplesFromMediaBlob,
	isRemoteAsrEngine,
	mapTranscriptionToCues,
	recognitionModelsFor,
	remoteAsrProviderId,
} from "../services/remote-asr";
import {
	assignSpeakersToCues,
	requestSpeakerDiarization,
} from "../services/speaker-diarization";
import {
	ASR_AUDIO_PROFILE,
	extractAsrUploadAudio,
} from "../services/asr-audio";
import { SpeakerSelectDropdown } from "./speaker-select-dropdown";

const recognitionResponseSchema = z
	.object({
		engine: z.string().optional(),
		error: z.string().optional(),
		cues: z
			.array(
				z.object({
					id: z.string(),
					startTime: z.number(),
					endTime: z.number(),
					text: z.string(),
					confidence: z.number().optional(),
					speaker: z.string().optional(),
					speakerId: z.string().optional(),
					speakerName: z.string().optional(),
					speakerColor: z.string().optional(),
				}),
			)
			.optional(),
		speakers: z
			.array(
				z.object({ id: z.string(), name: z.string(), color: z.string() }),
			)
			.optional(),
		analysis: z
			.object({
				totalMs: z.number(),
				normalizeMs: z.number().optional(),
				asrMs: z.number().optional(),
				diarizationMs: z.number().optional(),
				diarizationInferenceMs: z.number().optional(),
				mergeMs: z.number().optional(),
				audioFilterPreset: z.string().optional(),
				device: z.string().optional(),
				deviceLabel: z.string().optional(),
				normalizedAudioCacheHit: z.boolean().optional(),
				diarizationCacheHit: z.boolean().optional(),
				ffmpegSkipped: z.boolean().optional(),
			})
			.optional(),
	})
	.passthrough();

interface OcrRegionPreview {
	name: string;
	imageUrl: string;
	region: OCRRegion;
	sourceTimeSeconds: number;
	sourceWidth: number;
	sourceHeight: number;
	cropWidth: number;
	cropHeight: number;
}

function waitForVideoEvent({
	video,
	eventName,
}: {
	video: HTMLVideoElement;
	eventName: "loadedmetadata" | "loadeddata" | "seeked";
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const handleSuccess = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error("Không thể đọc khung hình từ video nguồn."));
		};
		const cleanup = () => {
			video.removeEventListener(eventName, handleSuccess);
			video.removeEventListener("error", handleError);
		};
		video.addEventListener(eventName, handleSuccess, { once: true });
		video.addEventListener("error", handleError, { once: true });
	});
}

async function renderOcrRegionPreview({
	file,
	region,
	sourceTimeSeconds,
}: {
	file: Blob;
	region: OCRRegion;
	sourceTimeSeconds: number;
}): Promise<Omit<OcrRegionPreview, "name" | "region">> {
	const objectUrl = URL.createObjectURL(file);
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.preload = "auto";

	try {
		const metadataReady = waitForVideoEvent({
			video,
			eventName: "loadedmetadata",
		});
		video.src = objectUrl;
		video.load();
		await metadataReady;

		if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
			await waitForVideoEvent({ video, eventName: "loadeddata" });
		}

		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		const safeTime = Math.max(
			0,
			Math.min(sourceTimeSeconds, Math.max(0, duration - 0.001)),
		);
		if (safeTime > 0.001) {
			const seeked = waitForVideoEvent({ video, eventName: "seeked" });
			video.currentTime = safeTime;
			await seeked;
		}

		const sourceWidth = video.videoWidth;
		const sourceHeight = video.videoHeight;
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			throw new Error("Video nguồn không có kích thước hợp lệ.");
		}

		const left = Math.max(0, Math.floor(region.x * sourceWidth));
		const top = Math.max(0, Math.floor(region.y * sourceHeight));
		const right = Math.min(
			sourceWidth,
			Math.ceil((region.x + region.width) * sourceWidth),
		);
		const bottom = Math.min(
			sourceHeight,
			Math.ceil((region.y + region.height) * sourceHeight),
		);
		const cropWidth = Math.max(1, right - left);
		const cropHeight = Math.max(1, bottom - top);
		const previewScale = Math.min(1, 1600 / cropWidth, 1000 / cropHeight);
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(cropWidth * previewScale));
		canvas.height = Math.max(1, Math.round(cropHeight * previewScale));
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Không thể tạo ảnh xem trước vùng OCR.");
		}
		context.drawImage(
			video,
			left,
			top,
			cropWidth,
			cropHeight,
			0,
			0,
			canvas.width,
			canvas.height,
		);

		return {
			imageUrl: canvas.toDataURL("image/png"),
			sourceTimeSeconds: safeTime,
			sourceWidth,
			sourceHeight,
			cropWidth,
			cropHeight,
		};
	} finally {
		video.removeAttribute("src");
		video.load();
		URL.revokeObjectURL(objectUrl);
	}
}

export function RecognitionView() {
	const editor = useEditor();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const {
		recognitionMode,
		setRecognitionMode,
		selectedOcrEngine,
		setSelectedOcrEngine,
		selectedAsrEngine,
		setSelectedAsrEngine,
		googleApiKey,
		setGoogleApiKey,
		baiduApiKey,
		setBaiduApiKey,
		ocrSpaceApiKey,
		setOcrSpaceApiKey,
		ocrRegions,
		isSelectingOcrRegion,
		setIsSelectingOcrRegion,
		addOcrRegion,
		updateOcrRegion,
		removeOcrRegion,
		extractedLanguage,
		setExtractedLanguage,
		extractedCues,
		setExtractedCues,
		updateExtractedCue,
		speakerDiarizationEnabled,
		speakerCount,
		setSpeakerCount,
		setSpeakerProfiles,
		speakerProfiles,
		renameSpeaker,
		isRecognizing,
		recognitionProgress,
		setRecognitionProgress,
		startRecognition,
		stopRecognition,
		settings,
		setCues,
	} = useDubbingStore();
	const {
		apiKey,
		remoteModelId,
		customModelText,
		setProviderId,
		setRemoteModelId,
		setCustomModelText,
	} = useTranscriptionSettingsStore();
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const setSettingsTab = useAssetsPanelStore((s) => s.setSettingsTab);
	const openDrawer = useMobileDrawerStore((s) => s.openDrawer);
	const isMobile = useIsMobile();
	const remoteAsrProviderIdValue = remoteAsrProviderId({
		engine: selectedAsrEngine,
	});
	const remoteAsrProvider = remoteAsrProviderIdValue
		? getRemoteProvider(remoteAsrProviderIdValue)
		: undefined;

	const openAiTranscriptionSettings = () => {
		setSettingsTab("ai");
		setActiveTab("settings");
		if (isMobile) {
			openDrawer({ drawer: "settings" });
		}
	};

	const handleSelectAsrEngine = (engine: ASREngineId) => {
		setSelectedAsrEngine(engine);
		const providerId = remoteAsrProviderId({ engine });
		if (!providerId) return;
		setProviderId(providerId);
		const provider = getRemoteProvider(providerId);
		if (!provider) return;
		const models = recognitionModelsFor({ provider });
		const current = useTranscriptionSettingsStore.getState();
		const valid =
			current.remoteModelId === "__custom__"
				? Boolean(provider.supportsCustomModel)
				: models.some((model) => model.id === current.remoteModelId);
		if (!valid) {
			setRemoteModelId(provider.defaultModelId);
		}
		if (!current.apiKey.trim()) {
			toast.error(
				"Chưa nhập API. Mở Settings → Trí tuệ nhân tạo để nhập API.",
			);
			openAiTranscriptionSettings();
		}
	};

	useEffect(() => {
		const providerId = remoteAsrProviderId({
			engine: selectedAsrEngine,
		});
		if (!providerId) return;
		const provider = getRemoteProvider(providerId);
		if (!provider) return;
		const current = useTranscriptionSettingsStore.getState();
		if (current.providerId !== providerId) {
			setProviderId(providerId);
		}
		const models = recognitionModelsFor({ provider });
		const valid =
			current.remoteModelId === "__custom__"
				? Boolean(provider.supportsCustomModel)
				: models.some((model) => model.id === current.remoteModelId);
		if (!valid) {
			setRemoteModelId(provider.defaultModelId);
		}
	}, [selectedAsrEngine, setProviderId, setRemoteModelId]);

	const {
		provider: translationProvider,
		openRouterApiKey,
		openRouterModel,
		customEndpoint,
		customApiKey,
		customModel,
		targetLanguage,
		styles: translationStyles,
		selectedStyleId,
		setTranslations,
		clearTranslations,
	} = useTranslationStore();

	const [appliedSuccess, setAppliedSuccess] = useState(false);
	const [isProcessingVideo, setIsProcessingVideo] = useState(false);
	const [appliedCaptionTrackId, setAppliedCaptionTrackId] = useState<
		string | null
	>(null);
	const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
	const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
	const [speakerNameDraft, setSpeakerNameDraft] = useState("");
	const speakerNameInputRef = useRef<HTMLInputElement>(null);
	const [statusText, setStatusText] = useState<string>("");
	const [activeMediaSource, setActiveMediaSource] = useState<
		"timeline" | "file"
	>("timeline");
	const [customFile, setCustomFile] = useState<File | null>(null);
	const [previewingRegionId, setPreviewingRegionId] = useState<string | null>(
		null,
	);
	const [ocrRegionPreview, setOcrRegionPreview] =
		useState<OcrRegionPreview | null>(null);
	const [ocrRegionPreviewError, setOcrRegionPreviewError] = useState("");

	useEffect(() => {
		if (!editingSpeakerId) return;
		speakerNameInputRef.current?.focus();
		speakerNameInputRef.current?.select();
	}, [editingSpeakerId]);

	useEffect(() => {
		if (!speakerDiarizationEnabled) return;
		let cancelled = false;
		setStatusText("Đang chuẩn bị model phân biệt người nói...");
		void fetch("/api/asr?capability=diarization")
			.then(async (response) => {
				const data = (await response.json()) as {
					error?: string;
					diarization?: {
						device?: string;
						deviceLabel?: string;
						modelLoadMs?: number;
					};
				};
				if (!response.ok) throw new Error(data.error || "Prewarm thất bại.");
				if (cancelled) return;
				const device = data.diarization?.deviceLabel || data.diarization?.device;
				const loadSeconds = data.diarization?.modelLoadMs
					? ` · ${(data.diarization.modelLoadMs / 1000).toFixed(1)}s`
					: "";
				setStatusText(`✅ Model phân vai sẵn sàng${device ? ` · ${device}` : ""}${loadSeconds}`);
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setStatusText(
						`❌ ${error instanceof Error ? error.message : "Không thể chuẩn bị phân vai."}`,
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [speakerDiarizationEnabled]);

	const handlePreviewOcrRegion = async (region: OCRRegion) => {
		setPreviewingRegionId(region.id);
		setOcrRegionPreviewError("");

		try {
			let sourceFile: Blob;
			let sourceRegion: OCRRegion;
			let sourceTimeSeconds = 0;

			if (activeMediaSource === "file") {
				if (!customFile) {
					fileInputRef.current?.click();
					throw new Error("Hãy chọn video trước khi xem vùng OCR.");
				}
				sourceFile = customFile;
				const prepared = prepareVideoOcrRegions([{ ...region, enabled: true }]);
				if (!prepared[0]) {
					throw new Error("Vùng OCR không có kích thước hợp lệ.");
				}
				sourceRegion = prepared[0];
			} else {
				if (!editor) {
					throw new Error("Trình chỉnh sửa chưa sẵn sàng.");
				}
				const mediaAssets = editor.media.getAssets();
				const activeProject = editor.project.getActive();
				const activeScene = editor.scenes.getActiveScene();
				const currentTime = editor.playback.getCurrentTime();
				const selected = new Set(
					editor.selection
						.getSelectedElements()
						.map((item) => `${item.trackId}:${item.elementId}`),
				);
				const visibleVideos = getVisibleElementsWithBounds({
					tracks: activeScene.tracks,
					currentTime,
					canvasSize: activeProject.settings.canvasSize,
					mediaAssets,
				}).filter((item) => item.element.type === "video");
				const targetVideo =
					visibleVideos.find((item) =>
						selected.has(`${item.trackId}:${item.elementId}`),
					) ?? visibleVideos[0];

				if (!targetVideo || targetVideo.element.type !== "video") {
					throw new Error(
						"Không tìm thấy clip video đang hiển thị tại vị trí playhead.",
					);
				}
				const targetElement = targetVideo.element;
				const targetAsset = mediaAssets.find(
					(asset) => asset.id === targetElement.mediaId,
				);
				if (!targetAsset?.file) {
					throw new Error(
						"Không đọc được file video nguồn của clip đang chọn.",
					);
				}

				const mapped = mapCanvasOcrRegionsToSource({
					regions: [{ ...region, enabled: true }],
					canvasSize: activeProject.settings.canvasSize,
					sourceBounds: targetVideo.bounds,
				});
				if (!mapped[0]) {
					throw new Error(
						"Vùng OCR không giao với clip video đang chọn trên Preview.",
					);
				}

				sourceFile = targetAsset.file;
				sourceRegion = mapped[0];
				const clipTime = Math.max(0, currentTime - targetElement.startTime);
				const sourceTime =
					targetElement.trimStart +
					getSourceTimeAtClipTime({
						clipTime,
						playbackRate: targetElement.playbackRate,
					});
				sourceTimeSeconds = sourceTime / TICKS_PER_SECOND;
			}

			const preview = await renderOcrRegionPreview({
				file: sourceFile,
				region: sourceRegion,
				sourceTimeSeconds,
			});
			setOcrRegionPreview({
				...preview,
				name: region.name,
				region: sourceRegion,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Không thể xem vùng OCR.";
			setOcrRegionPreviewError(message);
		} finally {
			setPreviewingRegionId(null);
		}
	};

	const recognizeSubtitles = async (): Promise<RecognitionCue[]> => {
		// Recognition produces source-language cues. A previous translation must
		// never appear beside a newly recognized result that happens to reuse IDs.
		clearTranslations();
		startRecognition();
		setStatusText("Đang chuẩn bị dữ liệu...");
		let progressInterval: ReturnType<typeof setInterval> | null = null;
		const recognitionStartedAt = performance.now();
		let sourcePreparationMs = 0;

		try {
			let audioBlob: Blob | null = null;
			let fileName = recognitionMode === "ocr" ? "frame.png" : "video.mp4";
			let sourceAssetType: string | undefined;
			let timelineOcrRegions: typeof ocrRegions | null = null;
			let audioProfile = "source";

			if (activeMediaSource === "timeline" && editor) {
				const mediaAssets = editor.media.getAssets();
				if (recognitionMode === "asr") {
					const totalDuration = editor.timeline.getTotalDuration();
					if (totalDuration > 0) {
						const sourceStartedAt = performance.now();
						setStatusText("Đang trích xuất đúng âm thanh trên Timeline...");
						audioBlob = await extractTimelineAudio({
							tracks: editor.timeline.getTracks(),
							mediaAssets,
							totalDuration,
							sampleRate: 16_000,
							numberOfChannels: 1,
							onProgress: (progress) =>
								setRecognitionProgress(Math.round(progress * 0.15)),
						});
						fileName = "timeline.wav";
						sourceAssetType = "audio";
						audioProfile = "pcm-s16le-16000-mono-v1";
						sourcePreparationMs = performance.now() - sourceStartedAt;
					}
				}
				if (recognitionMode === "ocr" && mediaAssets.length > 0) {
					const activeProject = editor.project.getActive();
					const activeScene = editor.scenes.getActiveScene();
					const currentTime = editor.playback.getCurrentTime();
					const selected = new Set(
						editor.selection
							.getSelectedElements()
							.map((item) => `${item.trackId}:${item.elementId}`),
					);
					const visibleVideos = getVisibleElementsWithBounds({
						tracks: activeScene.tracks,
						currentTime,
						canvasSize: activeProject.settings.canvasSize,
						mediaAssets,
					}).filter((item) => item.element.type === "video");
					const targetVideo =
						visibleVideos.find((item) =>
							selected.has(`${item.trackId}:${item.elementId}`),
						) ?? visibleVideos[0];
					const targetMediaId =
						targetVideo?.element.type === "video"
							? targetVideo.element.mediaId
							: null;
					const targetAsset = targetMediaId
						? mediaAssets.find((asset) => asset.id === targetMediaId)
						: (mediaAssets.find(
								(asset) =>
									asset.type === "video" || asset.file?.type.includes("video"),
							) ?? mediaAssets[0]);

					if (!targetAsset) {
						throw new Error(
							"Không tìm thấy video nguồn đang hiển thị trên Timeline.",
						);
					}

					if (
						targetVideo?.element.type === "video" &&
						targetAsset.type === "video"
					) {
						timelineOcrRegions = mapCanvasOcrRegionsToSource({
							regions: ocrRegions,
							canvasSize: activeProject.settings.canvasSize,
							sourceBounds: targetVideo.bounds,
						});
						if (
							ocrRegions.some((region) => region.enabled) &&
							timelineOcrRegions.length === 0
						) {
							throw new Error(
								"Vùng OCR không giao với video đang chọn trên Preview.",
							);
						}
					}

					sourceAssetType = targetAsset.type;
					if (targetAsset.file) {
						audioBlob = targetAsset.file;
						fileName = targetAsset.file.name;
					} else if (targetAsset.url) {
						try {
							const blobRes = await fetch(targetAsset.url);
							audioBlob = await blobRes.blob();
							fileName = targetAsset.name || "video.mp4";
						} catch {
							// Remote asset fetch failed; OCR can still use a canvas snapshot.
						}
					}
				}

				// Only fallback to canvas frame snapshot if no media video asset was found
				if (!audioBlob && recognitionMode === "ocr") {
					const canvas = document.querySelector(
						"canvas",
					) as HTMLCanvasElement | null;
					if (canvas && canvas.width > 0 && canvas.height > 0) {
						audioBlob = await new Promise<Blob | null>((resolve) => {
							try {
								canvas.toBlob((b) => resolve(b), "image/png");
							} catch (_error) {
								resolve(null);
							}
						});
						if (audioBlob) {
							fileName = "canvas_frame.png";
						}
					}
				}

				if (!audioBlob && recognitionMode === "asr") {
					const activeScene = editor.scenes.getActiveScene();
					const totalDuration = editor.timeline.getTotalDuration();
					if (totalDuration > 0 && activeScene) {
						setStatusText("Trích xuất âm thanh từ Timeline...");
						audioBlob = await extractTimelineAudio({
							tracks: activeScene.tracks,
							mediaAssets: editor.media.getAssets(),
							totalDuration,
							sampleRate: 16_000,
							numberOfChannels: 1,
						});
						fileName = "timeline.wav";
						audioProfile = "pcm-s16le-16000-mono-v1";
					}
				}
			} else if (activeMediaSource === "file") {
				if (customFile) {
					audioBlob = customFile;
					fileName = customFile.name;
				} else {
					fileInputRef.current?.click();
					throw new Error(
						"Vui lòng chọn File hình ảnh hoặc Video từ máy tính của bạn!",
					);
				}
			}

			if (!audioBlob) {
				throw new Error(
					"Vui lòng kéo Video vào Timeline hoặc chọn 'Tải File từ máy' trước khi nhận dạng!",
				);
			}

			if (
					recognitionMode === "asr" &&
					audioProfile !== ASR_AUDIO_PROFILE
				) {
					setStatusText("Đang tách audio 16 kHz mono trước khi gửi...");
					const extracted = await extractAsrUploadAudio({
						blob: audioBlob,
						fileName,
					});
					audioBlob = extracted.file;
					fileName = extracted.file.name;
					audioProfile = extracted.profile;
					sourcePreparationMs += extracted.extractMs;
					setStatusText(
						`Đã tách audio (${(extracted.byteLength / 1024 / 1024).toFixed(1)} MB · ${(extracted.extractMs / 1000).toFixed(1)}s). Đang gửi...`,
					);
				}

				if (
					recognitionMode === "asr" &&
					isRemoteAsrEngine({ engine: selectedAsrEngine })
				) {
					const providerId = remoteAsrProviderId({
					engine: selectedAsrEngine,
				});
				const provider = providerId
					? getRemoteProvider(providerId)
					: undefined;
				if (!provider) {
					throw new Error("Engine ASR cloud không hợp lệ.");
				}
				if (!apiKey.trim()) {
					toast.error(
						"Chưa nhập API. Mở Settings → Trí tuệ nhân tạo để nhập API.",
					);
					openAiTranscriptionSettings();
					throw new Error(
						"Chưa nhập API trong Settings → Trí tuệ nhân tạo.",
					);
				}
				const model =
					remoteModelId === "__custom__"
						? customModelText.trim()
						: remoteModelId;
				if (!model) {
					throw new Error(
						"Chọn model ASR hoặc nhập Custom model.",
					);
				}
				setStatusText(`Đang gửi âm thanh tới ${provider.name}...`);
				setRecognitionProgress(20);
				const diarizationPromise = speakerDiarizationEnabled
					? requestSpeakerDiarization({
							audioBlob,
							fileName,
							speakerCount,
							audioProfile,
						})
						.then((value) => ({ value, error: null }))
						.catch((error: unknown) => ({
							value: null,
							error:
								error instanceof Error
									? error
									: new Error("Phân biệt người nói thất bại."),
						}))
					: null;
				const decodeStartedAt = performance.now();
				const samples = await extractAudioSamplesFromMediaBlob({
					blob: audioBlob,
				});
				const decodeMs = performance.now() - decodeStartedAt;
				setRecognitionProgress(40);
				const asrStartedAt = performance.now();
				const result = await transcribeRemote({
					provider,
					samples,
					apiKey,
					model,
					language: extractedLanguage,
					onChunkProgress: (done, total) => {
						setRecognitionProgress(
							40 + Math.round((done / Math.max(1, total)) * 50),
						);
						if (total > 1) {
							setStatusText(`Đang nhận dạng ${done}/${total}...`);
						}
					},
				});
				const asrMs = performance.now() - asrStartedAt;
				let recognizedCues = mapTranscriptionToCues({ result });
				let speakers: typeof speakerProfiles = [];
				let diarizationSummary = "";
				if (diarizationPromise) {
					setStatusText("Đang phân biệt người nói...");
					setRecognitionProgress(92);
					const diarization = await diarizationPromise;
					if (diarization.error) throw diarization.error;
					if (!diarization.value) throw new Error("Không có kết quả phân vai.");
					const labelled = assignSpeakersToCues({
						cues: recognizedCues,
						segments: diarization.value.segments,
						mode: "onset",
					});
					recognizedCues = labelled.cues;
					speakers = labelled.speakers;
					const analysis = diarization.value.analysis;
					const device =
						diarization.value.deviceLabel || diarization.value.device;
					diarizationSummary = analysis
						? ` · phân vai ${(analysis.diarizationMs ?? 0) / 1000}s${analysis.diarizationCacheHit ? " cache" : ""}${device ? ` ${device}` : ""}`
						: "";
				}
				setExtractedCues(recognizedCues);
				setSpeakerProfiles(speakers);
				setRecognitionProgress(100);
				if (recognizedCues.length > 0) {
					const speakerNote =
						speakers.length > 1
							? ` · ${speakers.length} người nói`
							: speakers.length === 1
								? " · 1 người nói"
								: "";
					setStatusText(
						`✅ ${provider.name}: ${recognizedCues.length} câu${speakerNote} · nguồn ${(sourcePreparationMs / 1000).toFixed(1)}s · decode ${(decodeMs / 1000).toFixed(1)}s · ASR ${(asrMs / 1000).toFixed(1)}s${diarizationSummary} · tổng ${((performance.now() - recognitionStartedAt) / 1000).toFixed(1)}s`,
					);
				} else {
					setStatusText("⚠️ Không phát hiện chữ phụ đề nào trong video này");
				}
				return recognizedCues;
			}

			const currentEngine =
				recognitionMode === "asr" ? selectedAsrEngine : selectedOcrEngine;
			const targetEndpoint =
				recognitionMode === "ocr" ? "/api/ocr" : "/api/asr";
			setStatusText(`Đang kết nối Engine ${currentEngine.toUpperCase()}...`);

			let currentProgress = 10;
			setRecognitionProgress(currentProgress);
			progressInterval = setInterval(() => {
				currentProgress = Math.min(
					92,
					currentProgress + Math.floor(Math.random() * 8) + 3,
				);
				setRecognitionProgress(currentProgress);
				if (currentProgress > 30 && currentProgress < 60) {
					setStatusText(
						`Engine ${currentEngine.toUpperCase()} đang phân tích văn bản & phụ đề...`,
					);
				} else if (currentProgress >= 60) {
					setStatusText("Đang khớp mốc thời gian & trích xuất dữ liệu...");
				}
			}, 800);

			const formData = new FormData();
			const isVideoInput = isVideoOcrInput({
				assetType: sourceAssetType,
				blobType: audioBlob.type,
				fileName,
			});
			const submittedOcrRegions =
				recognitionMode === "ocr" && isVideoInput
					? (timelineOcrRegions ?? prepareVideoOcrRegions(ocrRegions))
					: ocrRegions;
			formData.append("engine", currentEngine);
			formData.append("mode", recognitionMode);
			formData.append("language", extractedLanguage);
			formData.append("googleApiKey", googleApiKey);
			formData.append("baiduApiKey", baiduApiKey);
			formData.append("ocrSpaceApiKey", ocrSpaceApiKey);
			formData.append("rois", JSON.stringify(submittedOcrRegions));
			formData.append(
				"speakerDiarizationEnabled",
				String(speakerDiarizationEnabled),
			);
			formData.append("speakerCount", String(speakerCount));
			formData.append("audioProfile", audioProfile);
			formData.append("file", audioBlob, fileName);

			const res = await fetch(targetEndpoint, {
				method: "POST",
				body: formData,
			});

			if (progressInterval) clearInterval(progressInterval);

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(
					errData.error || `Lỗi máy chủ (${res.status}) khi bóc phụ đề`,
				);
			}

			const data = recognitionResponseSchema.parse(await res.json());
			setRecognitionProgress(100);

			if (data.cues) {
				const recognizedCues = data.cues;
				setExtractedCues(recognizedCues);
				setSpeakerProfiles(data.speakers ?? []);
				if (recognizedCues.length > 0) {
					const analysis = data.analysis;
					const timing = analysis
						? ` · chuẩn hóa ${((analysis.normalizeMs ?? 0) / 1000).toFixed(1)}s${analysis.normalizedAudioCacheHit ? " cache" : ""}${analysis.ffmpegSkipped ? " · bỏ FFmpeg" : ""} · ASR ${((analysis.asrMs ?? 0) / 1000).toFixed(1)}s${speakerDiarizationEnabled ? ` · phân vai ${((analysis.diarizationMs ?? 0) / 1000).toFixed(1)}s${analysis.diarizationCacheHit ? " cache" : ""}${analysis.deviceLabel || analysis.device ? ` ${analysis.deviceLabel || analysis.device}` : ""}` : ""} · tổng ${(analysis.totalMs / 1000).toFixed(1)}s`
						: "";
					setStatusText(
						`✅ ${recognizedCues.length} câu từ ${data.engine || currentEngine}${timing}`,
					);
				} else {
					setStatusText("⚠️ Không phát hiện chữ phụ đề nào trong video này");
				}
				return recognizedCues;
			} else if (data.error) {
				throw new Error(data.error);
			}
			throw new Error("Engine nhận dạng trả về dữ liệu không hợp lệ.");
		} catch (error: unknown) {
			if (progressInterval) clearInterval(progressInterval);
			const message =
				error instanceof Error ? error.message : "Có lỗi xảy ra khi nhận dạng";
			setStatusText(`❌ ${message}`);
			throw error;
		} finally {
			if (progressInterval) clearInterval(progressInterval);
			stopRecognition();
		}
	};

	const handleStartRecognition = () => {
		void recognizeSubtitles().catch(() => undefined);
	};

	const handleProcessVideo = async () => {
		if (!editor || isProcessingVideo) return;

		setIsProcessingVideo(true);
		try {
			const recognizedCues = await recognizeSubtitles();
			if (recognizedCues.length === 0) return;

			setStatusText(`Đang dịch 0/${recognizedCues.length} câu theo cài đặt tab Dịch...`);
			const selectedStyle = translationStyles.find(
				(style) => style.id === selectedStyleId,
			);
			const activeApiKey =
				translationProvider === "openrouter"
					? openRouterApiKey
					: customApiKey;
			const activeModel =
				translationProvider === "openrouter"
					? openRouterModel
					: customModel;
			const translatedCues = await translateRecognitionCues({
				cues: recognizedCues,
				speakerProfiles,
				config: {
					provider: translationProvider,
					endpoint: customEndpoint,
					apiKey: activeApiKey,
					model: activeModel,
					targetLanguage,
					stylePrompt: selectedStyle?.prompt,
				},
				onProgress: ({ completed, total }) => {
					setStatusText(`Đang dịch ${completed}/${total} câu theo cài đặt tab Dịch...`);
				},
			});

			setTranslations(translatedCues);
			const translationMap = new Map(
				translatedCues.map((item) => [item.id, item.text]),
			);
			const getTranslatedText = ({ cueId }: { cueId: string }) => {
				const text = translationMap.get(cueId);
				if (!text) throw new Error(`Thiếu bản dịch cho phụ đề ${cueId}.`);
				return text;
			};
			setCues(
				recognizedCues.map((cue) => ({
					id: cue.id,
					startTime: cue.startTime,
					endTime: cue.endTime,
					originalText: cue.text,
					translatedText: getTranslatedText({ cueId: cue.id }),
					speaker: cue.speakerName || cue.speaker || "Speaker",
					status: "ready" as const,
				})),
			);

			// Recognition may already have placed source-language captions on the
			// timeline. Translation is the replacement caption layer, never a
			// second layer to export alongside the original text.
			if (appliedCaptionTrackId) {
				editor.timeline.removeTrack({ trackId: appliedCaptionTrackId });
			}
			const trackId = insertCaptionChunksAsTextTrack({
				editor,
				captions: buildTranslatedTimelineCaptions({
					cues: recognizedCues,
					translations: Object.fromEntries(translationMap),
					timingOffsets: {
						cueLeadSeconds: settings.cueLeadSeconds,
						cueTailSeconds: settings.cueTailSeconds,
					},
					profiles: speakerProfiles,
				}),
			});
			setAppliedCaptionTrackId(trackId);
			setStatusText(
				`✅ Đã nhận dạng, dịch và đưa ${recognizedCues.length} câu bản dịch vào Timeline.`,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Xử lý video thất bại.";
			setStatusText(`❌ ${message}`);
		} finally {
			setIsProcessingVideo(false);
		}
	};

	const handleApplyToTimeline = () => {
		if (!editor || extractedCues.length === 0) return;

		const trackId = insertCaptionChunksAsTextTrack({
			editor,
			captions: buildSourceTimelineCaptions({
				cues: extractedCues,
				timingOffsets: {
					cueLeadSeconds: settings.cueLeadSeconds,
					cueTailSeconds: settings.cueTailSeconds,
				},
				profiles: speakerProfiles,
			}),
		});
		setAppliedCaptionTrackId(trackId);
		setAppliedSuccess(true);
		setStatusText(
			`✅ Đã đưa ${extractedCues.length} câu phụ đề gốc vào Timeline để so sánh.`,
		);
		setTimeout(() => setAppliedSuccess(false), 3000);
	};

	const handleSelectCueOnTimeline = ({
		cue,
		cueIndex,
	}: {
		cue: RecognitionCue;
		cueIndex: number;
	}) => {
		if (!editor) return;

		const cueStartTime = mediaTimeFromSeconds({ seconds: cue.startTime });
		const elementRef = findRecognitionCueElementRef({
			tracks: editor.timeline.getTracks(),
			cue,
			cueIndex,
			cueStartTime,
			preferredTrackId: appliedCaptionTrackId,
		});

		setSelectedCueId(cue.id);
		editor.playback.seek({ time: cueStartTime });
		if (elementRef) {
			editor.selection.setSelectedElements({ elements: [elementRef] });
		}
	};

	const beginSpeakerRename = ({ cue }: { cue: RecognitionCue }) => {
		if (!cue.speakerId || !cue.speakerName) return;
		setEditingSpeakerId(cue.speakerId);
		setSpeakerNameDraft(cue.speakerName);
	};

	const finishSpeakerRename = ({ speakerId }: { speakerId: string }) => {
		const name = speakerNameDraft.trim();
		if (name) renameSpeaker({ speakerId, name });
		setEditingSpeakerId(null);
		setSpeakerNameDraft("");
	};

	const handleExportSRT = () => {
		let srtContent = "";
		extractedCues.forEach((cue, index) => {
			const formatTime = (seconds: number) => {
				const date = new Date(seconds * 1000);
				const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
				const mm = String(date.getUTCMinutes()).padStart(2, "0");
				const ss = String(date.getUTCSeconds()).padStart(2, "0");
				const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
				return `${hh}:${mm}:${ss},${ms}`;
			};

			srtContent += `${index + 1}\n`;
			srtContent += `${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n`;
			srtContent += `${cue.text}\n\n`;
		});

		const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "subtitles.srt";
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="@container relative flex h-full flex-col overflow-hidden bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b bg-card/50 px-2 py-1.5">
				<div className="flex items-center gap-2">
					<div className="flex size-6 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/10 text-blue-500">
						<HugeiconsIcon icon={ClosedCaptionIcon} className="size-3.5" />
					</div>
					<h2 className="text-sm font-semibold text-foreground">
						Nhận Dạng Videos
					</h2>
				</div>
			</div>

			{/* Two independent columns: controls on the left, results on the right. */}
			<div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto p-1.5 @min-[700px]:flex-row @min-[700px]:overflow-hidden">
				<div className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden @min-[700px]:flex-1 @min-[700px]:pb-11">
					{/* Compact source and recognition-mode toolbar */}
					<div className="border-b bg-card p-1 text-[10px]">
						<div className="space-y-1">
							<div className="grid grid-cols-2 gap-1">
								<button
									type="button"
									title="Sử dụng video từ Timeline"
									onClick={() => setActiveMediaSource("timeline")}
									className={`h-7 truncate rounded-md border px-1 transition-all ${
										activeMediaSource === "timeline"
											? "border-blue-500 bg-blue-500/10 font-semibold text-blue-500"
											: "bg-background text-muted-foreground"
									}`}
								>
									🎬 Timeline
								</button>
								<button
									type="button"
									title="Tải video hoặc audio từ máy"
									onClick={() => {
										setActiveMediaSource("file");
										fileInputRef.current?.click();
									}}
									className={`h-7 truncate rounded-md border px-1 transition-all ${
										activeMediaSource === "file"
											? "border-blue-500 bg-blue-500/10 font-semibold text-blue-500"
											: "bg-background text-muted-foreground"
									}`}
								>
									📁 Tải video
								</button>
							</div>
							<div className="grid grid-cols-2 gap-1">
								<button
									type="button"
									title="ASR - Nhận dạng chữ từ âm thanh"
									onClick={() => setRecognitionMode("asr")}
									className={`flex h-7 items-center justify-center gap-1 truncate rounded-md border px-1 transition-colors ${
										recognitionMode === "asr"
											? "border-blue-500/30 bg-blue-500/15 font-semibold text-blue-500"
											: "border-transparent text-muted-foreground hover:bg-muted"
									}`}
								>
									<HugeiconsIcon
										icon={VolumeHighIcon}
										className="size-3 shrink-0"
									/>
									<span className="truncate">ASR · Âm thanh</span>
								</button>
								<button
									type="button"
									title="OCR - Nhận dạng chữ từ khung hình"
									onClick={() => setRecognitionMode("ocr")}
									className={`flex h-7 items-center justify-center gap-1 truncate rounded-md border px-1 transition-colors ${
										recognitionMode === "ocr"
											? "border-blue-500/30 bg-blue-500/15 font-semibold text-blue-500"
											: "border-transparent text-muted-foreground hover:bg-muted"
									}`}
								>
									<HugeiconsIcon icon={ViewIcon} className="size-3 shrink-0" />
									<span className="truncate">OCR · Khung hình</span>
								</button>
							</div>
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="video/*,audio/*"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) {
									setCustomFile(file);
								}
							}}
						/>
						{customFile && activeMediaSource === "file" && (
							<div className="mt-1 flex items-center gap-1 truncate px-1 font-mono text-[9px] text-emerald-500">
								<HugeiconsIcon icon={Folder03Icon} className="size-3" />
								Đã chọn file: {customFile.name} (
								{(customFile.size / 1024 / 1024).toFixed(1)}MB)
							</div>
						)}
					</div>

					<div className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
						{/* ASR ENGINE SELECTION */}
						{recognitionMode === "asr" && (
							<div className="space-y-2">
								<div className="space-y-1.5">
									<Label className="text-xs font-semibold text-foreground flex items-center justify-between">
										<span>Chọn Engine Nhận Dạng Âm Thanh (ASR)</span>
										<span className="text-[10px] text-muted-foreground font-normal">
											CapCut / BCut / Groq / OpenRouter
										</span>
									</Label>
									<div className="space-y-1.5">
										{ASR_ENGINE_OPTIONS.map((engine) => (
											<button
												key={engine.id}
												type="button"
												onClick={() => handleSelectAsrEngine(engine.id)}
												className={`w-full rounded-md border p-1.5 text-left transition-all ${
													selectedAsrEngine === engine.id
														? "bg-blue-500/10 border-blue-500/50 text-blue-500 shadow-sm"
														: "bg-card hover:bg-muted/50 text-muted-foreground"
												}`}
											>
												<div className="flex items-center justify-between">
													<span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
														{engine.name}
													</span>
													<Badge
														variant="outline"
														className="text-[9px] py-0 text-blue-400 border-blue-500/30"
													>
														{engine.speed}
													</Badge>
												</div>
												<p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
													{engine.description}
												</p>
												<div className="mt-0.5 truncate text-[9px] font-medium leading-tight text-amber-500">
													💡 {engine.recommendation}
												</div>
											</button>
										))}
									</div>
								</div>

								{isRemoteAsrEngine({ engine: selectedAsrEngine }) &&
									remoteAsrProvider && (
										<div className="space-y-1.5 rounded-lg border bg-card p-2.5 text-xs">
											<Label className="text-[11px] font-medium text-foreground">
												Model {remoteAsrProvider.name}
											</Label>
											<select
												aria-label="Chọn model ASR"
												value={remoteModelId}
												onChange={(event) =>
													setRemoteModelId(event.target.value)
												}
												className="h-8 w-full rounded-md border bg-background px-2 text-xs"
											>
												{recognitionModelsFor({
													provider: remoteAsrProvider,
												}).map((model) => (
													<option key={model.id} value={model.id}>
														{model.name}
													</option>
												))}
												{remoteAsrProvider.supportsCustomModel && (
													<option value="__custom__">Custom…</option>
												)}
											</select>
											{remoteAsrProvider.supportsCustomModel &&
												remoteModelId === "__custom__" && (
													<Input
														placeholder="openai/whisper-large-v3-turbo"
														value={customModelText}
														onChange={(event) =>
															setCustomModelText(event.target.value)
														}
														className="h-7 font-mono text-xs"
													/>
												)}
											<p className="text-[10px] leading-relaxed text-muted-foreground">
												API lấy từ Settings → Trí tuệ nhân tạo. Không nhập key tại đây.
											</p>
										</div>
									)}

								<div className="space-y-2 rounded-lg border bg-card p-2.5 text-xs">
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
												<HugeiconsIcon
													icon={UserGroup02Icon}
													className="size-4"
												/>
											</div>
											<div>
												<Label className="text-xs font-semibold">
													Phân biệt người nói
												</Label>
												<p className="text-[10px] text-muted-foreground">
													Gắn Người 1, Người 2… và màu riêng cho từng câu
												</p>
											</div>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={speakerDiarizationEnabled}
											aria-label="Bật phân biệt người nói"
											onClick={() =>
												useDubbingStore.setState((state) => ({
													speakerDiarizationEnabled:
														!state.speakerDiarizationEnabled,
												}))
											}
											className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
												speakerDiarizationEnabled ? "bg-amber-500" : "bg-input"
											}`}
										>
											<span
												className={`block size-4 rounded-full bg-background shadow transition-transform ${
													speakerDiarizationEnabled
														? "translate-x-4"
														: "translate-x-0"
												}`}
											/>
										</button>
									</div>

									{speakerDiarizationEnabled && (
										<div className="space-y-2 border-t pt-2">
											<div className="space-y-1">
												<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
													Số người nói
												</Label>
												<select
													value={String(speakerCount)}
													onChange={(event) =>
														setSpeakerCount(
															event.target.value === "auto"
																? "auto"
																: Number(event.target.value),
														)
													}
													className="h-8 w-full rounded-md border bg-background px-2 text-xs"
												>
													<option value="auto">Tự động phát hiện</option>
													{Array.from(
														{ length: 10 },
														(_, index) => index + 1,
													).map((count) => (
														<option key={count} value={count}>
															{count} người
														</option>
													))}
												</select>
											</div>

											<p className="text-[10px] leading-snug text-emerald-600">
												Model pyannote chạy cục bộ trên máy, không cần token khi
												nhận dạng.
											</p>
										</div>
									)}
								</div>
							</div>
						)}

						{/* OCR ENGINE SELECTION */}
						{recognitionMode === "ocr" && (
							<div className="space-y-2">
								<div className="space-y-1.5">
									<Label className="text-xs font-semibold text-foreground">
										Chọn Engine Bóc Phụ Đề Cứng Trên Frame Video (OCR)
									</Label>
									<div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
										{OCR_ENGINE_OPTIONS.map((engine) => (
											<button
												key={engine.id}
												type="button"
												onClick={() =>
													setSelectedOcrEngine(engine.id as OCREngineId)
												}
												className={`w-full rounded-md border p-1.5 text-left transition-all ${
													selectedOcrEngine === engine.id
														? "bg-blue-500/10 border-blue-500/50 text-blue-500 shadow-sm"
														: "bg-card hover:bg-muted/50 text-muted-foreground"
												}`}
											>
												<div className="flex items-center justify-between">
													<span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
														{engine.name}
													</span>
													<Badge
														variant="outline"
														className={`text-[9px] py-0 ${
															engine.type === "cloud"
																? "text-purple-400 border-purple-500/30 bg-purple-500/10"
																: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
														}`}
													>
														{engine.type === "cloud"
															? "🌐 Mạng API"
															: "💻 Máy Offline"}
													</Badge>
												</div>
												<p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
													{engine.description}
												</p>
												<div className="mt-0.5 truncate text-[9px] font-medium leading-tight text-amber-500">
													💡 {engine.recommendation}
												</div>
											</button>
										))}
									</div>
								</div>

								{/* API Key Inputs for Cloud Engines */}
								{selectedOcrEngine === "google-vision" && (
									<div className="p-2.5 rounded-lg border bg-card space-y-1.5 text-xs">
										<div className="flex items-center justify-between">
											<Label className="text-[11px] font-medium text-foreground">
												Google Vision / Gemini API Key
											</Label>
											<a
												href="https://aistudio.google.com/app/apikey"
												target="_blank"
												rel="noreferrer"
												className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-semibold"
											>
												🔑 Lấy API Key Miễn Phí
											</a>
										</div>
										<Input
											type="password"
											placeholder="AIzaSy..."
											value={googleApiKey}
											onChange={(e) => setGoogleApiKey(e.target.value)}
											className="text-xs h-7 font-mono"
										/>
									</div>
								)}

								{selectedOcrEngine === "baidu-ocr" && (
									<div className="p-2.5 rounded-lg border bg-card space-y-1.5 text-xs">
										<div className="flex items-center justify-between">
											<Label className="text-[11px] font-medium text-foreground">
												Baidu OCR API Key
											</Label>
											<a
												href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index"
												target="_blank"
												rel="noreferrer"
												className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-semibold"
											>
												🔑 Lấy API Key Baidu
											</a>
										</div>
										<Input
											type="password"
											placeholder="Nhập Baidu Access Token / API Key"
											value={baiduApiKey}
											onChange={(e) => setBaiduApiKey(e.target.value)}
											className="text-xs h-7 font-mono"
										/>
									</div>
								)}

								{selectedOcrEngine === "ocr-space" && (
									<div className="p-2.5 rounded-lg border bg-card space-y-1.5 text-xs">
										<div className="flex items-center justify-between">
											<Label className="text-[11px] font-medium text-foreground">
												OCR.Space Free API Key
											</Label>
											<a
												href="https://ocr.space/ocrapi/freekey"
												target="_blank"
												rel="noreferrer"
												className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-semibold"
											>
												🔑 Lấy Key Miễn Phí (25k req/tháng)
											</a>
										</div>
										<Input
											type="password"
											placeholder="K8xxxxxxxx8888 (Mặc định: helloworld)"
											value={ocrSpaceApiKey}
											onChange={(e) => setOcrSpaceApiKey(e.target.value)}
											className="text-xs h-7 font-mono"
										/>
									</div>
								)}
							</div>
						)}

						{recognitionMode === "ocr" && (
							<div className="space-y-2 rounded-lg border bg-card p-2.5 text-xs">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
											<HugeiconsIcon
												icon={UserGroup02Icon}
												className="size-4"
											/>
										</div>
										<div>
											<Label className="text-xs font-semibold">
												Phân biệt người nói
											</Label>
											<p className="text-[10px] text-muted-foreground">
												Chạy song song với OCR và ghép người nói theo thời gian
											</p>
										</div>
									</div>
									<button
										type="button"
										role="switch"
										aria-checked={speakerDiarizationEnabled}
										aria-label="Bật phân biệt người nói cho OCR"
										onClick={() =>
											useDubbingStore.setState((state) => ({
												speakerDiarizationEnabled:
													!state.speakerDiarizationEnabled,
											}))
										}
										className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
											speakerDiarizationEnabled ? "bg-amber-500" : "bg-input"
										}`}
									>
										<span
											className={`block size-4 rounded-full bg-background shadow transition-transform ${
												speakerDiarizationEnabled
													? "translate-x-4"
													: "translate-x-0"
											}`}
										/>
									</button>
								</div>

								{speakerDiarizationEnabled && (
									<div className="space-y-2 border-t pt-2">
										<Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
											Số người nói
										</Label>
										<select
											value={String(speakerCount)}
											onChange={(event) =>
												setSpeakerCount(
													event.target.value === "auto"
														? "auto"
														: Number(event.target.value),
												)
											}
											className="h-8 w-full rounded-md border bg-background px-2 text-xs"
										>
											<option value="auto">Tự động phát hiện</option>
											{Array.from({ length: 10 }, (_, index) => index + 1).map(
												(count) => (
													<option key={count} value={count}>
														{count} người
													</option>
												),
											)}
										</select>
										<p className="text-[10px] leading-snug text-emerald-600">
											Chỉ dùng với video có âm thanh; model chạy cục bộ trên
											máy.
										</p>
									</div>
								)}
							</div>
						)}

						{recognitionMode === "ocr" && (
							<div className="space-y-2 rounded-lg border bg-card p-2.5">
								<div className="flex items-center justify-between gap-2">
									<div>
										<Label className="text-xs font-semibold">Vùng OCR</Label>
										<p className="text-[10px] text-muted-foreground">
											Chỉ vùng bật mới được quét. Bấm “Vẽ trên Preview” để kéo
											trực tiếp trên video.
										</p>
									</div>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-7 text-[11px]"
										onClick={() => addOcrRegion()}
									>
										Thêm vùng
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-7 text-[11px]"
										onClick={() =>
											setIsSelectingOcrRegion(!isSelectingOcrRegion)
										}
									>
										{isSelectingOcrRegion
											? "Xong trên Preview"
											: "Vẽ trên Preview"}
									</Button>
								</div>
								<div className="space-y-2">
									{ocrRegions.map((region) => (
										<div
											key={region.id}
											className="grid grid-cols-[1fr_repeat(4,52px)_auto_auto_auto] items-center gap-1"
										>
											<Input
												value={region.name}
												onChange={(event) =>
													updateOcrRegion(region.id, {
														name: event.target.value,
													})
												}
												className="h-7 text-[10px]"
											/>
											{(["x", "y", "width", "height"] as const).map((field) => (
												<Input
													key={field}
													type="number"
													min="0"
													max="1"
													step="0.01"
													aria-label={`${region.name} ${field}`}
													value={region[field]}
													onChange={(event) =>
														updateOcrRegion(region.id, {
															[field]: Number(event.target.value),
														})
													}
													className="h-7 px-1 text-[10px]"
												/>
											))}
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="h-7 gap-1 px-1.5 text-[10px]"
												disabled={previewingRegionId === region.id}
												onClick={() => void handlePreviewOcrRegion(region)}
											>
												<HugeiconsIcon icon={ViewIcon} className="size-3" />
												{previewingRegionId === region.id
													? "Đang mở"
													: "Xem vùng"}
											</Button>
											<Button
												type="button"
												size="sm"
												variant={region.enabled ? "outline" : "ghost"}
												className="h-7 px-1 text-[10px]"
												onClick={() =>
													updateOcrRegion(region.id, {
														enabled: !region.enabled,
													})
												}
											>
												{region.enabled ? "On" : "Off"}
											</Button>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												className="h-7 px-1 text-[10px]"
												onClick={() => removeOcrRegion(region.id)}
											>
												Remove
											</Button>
										</div>
									))}
								</div>
								{ocrRegionPreviewError && (
									<p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-500">
										{ocrRegionPreviewError}
									</p>
								)}
							</div>
						)}
					</div>
				</div>

				<aside className="hidden flex min-h-[280px] min-w-0 shrink-0 flex-col gap-1.5 rounded-lg border bg-card/30 p-1.5 @min-[700px]:min-h-0 @min-[700px]:w-[42%] @min-[700px]:min-w-[280px]">
					{/* Results Table & Editor */}
					<div className="flex min-h-0 flex-1 flex-col space-y-1.5">
						<div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
							<span className="shrink-0 rounded-md border bg-muted/40 px-1.5 py-1 text-[10px] font-semibold text-foreground">
								{extractedCues.length} câu
							</span>
							<span className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-1 text-[10px] font-medium text-blue-500">
								Ngôn ngữ gốc
							</span>
							<div className="ml-auto flex min-w-0 items-center justify-end gap-0.5 whitespace-nowrap">
								<CueTimingSettingsButton compact />
								<SrtImportButton className="h-6 shrink-0 gap-1 px-1.5 text-[9px] text-muted-foreground hover:text-foreground" />
								<Button
									size="sm"
									variant="ghost"
									onClick={() => {
										setExtractedCues([]);
										setSpeakerProfiles([]);
										setAppliedCaptionTrackId(null);
										setSelectedCueId(null);
									}}
									className="h-6 shrink-0 gap-1 px-1.5 text-[9px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
								>
									<HugeiconsIcon icon={Delete01Icon} className="size-3" />
									Xóa
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={handleExportSRT}
									className="h-6 shrink-0 gap-1 px-1.5 text-[9px] text-muted-foreground hover:text-foreground"
								>
									<HugeiconsIcon icon={Download01Icon} className="size-3" />
									Xuất .SRT
								</Button>
							</div>
						</div>

						<div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
							{extractedCues.map((cue, idx) => {
								const startSec =
									cue.startTime > 100 ? cue.startTime / 1000 : cue.startTime;
								const endSec =
									cue.endTime > 100 ? cue.endTime / 1000 : cue.endTime;
								return (
									<div
										key={cue.id}
										role="button"
										tabIndex={0}
										onClick={() =>
											handleSelectCueOnTimeline({ cue, cueIndex: idx })
										}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												handleSelectCueOnTimeline({ cue, cueIndex: idx });
											}
										}}
										className={`space-y-0.5 rounded-md border bg-card p-1.5 text-xs transition-colors hover:bg-muted/60 ${
											selectedCueId === cue.id ? "ring-1 ring-primary" : ""
										}`}
										style={
											cue.speakerColor
												? {
														borderLeftColor: cue.speakerColor,
														borderLeftWidth: 4,
													}
												: undefined
										}
									>
										<div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
											<div className="flex min-w-0 items-center gap-1.5 flex-wrap">
												<SpeakerSelectDropdown
													cue={cue}
													cueIndex={idx}
												/>
												{cue.speakerId &&
													cue.speakerName &&
													cue.speakerColor &&
													(editingSpeakerId === cue.speakerId ? (
														<Input
															ref={speakerNameInputRef}
															value={speakerNameDraft}
															onClick={(event) => event.stopPropagation()}
															onChange={(event) =>
																setSpeakerNameDraft(event.target.value)
															}
															onBlur={() =>
																finishSpeakerRename({
																	speakerId: cue.speakerId!,
																})
															}
															onKeyDown={(event) => {
																if (event.key === "Enter")
																	event.currentTarget.blur();
																if (event.key === "Escape") {
																	setEditingSpeakerId(null);
																	setSpeakerNameDraft("");
																}
															}}
															aria-label={`Sửa tên ${cue.speakerName}`}
															className="h-5 w-20 px-1 text-[9px] font-semibold"
														/>
													) : (
														<button
															type="button"
															onClick={(event) => {
																event.stopPropagation();
																beginSpeakerRename({ cue });
															}}
															className="flex items-center gap-0.5 rounded px-1 py-0 text-[9px] text-muted-foreground hover:text-foreground hover:bg-muted"
															title={`Đổi tên hiển thị của ${cue.speakerName}`}
															aria-label={`Đổi tên hiển thị của ${cue.speakerName}`}
														>
															<HugeiconsIcon
																icon={Edit03Icon}
																className="size-2.5 shrink-0"
															/>
														</button>
													))}
												<span>
													#{idx + 1} [{startSec.toFixed(1)}s ➔{" "}
													{endSec.toFixed(1)}s]
												</span>
											</div>
											{cue.confidence && (
												<Badge
													variant="outline"
													className="text-[9px] py-0 text-emerald-500 border-emerald-500/30"
												>
													{(cue.confidence * 100).toFixed(0)}% khớp
												</Badge>
											)}
										</div>
										<Textarea
											value={cue.text}
											onChange={(event) => {
												const text = event.target.value;
												updateExtractedCue(cue.id, text);
												if (editor) {
													syncCueTextToTimeline({
														editor,
														cue,
														cueIndex: idx,
														preferredTrackId: appliedCaptionTrackId,
														text,
														cueStartTime: mediaTimeFromSeconds({
															seconds: cue.startTime,
														}),
													});
												}
											}}
											className="min-h-7 resize-y bg-background px-2 py-1 text-[11px] font-medium leading-snug text-foreground"
										/>
									</div>
								);
							})}
						</div>
					</div>

					<Button
						className="h-9 w-full gap-2 bg-emerald-600 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
						onClick={handleApplyToTimeline}
						disabled={
							isRecognizing || isProcessingVideo || extractedCues.length === 0
						}
					>
						<HugeiconsIcon
							icon={appliedSuccess ? CheckmarkCircle01Icon : ClosedCaptionIcon}
							className="size-4"
						/>
						{appliedSuccess
							? "ĐÃ ĐƯA PHỤ ĐỀ GỐC VÀO TIMELINE"
							: "ĐƯA PHỤ ĐỀ GỐC VÀO TIMELINE ĐỂ SO SÁNH"}
					</Button>

				</aside>
			</div>

			{/* Recognition controls always remain visible, independent of settings scroll. */}
			<div className="shrink-0 border-t bg-background p-1.5 @min-[700px]:absolute @min-[700px]:bottom-0 @min-[700px]:left-1.5 @min-[700px]:right-1.5 @min-[700px]:z-20">
				<div className="flex min-w-0 items-center gap-1.5">
					<select
						aria-label="Ngôn ngữ gốc của Video"
						value={extractedLanguage}
						onChange={(e) => setExtractedLanguage(e.target.value)}
						className="h-8 max-w-[145px] shrink-0 rounded-md border bg-card px-2 text-[10px]"
					>
						<option value="auto">🌐 Tự động nhận diện</option>
						<option value="en">🇺🇸 Tiếng Anh</option>
						<option value="zh">🇨🇳 Tiếng Trung</option>
						<option value="vi">🇻🇳 Tiếng Việt</option>
						<option value="ja">🇯🇵 Tiếng Nhật</option>
						<option value="ko">🇰🇷 Tiếng Hàn</option>
					</select>
					<Button
						className="h-8 min-w-0 flex-1 gap-1.5 bg-blue-600 px-2 text-[11px] font-bold text-white shadow-sm hover:bg-blue-500"
						onClick={handleStartRecognition}
						disabled={isRecognizing || isProcessingVideo}
					>
						<HugeiconsIcon icon={SparklesIcon} className="size-3.5 shrink-0" />
						<span className="truncate">
							{isRecognizing ? "ĐANG NHẬN DẠNG..." : "BẮT ĐẦU NHẬN DẠNG PHỤ ĐỀ"}
						</span>
					</Button>
					<Button
						className="h-8 min-w-0 flex-1 gap-1.5 bg-violet-600 px-2 text-[11px] font-bold text-white shadow-sm hover:bg-violet-500"
						onClick={handleProcessVideo}
						disabled={isRecognizing || isProcessingVideo}
					>
						<HugeiconsIcon icon={TranslateIcon} className="size-3.5 shrink-0" />
						<span className="truncate">
							{isProcessingVideo ? "ĐANG XỬ LÝ..." : "XỬ LÝ VIDEO"}
						</span>
					</Button>
				</div>
				{(isRecognizing || isProcessingVideo || statusText) && (
					<div className="mt-1 space-y-1">
						{(isRecognizing || isProcessingVideo) && (
							<Progress value={recognitionProgress} className="h-1.5" />
						)}
						<div className="truncate text-center text-[9px] text-muted-foreground">
							{statusText ||
								`Đang bóc tách timestamps & câu thoại (${recognitionProgress}%)`}
						</div>
					</div>
				)}
			</div>

			<Dialog
				open={ocrRegionPreview !== null}
				onOpenChange={(open) => {
					if (!open) setOcrRegionPreview(null);
				}}
			>
				<DialogContent className="max-w-4xl overflow-hidden">
					<DialogHeader className="p-4 pr-14">
						<DialogTitle className="text-base">
							Xem vùng OCR: {ocrRegionPreview?.name}
						</DialogTitle>
						<DialogDescription className="text-xs">
							Đây là chính xác phần ảnh nguồn được gửi vào OCR tại thời điểm
							hiện tại.
						</DialogDescription>
					</DialogHeader>
					{ocrRegionPreview && (
						<DialogBody className="gap-3 p-4">
							<div className="flex max-h-[65vh] min-h-32 items-center justify-center overflow-auto rounded-md border bg-black">
								{/* The preview is a local canvas data URL; Next Image optimization is not applicable. */}
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={ocrRegionPreview.imageUrl}
									alt={`Vùng OCR ${ocrRegionPreview.name}`}
									className="max-h-[65vh] max-w-full object-contain"
								/>
							</div>
							<div className="grid gap-1 rounded-md border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
								<span>
									Khung hình: {ocrRegionPreview.sourceTimeSeconds.toFixed(3)}s ·
									nguồn {ocrRegionPreview.sourceWidth}×
									{ocrRegionPreview.sourceHeight}px
								</span>
								<span>
									Ảnh OCR: {ocrRegionPreview.cropWidth}×
									{ocrRegionPreview.cropHeight}px
								</span>
								<span className="sm:col-span-2">
									x={ocrRegionPreview.region.x.toFixed(4)}, y=
									{ocrRegionPreview.region.y.toFixed(4)}, w=
									{ocrRegionPreview.region.width.toFixed(4)}, h=
									{ocrRegionPreview.region.height.toFixed(4)}
								</span>
							</div>
						</DialogBody>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
