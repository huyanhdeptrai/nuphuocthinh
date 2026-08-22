export const GEMINI_TTS_MODELS = [
	"gemini-3.1-flash-tts-preview",
	"gemini-2.5-flash-preview-tts",
	"gemini-2.5-pro-preview-tts",
] as const;

export const GEMINI_TTS_LANGUAGES = [
	{ id: "vi-VN", name: "Tiếng Việt (Việt Nam)" },
	{ id: "en-US", name: "English (United States)" },
	{ id: "en-GB", name: "English (United Kingdom)" },
	{ id: "ja-JP", name: "日本語" },
	{ id: "ko-KR", name: "한국어" },
	{ id: "zh-CN", name: "中文（普通话）" },
	{ id: "fr-FR", name: "Français" },
	{ id: "de-DE", name: "Deutsch" },
	{ id: "es-ES", name: "Español" },
] as const;

export const GEMINI_TTS_VOICES = [
	"Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede",
	"Autonoe", "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome",
	"Fenrir", "Gacrux", "Iapetus", "Kore", "Leda", "Orus", "Puck",
	"Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
	"Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi",
] as const;

export type GeminiTtsModel = (typeof GEMINI_TTS_MODELS)[number];

