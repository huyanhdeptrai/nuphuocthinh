import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
	DubbingCue,
	DubbingSettings,
	DubbingActiveStep,
	VoiceOption,
	RecognitionMode,
	OCREngineId,
	ASREngineId,
	ASREngineOption,
	OCREngineOption,
	RecognitionCue,
	OCRRegion,
	SpeakerCountSetting,
	SpeakerProfile,
} from "./types";


export const ASR_ENGINE_OPTIONS: ASREngineOption[] = [
	{
		id: "capcut-asr",
		name: "CapCut / JianYing ASR API",
		provider: "ByteDance JianYing Cloud",
		speed: "~30x Real-time",
		description:
			"Engine bóc phụ đề tự động của CapCut / 剪映, bóc tách chính xác mốc miligiây từng câu thoại.",
		recommendation:
			"Khuyên dùng tốt nhất cho video ngắn, TikTok, Douyin, Reels & Shorts.",
	},
	{
		id: "bcut-bilibili",
		name: "BCut Bilibili ASR API",
		provider: "Bilibili 必剪 Cloud",
		speed: "~50x Real-time",
		description:
			"Engine chính thức của Bilibili 必剪, chuyên trị phim Trung Quốc, Douyin, Anime & Drama Châu Á.",
		recommendation:
			"Khuyên dùng tốt nhất cho Phim Trung Quốc, Douyin, Bilibili.",
	},
	{
		id: "groq-whisper",
		name: "Groq Whisper API",
		provider: "Groq AI Cloud",
		speed: "~100x Real-time",
		description:
			"Tốc độ siêu nhanh, độ chính xác cao, hỗ trợ 99+ ngôn ngữ bao gồm Tiếng Việt, Trung, Anh, Nhật, Hàn. Chọn model trong danh sách.",
		recommendation:
			"Khuyên dùng cho video đa ngôn ngữ. API nhập tại Settings → Trí tuệ nhân tạo.",
	},
	{
		id: "openrouter",
		name: "OpenRouter ASR",
		provider: "OpenRouter Cloud",
		speed: "Cloud",
		description:
			"GPT Transcribe và Whisper qua OpenRouter. Có thể chọn model có sẵn hoặc nhập Custom model.",
		recommendation:
			"Khuyên dùng khi đã có API OpenRouter trong Settings → Trí tuệ nhân tạo.",
	},
];

export const OCR_ENGINE_OPTIONS: OCREngineOption[] = [
	{
		id: "rapidocr",
		name: "PP-OCRv6 Small — Chính xác",
		provider: "PaddlePaddle (Local Offline)",
		type: "local",
		speed: "Chuẩn",
		description:
			"Detector + recognizer PP-OCRv6 Small ONNX, ưu tiên độ chính xác.",
		recommendation: "Dùng khi cần phụ đề chính xác nhất.",
	},
	{
		id: "rapidocr-tiny",
		name: "PP-OCRv6 Tiny Det — Nhanh/chuẩn",
		provider: "PaddlePaddle (Local Offline)",
		type: "local",
		speed: "Nhanh nhất",
		description:
			"Detector Tiny quét nhanh + recognizer Small đọc đủ chữ, chạy bằng ONNX.",
		recommendation: "Dùng để xử lý nhanh mà vẫn ưu tiên đủ và đúng chữ.",
	},
];

export const VOICE_OPTIONS: VoiceOption[] = [
	{
		id: "vi-VN-HoaiMyNeural",
		name: "Hoài My (Giọng Nữ mượt - Bắc)",
		gender: "female",
		lang: "vi-VN",
		provider: "edge-tts",
		description: "Giọng đọc truyền cảm, phù hợp thuyết minh & lồng tiếng phim.",
	},
	{
		id: "vi-VN-NamMinhNeural",
		name: "Nam Minh (Giọng Nam trầm - Bắc)",
		gender: "male",
		lang: "vi-VN",
		provider: "edge-tts",
		description: "Giọng nam ấm áp, tự nhiên, rõ lời.",
	},
	{
		id: "vieneu-female-south",
		name: "VieNeu Nữ Nam Bộ (AI Cảm Xúc)",
		gender: "female",
		lang: "vi-VN",
		provider: "vieneu",
		description: "Giọng Nữ miền Nam tự nhiên có ngữ điệu cảm xúc.",
	},
	{
		id: "openai-alloy",
		name: "OpenAI Alloy (Nam/Nữ Trung tính)",
		gender: "male",
		lang: "vi-VN",
		provider: "openai",
		description: "Giọng AI studio cao cấp từ OpenAI.",
	},
];

interface DubbingState {
	// Subtitle Recognition Mode
	recognitionMode: RecognitionMode;
	setRecognitionMode: (mode: RecognitionMode) => void;

	selectedOcrEngine: OCREngineId;
	setSelectedOcrEngine: (engine: OCREngineId) => void;

	selectedAsrEngine: ASREngineId;
	setSelectedAsrEngine: (engine: ASREngineId) => void;

	groqApiKey: string;
	setGroqApiKey: (key: string) => void;

	googleApiKey: string;
	setGoogleApiKey: (key: string) => void;
	baiduApiKey: string;
	setBaiduApiKey: (key: string) => void;
	ocrSpaceApiKey: string;
	setOcrSpaceApiKey: (key: string) => void;
	ocrRegions: OCRRegion[];
	isSelectingOcrRegion: boolean;
	setIsSelectingOcrRegion: (isSelecting: boolean) => void;
	addOcrRegion: (region?: Partial<OCRRegion>) => void;
	updateOcrRegion: (id: string, partial: Partial<OCRRegion>) => void;
	removeOcrRegion: (id: string) => void;

	extractedLanguage: string;
	setExtractedLanguage: (lang: string) => void;

	extractedCues: RecognitionCue[];
	setExtractedCues: (cues: RecognitionCue[]) => void;
	updateExtractedCue: (id: string, text: string) => void;
	assignCueSpeaker: (input: {
		cueId: string;
		speakerId: string | null;
	}) => void;
	speakerDiarizationEnabled: boolean;
	setSpeakerDiarizationEnabled: (enabled: boolean) => void;
	speakerCount: SpeakerCountSetting;
	setSpeakerCount: (count: SpeakerCountSetting) => void;
	speakerProfiles: SpeakerProfile[];
	setSpeakerProfiles: (profiles: SpeakerProfile[]) => void;
	addSpeakerProfile: (input?: {
		name?: string;
		color?: string;
	}) => SpeakerProfile;
	renameSpeaker: (input: { speakerId: string; name: string }) => void;
	updateSpeakerProfile: (
		speakerId: string,
		partial: Partial<
			Pick<SpeakerProfile, "gender" | "selfPronoun" | "addressPronoun">
		>,
	) => void;

	isRecognizing: boolean;
	recognitionProgress: number;
	setRecognitionProgress: (progress: number) => void;
	startRecognition: () => void;
	stopRecognition: () => void;

	// Dubbing Workflow
	activeStep: DubbingActiveStep;
	setActiveStep: (step: DubbingActiveStep) => void;

	videoUrl: string;
	setVideoUrl: (url: string) => void;
	isDownloading: boolean;

	cues: DubbingCue[];
	setCues: (cues: DubbingCue[]) => void;
	updateCue: (id: string, partial: Partial<DubbingCue>) => void;
	addCue: () => void;
	deleteCue: (id: string) => void;

	settings: DubbingSettings;
	updateSettings: (partial: Partial<DubbingSettings>) => void;
	duckOverrides: Record<string, { startOffset?: number; endOffset?: number; duckVolume?: number }>;
	setDuckOverride: (
		key: string,
		override: Partial<{ startOffset: number; endOffset: number; duckVolume: number }>,
	) => void;
	resetDuckOverrides: () => void;
	favoriteVoiceIds: string[];
	toggleFavoriteVoice: (voiceId: string) => void;

	isExtracting: boolean;
	isTranslating: boolean;
	isSynthesizing: boolean;

	simulateExtractOCR: () => void;
	simulateTranslate: () => void;
	simulateSynthesize: () => void;

	runRealTranslation: () => Promise<void>;
	runRealSingleTranslation: (id: string) => Promise<void>;
	runRealSynthesize: () => Promise<void>;
	importSrtContent: (srtText: string, fileName?: string) => void;
	exportSrtContent: (useTranslated?: boolean) => string;
}

export const useDubbingStore = create<DubbingState>()(
	persist(
		(set, get) => ({
			recognitionMode: "asr",
			setRecognitionMode: (mode) =>
				set((state) => ({
					recognitionMode: mode,
					isSelectingOcrRegion:
						mode === "asr" ? false : state.isSelectingOcrRegion,
				})),

			selectedOcrEngine: "rapidocr",
			setSelectedOcrEngine: (engine) => set({ selectedOcrEngine: engine }),

			selectedAsrEngine: "capcut-asr",
			setSelectedAsrEngine: (engine) => set({ selectedAsrEngine: engine }),

			groqApiKey: "",
			setGroqApiKey: (key) => set({ groqApiKey: key }),

			googleApiKey: "",
			setGoogleApiKey: (key) => set({ googleApiKey: key }),
			baiduApiKey: "",
			setBaiduApiKey: (key) => set({ baiduApiKey: key }),
			ocrSpaceApiKey: "",
			setOcrSpaceApiKey: (key) => set({ ocrSpaceApiKey: key }),
			ocrRegions: [
				{
					id: "subtitle-bottom",
					name: "Subtitle bottom",
					x: 0.08,
					y: 0.62,
					width: 0.84,
					height: 0.3,
					enabled: true,
				},
			],
			isSelectingOcrRegion: false,
			setIsSelectingOcrRegion: (isSelecting) =>
				set({ isSelectingOcrRegion: isSelecting }),
			addOcrRegion: (region = {}) =>
				set((state) => ({
					ocrRegions: [
						...state.ocrRegions,
						{
							id: `ocr-region-${Date.now()}`,
							name: `OCR region ${state.ocrRegions.length + 1}`,
							x: 0.1,
							y: 0.1,
							width: 0.8,
							height: 0.2,
							enabled: true,
							...region,
						},
					],
				})),
			updateOcrRegion: (id, partial) =>
				set((state) => ({
					ocrRegions: state.ocrRegions.map((region) =>
						region.id === id ? { ...region, ...partial } : region,
					),
				})),
			removeOcrRegion: (id) =>
				set((state) => ({
					ocrRegions: state.ocrRegions.filter((region) => region.id !== id),
				})),

			extractedLanguage: "auto",
			setExtractedLanguage: (lang) => set({ extractedLanguage: lang }),

			extractedCues: [],
			setExtractedCues: (cues) => set({ extractedCues: cues }),
			updateExtractedCue: (id, text) =>
				set((state) => ({
					extractedCues: state.extractedCues.map((c) =>
						c.id === id ? { ...c, text } : c,
					),
				})),
			assignCueSpeaker: ({ cueId, speakerId }) =>
				set((state) => {
					if (!speakerId) {
						return {
							extractedCues: state.extractedCues.map((cue) =>
								cue.id === cueId
									? {
											...cue,
											speakerId: undefined,
											speakerName: undefined,
											speaker: undefined,
											speakerColor: undefined,
										}
									: cue,
							),
						};
					}
					const profile = state.speakerProfiles.find(
						(p) => p.id === speakerId || p.name === speakerId,
					);
					if (!profile) return {};
					return {
						extractedCues: state.extractedCues.map((cue) =>
							cue.id === cueId
								? {
										...cue,
										speakerId: profile.id,
										speakerName: profile.name,
										speaker: profile.name,
										speakerColor: profile.color,
									}
								: cue,
						),
					};
				}),
			speakerDiarizationEnabled: false,
			setSpeakerDiarizationEnabled: (enabled) =>
				set({ speakerDiarizationEnabled: enabled }),
			speakerCount: "auto",
			setSpeakerCount: (count) => set({ speakerCount: count }),
			speakerProfiles: [],
			setSpeakerProfiles: (profiles) => set({ speakerProfiles: profiles }),
			addSpeakerProfile: (input) => {
				const state = get();
				const nextIndex = state.speakerProfiles.length + 1;
				const defaultColors = [
					"#22c55e",
					"#3b82f6",
					"#f59e0b",
					"#a855f7",
					"#ef4444",
					"#06b6d4",
					"#ec4899",
					"#84cc16",
					"#f97316",
					"#6366f1",
				];
				const defaultColor =
					defaultColors[(nextIndex - 1) % defaultColors.length] ?? "#3b82f6";
				const newProfile: SpeakerProfile = {
					id: `speaker-${nextIndex}`,
					name: input?.name || `N${nextIndex}`,
					color: input?.color || defaultColor,
				};
				set((s) => ({
					speakerProfiles: [...s.speakerProfiles, newProfile],
				}));
				return newProfile;
			},
			renameSpeaker: ({ speakerId, name }) =>
				set((state) => ({
					speakerProfiles: state.speakerProfiles.map((profile) =>
						profile.id === speakerId || profile.name === speakerId
							? { ...profile, name }
							: profile,
					),
					extractedCues: state.extractedCues.map((cue) =>
						cue.speakerId === speakerId ||
						cue.speakerName === speakerId ||
						cue.speaker === speakerId
							? { ...cue, speaker: name, speakerName: name }
							: cue,
					),
				})),
			updateSpeakerProfile: (speakerId, partial) =>
				set((state) => {
					const existing = state.speakerProfiles.find(
						(profile) => profile.id === speakerId,
					);
					if (existing) {
						return {
							speakerProfiles: state.speakerProfiles.map((profile) =>
								profile.id === speakerId
									? { ...profile, ...partial }
									: profile,
							),
						};
					}
					const cue = state.extractedCues.find(
						(item) => (item.speakerId || "speaker-default") === speakerId,
					);
					return {
						speakerProfiles: [
							...state.speakerProfiles,
							{
								id: speakerId,
								name: cue?.speakerName || cue?.speaker || "Người nói 1",
								color: cue?.speakerColor || "#60a5fa",
								...partial,
							},
						],
					};
				}),

			isRecognizing: false,
			recognitionProgress: 0,

			setRecognitionProgress: (progress) =>
				set({ recognitionProgress: progress }),

			startRecognition: () => {
				set({ isRecognizing: true, recognitionProgress: 5 });
			},
			stopRecognition: () => {
				set({ isRecognizing: false, recognitionProgress: 100 });
			},

			activeStep: "extract",
			setActiveStep: (step) => set({ activeStep: step }),

			videoUrl: "",
			setVideoUrl: (url) => set({ videoUrl: url }),
			isDownloading: false,

			cues: [
				{
					id: "cue-1",
					startTime: 0.5,
					endTime: 3.2,
					originalText: "Welcome to our video subtitle recognition tool.",
					translatedText: "Chào mừng đến với công cụ nhận dạng phụ đề video.",
					speaker: "Speaker A",
					status: "ready",
				},
				{
					id: "cue-2",
					startTime: 3.8,
					endTime: 7.4,
					originalText:
						"You can extract captions using OCR frame detection or AI Speech Recognition.",
					translatedText:
						"Bạn có thể bóc phụ đề bằng OCR hoặc Nhận dạng giọng nói AI.",
					speaker: "Speaker A",
					status: "ready",
				},
			],
			setCues: (cues) => set({ cues }),
			updateCue: (id, partial) =>
				set((state) => ({
					cues: state.cues.map((cue) =>
						cue.id === id ? { ...cue, ...partial } : cue,
					),
				})),

			settings: {
				sourceLang: "en",
				targetLang: "vi",
				voiceEngine: "edge-tts",
				selectedVoiceId: "vi-VN-HoaiMyNeural",
				speedMatch: true,
				borrowGap: true,
				autoDucking: false,
				duckingVolume: 0.15,
				duckAttackMs: 150,
				duckReleaseMs: 400,
				sourceVolume: 0,
				ttsVolume: 0,
				voiceReduction: 1,
				voiceReductionEnabled: false,
				stemMusicVolume: 1,
				stemVocalVolume: 0,
				translationStyle: "netflix",
				customGlossary: "",
				cueLeadSeconds: 0,
				cueTailSeconds: 0,
			},
			updateSettings: (partial) =>
				set((state) => ({
					settings: { ...state.settings, ...partial },
				})),
			duckOverrides: {},
			setDuckOverride: (key, override) =>
				set((state) => ({
					duckOverrides: {
						...state.duckOverrides,
						[key]: {
							...state.duckOverrides[key],
							...override,
						},
					},
				})),
			resetDuckOverrides: () => set({ duckOverrides: {} }),
			favoriteVoiceIds: [],
			toggleFavoriteVoice: (voiceId) =>
				set((state) => ({
					favoriteVoiceIds: state.favoriteVoiceIds.includes(voiceId)
						? state.favoriteVoiceIds.filter((id) => id !== voiceId)
						: [...state.favoriteVoiceIds, voiceId],
				})),

			isExtracting: false,
			isTranslating: false,
			isSynthesizing: false,

			simulateExtractOCR: () => {
				set({ isExtracting: true });
				setTimeout(() => {
					set({
						isExtracting: false,
						activeStep: "translate",
					});
				}, 1000);
			},
			simulateTranslate: () => {
				set({ isTranslating: true });
				setTimeout(() => {
					set({
						isTranslating: false,
						activeStep: "dubbing",
					});
				}, 1000);
			},
			simulateSynthesize: () => {
				set({ isSynthesizing: true });
				setTimeout(() => {
					set((state) => ({
						isSynthesizing: false,
						cues: state.cues.map((c) => ({ ...c, status: "ready" })),
					}));
				}, 1000);
			},
			addCue: () =>
				set((state) => {
					const lastCue = state.cues[state.cues.length - 1];
					const newStart = lastCue ? lastCue.endTime + 0.5 : 0;
					const newCue: DubbingCue = {
						id: `cue-${Date.now()}`,
						startTime: newStart,
						endTime: newStart + 3,
						originalText: "New caption line",
						translatedText: "Dòng phụ đề mới",
						speaker: "Speaker A",
						status: "ready",
					};
					return { cues: [...state.cues, newCue] };
				}),
			deleteCue: (id) =>
				set((state) => ({
					cues: state.cues.filter((c) => c.id !== id),
				})),

			runRealTranslation: async () => {
				set({ isTranslating: true });
				await new Promise((resolve) => setTimeout(resolve, 800));
				set((state) => ({
					isTranslating: false,
					activeStep: "dubbing",
				}));
			},
			runRealSingleTranslation: async (id) => {
				set((state) => ({
					cues: state.cues.map((c) =>
						c.id === id ? { ...c, status: "translating" } : c,
					),
				}));
				await new Promise((resolve) => setTimeout(resolve, 500));
				set((state) => ({
					cues: state.cues.map((c) =>
						c.id === id ? { ...c, status: "ready" } : c,
					),
				}));
			},
			runRealSynthesize: async () => {
				set({ isSynthesizing: true });
				await new Promise((resolve) => setTimeout(resolve, 1000));
				set((state) => ({
					isSynthesizing: false,
					cues: state.cues.map((c) => ({ ...c, status: "ready" })),
				}));
			},
			importSrtContent: (srtText, fileName) => {
				const blocks = srtText.trim().split(/\n\s*\n/);
				const parsed: DubbingCue[] = [];
				blocks.forEach((block, idx) => {
					const lines = block.split("\n").map((l) => l.trim());
					if (lines.length >= 3) {
						const timeMatch = lines[1].match(
							/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
						);
						if (timeMatch) {
							const start =
								parseInt(timeMatch[1]) * 3600 +
								parseInt(timeMatch[2]) * 60 +
								parseInt(timeMatch[3]) +
								parseInt(timeMatch[4]) / 1000;
							const end =
								parseInt(timeMatch[5]) * 3600 +
								parseInt(timeMatch[6]) * 60 +
								parseInt(timeMatch[7]) +
								parseInt(timeMatch[8]) / 1000;
							const text = lines.slice(2).join(" ");
							parsed.push({
								id: `cue-srt-${idx}`,
								startTime: start,
								endTime: end,
								originalText: text,
								translatedText: text,
								speaker: "Speaker A",
								status: "ready",
							});
						}
					}
				});
				if (parsed.length > 0) {
					set({ cues: parsed });
				}
			},
			exportSrtContent: (useTranslated = true) => {
				const { cues } = get();
				let srt = "";
				cues.forEach((cue, index) => {
					const formatTime = (seconds: number) => {
						const date = new Date(seconds * 1000);
						const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
						const mm = String(date.getUTCMinutes()).padStart(2, "0");
						const ss = String(date.getUTCSeconds()).padStart(2, "0");
						const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
						return `${hh}:${mm}:${ss},${ms}`;
					};
					const text = useTranslated
						? cue.translatedText || cue.originalText
						: cue.originalText;
					srt += `${index + 1}\n`;
					srt += `${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n`;
					srt += `${text}\n\n`;
				});
				return srt;
			},
		}),
		{
			name: "dubbing-store",
			partialize: (state) => ({
				settings: state.settings,
				favoriteVoiceIds: state.favoriteVoiceIds,
				videoUrl: state.videoUrl,
				selectedOcrEngine: state.selectedOcrEngine,
				selectedAsrEngine: state.selectedAsrEngine,
				recognitionMode: state.recognitionMode,
				ocrRegions: state.ocrRegions,
				speakerDiarizationEnabled: state.speakerDiarizationEnabled,
				speakerCount: state.speakerCount,
				extractedLanguage: state.extractedLanguage,
				extractedCues: state.extractedCues,
				speakerProfiles: state.speakerProfiles,
			}),
			merge: (persisted, current) => {
				const saved =
					persisted !== null && typeof persisted === "object"
						? Object.fromEntries(Object.entries(persisted))
						: {};
				const savedSettings =
					saved.settings !== null && typeof saved.settings === "object"
						? saved.settings
						: {};
				return {
					...current,
					...saved,
					settings: { ...current.settings, ...savedSettings },
				};
			},
		},
	),
);
