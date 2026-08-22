export type RecognitionMode = "ocr" | "asr";

export type OCREngineId =
	| "paddleocr"
	| "rapidocr"
	| "rapidocr-tiny"
	| "easyocr"
	| "google-vision"
	| "baidu-ocr"
	| "ocr-space";

export type ASREngineId =
	| "groq-whisper"
	| "openrouter"
	| "capcut-asr"
	| "bcut-bilibili";

export interface ASREngineOption {
	id: ASREngineId;
	name: string;
	provider: string;
	speed: string;
	description: string;
	recommendation: string;
}

export interface OCREngineOption {
	id: OCREngineId;
	name: string;
	provider: string;
	type: "local" | "cloud";
	speed: string;
	description: string;
	recommendation: string;
	apiKeyLink?: string;
	apiKeyPlaceholder?: string;
}

/** Normalized video coordinates, independent of source resolution. */
export interface OCRRegion {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	enabled: boolean;
}

export interface RecognitionCue {
	id: string;
	startTime: number;
	endTime: number;
	text: string;
	confidence?: number;
	speaker?: string;
	speakerId?: string;
	speakerName?: string;
	speakerColor?: string;
}

export type SpeakerGender = "male" | "female" | "unknown";

export interface SpeakerProfile {
	id: string;
	name: string;
	color: string;
	gender?: SpeakerGender;
	/** How this speaker refers to themselves in Vietnamese, e.g. em / anh / tôi. */
	selfPronoun?: string;
	/** How this speaker addresses the other person, e.g. anh / em / cậu. */
	addressPronoun?: string;
}

export type SpeakerCountSetting = "auto" | number;

export interface DubbingCue {
	id: string;
	startTime: number;
	endTime: number;
	originalText: string;
	translatedText: string;
	speaker: string;
	audioUrl?: string;
	status:
		| "idle"
		| "transcribing"
		| "translating"
		| "synthesizing"
		| "ready"
		| "error";
}

export interface VoiceOption {
	id: string;
	name: string;
	gender: "male" | "female";
	lang: string;
	provider:
		| "edge-tts"
		| "capcut"
		| "vieneu"
		| "supertonic"
		| "omnivoice"
		| "openai"
		| "elevenlabs"
		| "gemini";
	description: string;
}

export type TtsProvider =
	| "edge-tts"
	| "capcut"
	| "vieneu"
	| "supertonic"
	| "omnivoice"
	| "elevenlabs"
	| "gemini";

export interface VoiceCatalogItem {
	id: string;
	voiceId: string;
	name: string;
	provider: TtsProvider;
	gender: "male" | "female" | "unknown";
	lang: string;
	region: string;
	description: string;
	sampleText: string;
	available: boolean;
	isCloned?: boolean;
	defaultRate?: number;
	defaultPitch?: number;
	defaultVolumeGain?: number;
}

export interface DubbingSettings {
	sourceLang: string;
	targetLang: string;
	voiceEngine:
		| "edge-tts"
		| "capcut"
		| "vieneu"
		| "supertonic"
		| "omnivoice"
		| "elevenlabs"
		| "gemini"
		| "openai";
	selectedVoiceId: string;
	speedMatch: boolean;
	borrowGap: boolean;
	autoDucking: boolean;
	duckingVolume: number;
	/** Fade in / attack duration in milliseconds when ducking starts (default 150ms). */
	duckAttackMs?: number;
	/** Fade out / release duration in milliseconds when ducking ends (default 400ms). */
	duckReleaseMs?: number;
	/** dB volume applied to the original video audio when narration is generated. */
	sourceVolume: number;
	/** dB volume applied to generated TTS clips. */
	ttsVolume: number;
	/** Centre-channel speech reduction amount for original video audio. */
	voiceReduction: number;
	voiceReductionEnabled: boolean;
	/** Isolated music/SFX gain after Vocal Remover, 0–1. */
	stemMusicVolume: number;
	/** Isolated original-voice gain after Vocal Remover, 0–1. */
	stemVocalVolume: number;
	translationStyle: "standard" | "netflix" | "casual" | "story";
	customGlossary: string;
	/** Positive values make the subtitle appear earlier than its source cue. */
	cueLeadSeconds: number;
	/** Positive values make the subtitle disappear later than its source cue. */
	cueTailSeconds: number;
}

export type DubbingActiveStep =
	| "download"
	| "extract"
	| "translate"
	| "dubbing";
