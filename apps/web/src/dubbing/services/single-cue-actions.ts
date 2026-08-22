import type { EditorCore } from "@/core";
import { useDubbingStore } from "../dubbing-store";
import { useTranslationStore } from "../translation-store";
import { useNarrationStore } from "../narration-store";
import { useTranscriptionSettingsStore } from "@/stores/transcription-settings-store";
import { useAISettingsStore } from "@/stores/ai-settings-store";
import type { RecognitionCue, TtsProvider } from "../types";
import { translateRecognitionCues } from "./translation-pipeline";
import { syncCueTextToTimeline } from "./timeline-caption-sync";
import { mediaTimeFromSeconds, subMediaTime } from "@/dubbing/adapters/time";
import {
	applyNarrationMixSettings,
	buildElementFromMedia,
	collectPreviousNarrationElements,
	insertNarrationClips,
	processMediaAssets,
} from "@/dubbing/adapters/narration-insert";
import {
	getActiveProjectOrNull,
	getActiveSceneOrNull,
} from "@/dubbing/adapters/editor";
import {
	buildNarrationElementName,
	narrationCueIdFromElementName,
	narrationSynthesisAdjustments,
	planNarrationTiming,
} from "./narration-timing";
import { generateTtsAudioResult } from "./tts";
import { resolveSpeakerColor } from "./speaker-roles";

export function getResolvedOpenRouterKey({
	openRouterApiKey,
}: {
	openRouterApiKey?: string;
}): string {
	if (openRouterApiKey?.trim()) return openRouterApiKey.trim();
	const transcriptionKey = useTranscriptionSettingsStore
		.getState()
		.apiKey?.trim();
	if (transcriptionKey) return transcriptionKey;
	const aiState = useAISettingsStore.getState();
	if (aiState.imageApiKey?.trim()) return aiState.imageApiKey.trim();
	if (aiState.videoApiKey?.trim()) return aiState.videoApiKey.trim();
	return "";
}

export function cueSpeakerId(cue: RecognitionCue): string {
	return cue.speakerId || cue.speakerName || cue.speaker || "speaker-default";
}

function fileExtension(blob: Blob): string {
	return blob.type.includes("wav") ? "wav" : "mp3";
}

export function resolveSpeakerVoiceSettings({
	cue,
	narrationState,
	dubbingState,
}: {
	cue: RecognitionCue;
	narrationState: ReturnType<typeof useNarrationStore.getState>;
	dubbingState: ReturnType<typeof useDubbingStore.getState>;
}): {
	speakerId: string;
	speakerName: string;
	voice: {
		provider: TtsProvider;
		voiceId: string;
		speed: number;
		pitch: number;
	};
} {
	const defaultProvider: TtsProvider =
		dubbingState.settings.voiceEngine === "openai"
			? "edge-tts"
			: (dubbingState.settings.voiceEngine as TtsProvider);

	const defaultVoiceId =
		dubbingState.settings.selectedVoiceId || "vi-VN-HoaiMyNeural";

	if (narrationState.mode === "single") {
		return {
			speakerId: "single",
			speakerName: "Thuyết minh",
			voice: {
				provider: defaultProvider,
				voiceId: defaultVoiceId,
				speed: narrationState.globalSpeed ?? 1,
				pitch: narrationState.globalPitch ?? 0,
			},
		};
	}

	const speakerIdCandidate =
		cue.speakerId || cue.speakerName || cue.speaker || "speaker-default";
	const speakerNameCandidate =
		cue.speakerName || cue.speaker || cue.speakerId || "Người nói";

	// 1. Kiểm tra cấu hình giọng đã gán theo phân vai trong narration.assignments
	const candidateKeys = [
		cue.speakerId,
		cue.speakerName,
		cue.speaker,
		speakerIdCandidate,
	].filter((k): k is string => Boolean(k));

	for (const key of candidateKeys) {
		const assigned = narrationState.assignments[key];
		if (assigned?.voiceId && assigned?.provider) {
			return {
				speakerId: key,
				speakerName: speakerNameCandidate,
				voice: {
					provider: assigned.provider,
					voiceId: assigned.voiceId,
					speed: assigned.speed ?? narrationState.globalSpeed ?? 1,
					pitch: assigned.pitch ?? narrationState.globalPitch ?? 0,
				},
			};
		}
	}

	// 2. Kiểm tra theo hồ sơ phân vai speakerProfiles
	const profile = dubbingState.speakerProfiles.find(
		(p) =>
			p.id === cue.speakerId ||
			p.name === cue.speakerName ||
			p.name === cue.speaker ||
			p.id === cue.speaker,
	);
	if (profile) {
		const assigned =
			narrationState.assignments[profile.id] ||
			(profile.name ? narrationState.assignments[profile.name] : undefined);
		if (assigned?.voiceId && assigned?.provider) {
			return {
				speakerId: profile.id,
				speakerName: profile.name,
				voice: {
					provider: assigned.provider,
					voiceId: assigned.voiceId,
					speed: assigned.speed ?? narrationState.globalSpeed ?? 1,
					pitch: assigned.pitch ?? narrationState.globalPitch ?? 0,
				},
			};
		}
	}

	// 3. Sử dụng cấu hình giọng mặc định mà người dùng đã chọn (VD: CapCut - Tự tin)
	return {
		speakerId: speakerIdCandidate,
		speakerName: speakerNameCandidate,
		voice: {
			provider: defaultProvider,
			voiceId: defaultVoiceId,
			speed: narrationState.globalSpeed ?? 1,
			pitch: narrationState.globalPitch ?? 0,
		},
	};
}

export async function translateSingleCue({
	cue,
	cueIndex,
	editor,
	preferredTrackId,
}: {
	cue: RecognitionCue;
	cueIndex: number;
	editor?: EditorCore;
	preferredTrackId?: string | null;
}): Promise<string> {
	if (!cue.text.trim()) {
		throw new Error("Câu gốc không có nội dung để dịch.");
	}

	const translationState = useTranslationStore.getState();
	const dubbingState = useDubbingStore.getState();

	const resolvedOpenRouterKey = getResolvedOpenRouterKey({
		openRouterApiKey: translationState.openRouterApiKey,
	});
	const activeApiKey =
		translationState.provider === "openrouter"
			? resolvedOpenRouterKey
			: translationState.customApiKey;
	const activeModel =
		translationState.provider === "openrouter"
			? translationState.openRouterModel
			: translationState.customModel;

	if (!activeModel.trim()) {
		throw new Error("Vui lòng nhập hoặc chọn model AI ở tab Dịch.");
	}
	if (translationState.provider === "openrouter" && !activeApiKey) {
		throw new Error(
			"Chưa có OpenRouter API key. Hãy cấu hình API key ở tab Dịch.",
		);
	}
	if (
		translationState.provider === "custom" &&
		!translationState.customEndpoint.trim()
	) {
		throw new Error(
			"Vui lòng nhập API endpoint cho Custom provider ở tab Dịch.",
		);
	}

	const selectedStyle = translationState.styles.find(
		(style) => style.id === translationState.selectedStyleId,
	);

	const results = await translateRecognitionCues({
		cues: [cue],
		speakerProfiles: dubbingState.speakerProfiles,
		config: {
			provider: translationState.provider,
			endpoint:
				translationState.provider === "custom"
					? translationState.customEndpoint
					: undefined,
			apiKey: activeApiKey,
			model: activeModel,
			targetLanguage: translationState.targetLanguage,
			stylePrompt: selectedStyle?.prompt,
		},
	});

	const translatedText = results[0]?.text || "";
	if (!translatedText) {
		throw new Error("Không nhận được kết quả dịch từ AI.");
	}

	translationState.setTranslation({ id: cue.id, text: translatedText });

	if (editor) {
		syncCueTextToTimeline({
			editor,
			cue,
			cueIndex,
			preferredTrackId: preferredTrackId ?? null,
			text: translatedText,
			cueStartTime: mediaTimeFromSeconds({ seconds: cue.startTime }),
		});
	}

	return translatedText;
}

export async function generateSingleCueTts({
	cue,
	cueIndex,
	editor,
	textOverride,
}: {
	cue: RecognitionCue;
	cueIndex: number;
	editor: EditorCore;
	textOverride?: string;
}): Promise<void> {
	const activeProject = getActiveProjectOrNull({ editor });
	if (!activeProject) {
		throw new Error("Không tìm thấy dự án đang mở.");
	}

	const dubbingState = useDubbingStore.getState();
	const translationState = useTranslationStore.getState();
	const narrationState = useNarrationStore.getState();

	const textToSpeak = (
		textOverride ??
		translationState.translations[cue.id] ??
		cue.text
	).trim();

	if (!textToSpeak) {
		throw new Error("Câu này không có nội dung chữ để tạo TTS.");
	}

	// Xác định phân vai và giọng đọc
	const { speakerId, speakerName, voice } = resolveSpeakerVoiceSettings({
		cue,
		narrationState,
		dubbingState,
	});

	const adjustments = narrationSynthesisAdjustments({
		autoMatchDuration: narrationState.autoMatchDuration,
		speed: voice.speed,
		pitch: voice.pitch,
	});

	const targetDuration = Math.max(0.1, cue.endTime - cue.startTime);

	const generatedAudio = await generateTtsAudioResult({
		text: textToSpeak,
		options: {
			provider: voice.provider,
			voiceId: voice.voiceId,
			rate: adjustments.rate,
			pitch: adjustments.pitch,
			targetDuration: narrationState.autoMatchDuration
				? targetDuration
				: undefined,
		},
	});

	if (!generatedAudio.blob) {
		throw new Error("Không nhận được dữ liệu âm thanh từ dịch vụ TTS.");
	}

	const extension = fileExtension(generatedAudio.blob);
	const file = new File(
		[generatedAudio.blob],
		`Thuyet-minh-${String(cueIndex + 1).padStart(3, "0")}-${cue.id}.${extension}`,
		{
			type:
				generatedAudio.blob.type ||
				(extension === "wav" ? "audio/wav" : "audio/mpeg"),
		},
	);

	const processed = (await processMediaAssets({ files: [file] }))[0];
	if (!processed?.duration) {
		throw new Error("Không đo được thời lượng âm thanh đã tạo.");
	}

	const mediaId = await editor.media.addMediaAsset({
		projectId: activeProject.metadata.id,
		asset: {
			...processed,
			ephemeral: true,
		},
	});
	if (!mediaId) {
		throw new Error(`Không thể lưu tệp âm thanh ${file.name}`);
	}

	const serverMatched =
		narrationState.autoMatchDuration &&
		generatedAudio.sourceDuration !== null &&
		generatedAudio.appliedRate !== null &&
		generatedAudio.outputDuration !== null;

	const rawDuration = serverMatched
		? (generatedAudio.sourceDuration ?? processed.duration)
		: processed.duration;

	const timing = planNarrationTiming({
		rawDuration,
		targetDuration,
		autoMatchDuration: narrationState.autoMatchDuration,
	});

	const clipDuration = serverMatched
		? (generatedAudio.outputDuration ?? timing.duration)
		: timing.duration;

	const timelineStart = mediaTimeFromSeconds({
		seconds: cue.startTime,
	});
	const timelineEnd = mediaTimeFromSeconds({
		seconds: cue.startTime + clipDuration,
	});

	const speakerColor = resolveSpeakerColor({
		speakerId,
		speakerName,
		cueColor: cue.speakerColor,
		profiles: dubbingState.speakerProfiles,
	});

	const element = buildElementFromMedia({
		mediaId,
		mediaType: "audio",
		name: buildNarrationElementName({
			cueId: cue.id,
			label: `${speakerName || "Thuyết minh"} · câu ${cueIndex + 1}`,
		}),
		duration: subMediaTime({ a: timelineEnd, b: timelineStart }),
		startTime: timelineStart,
		speakerId,
		speakerName,
		speakerColor,
		color: speakerColor,
	});

	if (element.type !== "audio") {
		throw new Error("Không thể tạo phần tử audio trên timeline.");
	}

	element.audioRole = "narration";
	element.params.volume = dubbingState.settings.ttsVolume;
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

	// Xóa clip thuyết minh cũ của riêng cue này (nếu đã có trên timeline)
	const previousElements = collectPreviousNarrationElements({
		tracks: getActiveSceneOrNull({ editor })?.tracks,
		successfulCueIds: new Set([cue.id]),
		cueIdFromName: narrationCueIdFromElementName,
	});
	if (previousElements.length > 0) {
		editor.timeline.deleteElements({ elements: previousElements });
	}

	// Đưa clip âm thanh mới vào timeline (tự động đưa vào track thuyết minh phù hợp)
	insertNarrationClips({
		editor,
		clips: [
			{
				cueId: cue.id,
				speakerId,
				speakerName,
				speakerColor,
				lane: 0,
				element,
			},
		],
	});

	const mixSettings = dubbingState.settings;
	applyNarrationMixSettings({
		editor,
		sourceVolumeDb: mixSettings.sourceVolume,
		ttsVolumeDb: mixSettings.ttsVolume,
	});
	editor.audio.refreshScheduledClips();
}
