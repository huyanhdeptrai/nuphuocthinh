import type { ElementType } from "react";
import { create } from "zustand";
import {
	AiBrain01Icon,
	ArrowRightDoubleIcon,
	ClosedCaptionIcon,
	Folder03Icon,
	Happy01Icon,
	HeadphonesIcon,
	MagicWand05Icon,
	TextIcon,
	Settings01Icon,
	ColorsIcon,
	TranslateIcon,
	VoiceIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Layers } from "lucide-react";

export const TAB_KEYS = [
	"media",
	"sounds",
	"text",
	"overlays",
	"stickers",
	"effects",
	"transitions",
	"recognition",
	"translation",
	"voice-library",
	"narration",
	"filters",
	"ai",
	"settings",
] as const;

export type Tab = (typeof TAB_KEYS)[number];

const createHugeiconsIcon =
	({ icon }: { icon: IconSvgElement }) =>
	({ className }: { className?: string }) => (
		<HugeiconsIcon icon={icon} className={className} />
	);

const TAB_LABELS: Record<Tab, string> = {
	media: "Media",
	sounds: "Sounds",
	text: "Text",
	overlays: "Lớp phủ",
	stickers: "Stickers",
	effects: "Effects",
	transitions: "Transitions",
	recognition: "Nhận Dạng Videos",
	translation: "Dịch Thuật AI",
	"voice-library": "Kho Mẫu Giọng",
	narration: "Thuyết minh",
	filters: "Filters",
	ai: "AI",
	settings: "Settings",
};

export const tabs = {
	media: {
		icon: createHugeiconsIcon({ icon: Folder03Icon }),
		label: TAB_LABELS.media,
	},
	sounds: {
		icon: createHugeiconsIcon({ icon: HeadphonesIcon }),
		label: TAB_LABELS.sounds,
	},
	text: {
		icon: createHugeiconsIcon({ icon: TextIcon }),
		label: TAB_LABELS.text,
	},
	overlays: {
		icon: Layers,
		label: TAB_LABELS.overlays,
	},
	stickers: {
		icon: createHugeiconsIcon({ icon: Happy01Icon }),
		label: TAB_LABELS.stickers,
	},
	effects: {
		icon: createHugeiconsIcon({ icon: MagicWand05Icon }),
		label: TAB_LABELS.effects,
	},
	transitions: {
		icon: createHugeiconsIcon({ icon: ArrowRightDoubleIcon }),
		label: TAB_LABELS.transitions,
	},
	recognition: {
		icon: createHugeiconsIcon({ icon: ClosedCaptionIcon }),
		label: TAB_LABELS.recognition,
	},
	translation: {
		icon: createHugeiconsIcon({ icon: TranslateIcon }),
		label: TAB_LABELS.translation,
	},
	"voice-library": {
		icon: createHugeiconsIcon({ icon: VoiceIcon }),
		label: TAB_LABELS["voice-library"],
	},
	narration: {
		icon: createHugeiconsIcon({ icon: HeadphonesIcon }),
		label: TAB_LABELS.narration,
	},
	filters: {
		icon: createHugeiconsIcon({ icon: ColorsIcon }),
		label: TAB_LABELS.filters,
	},
	ai: {
		icon: createHugeiconsIcon({ icon: AiBrain01Icon }),
		label: TAB_LABELS.ai,
	},
	settings: {
		icon: createHugeiconsIcon({ icon: Settings01Icon }),
		label: TAB_LABELS.settings,
	},
} satisfies Record<
	Tab,
	{ icon: ElementType<{ className?: string }>; label: string }
>;

type MediaViewMode = "grid" | "list";

interface AssetsPanelStore {
	activeTab: Tab;
	setActiveTab: (tab: Tab) => void;
	highlightMediaId: string | null;
	requestRevealMedia: (mediaId: string) => void;
	clearHighlight: () => void;

	/* Media */
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;

	settingsTab: "project-info" | "background" | "ai";
	setSettingsTab: (tab: "project-info" | "background" | "ai") => void;
}

export const useAssetsPanelStore = create<AssetsPanelStore>((set) => ({
	activeTab: "media",
	setActiveTab: (tab) => set({ activeTab: tab }),
	highlightMediaId: null,
	requestRevealMedia: (mediaId) =>
		set({ activeTab: "media", highlightMediaId: mediaId }),
	clearHighlight: () => set({ highlightMediaId: null }),
	mediaViewMode: "grid",
	setMediaViewMode: (mode) => set({ mediaViewMode: mode }),
	settingsTab: "project-info",
	setSettingsTab: (settingsTab) => set({ settingsTab }),
}));
