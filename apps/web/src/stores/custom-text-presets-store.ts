import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TextElement, TextStroke, TextShadow } from "@/types/timeline";
import { nanoid } from "nanoid";

export interface CustomTextStylePreset {
	id: string;
	name: string;
	createdAt: number;
	styles: {
		fontFamily?: string;
		fontSize?: number;
		color?: string;
		backgroundColor?: string;
		stroke?: TextStroke;
		shadow?: TextShadow;
		fontWeight?: "normal" | "bold";
		fontStyle?: "normal" | "italic";
		textDecoration?: "none" | "underline" | "line-through";
		textAlign?: "left" | "center" | "right";
		opacity?: number;
		backgroundBorderRadius?: number;
		backgroundOpacity?: number;
		backgroundPaddingX?: number;
		backgroundPaddingY?: number;
		positionY?: number;
	};
	preview: {
		color: string;
		backgroundColor?: string;
		stroke?: TextStroke;
		shadow?: TextShadow;
		fontWeight?: "normal" | "bold";
	};
}

interface CustomTextPresetsState {
	presets: CustomTextStylePreset[];
	savePreset: ({
		name,
		element,
	}: {
		name: string;
		element: TextElement;
	}) => CustomTextStylePreset;
	deletePreset: (id: string) => void;
	renamePreset: (id: string, name: string) => void;
}

export const useCustomTextPresetsStore = create<CustomTextPresetsState>()(
	persist(
		(set, get) => ({
			presets: [],
			savePreset: ({ name, element }) => {
				const trimmedName = name.trim() || `Preset ${get().presets.length + 1}`;
				const newPreset: CustomTextStylePreset = {
					id: nanoid(),
					name: trimmedName,
					createdAt: Date.now(),
					styles: {
						fontFamily: element.fontFamily,
						fontSize: element.fontSize,
						color: element.color,
						backgroundColor: element.backgroundColor,
						stroke: element.stroke ? { ...element.stroke } : undefined,
						shadow: element.shadow ? { ...element.shadow } : undefined,
						fontWeight: element.fontWeight,
						fontStyle: element.fontStyle,
						textDecoration: element.textDecoration,
						textAlign: element.textAlign,
						opacity: element.opacity,
						backgroundBorderRadius: element.backgroundBorderRadius,
						backgroundOpacity: element.backgroundOpacity,
						backgroundPaddingX: element.backgroundPaddingX,
						backgroundPaddingY: element.backgroundPaddingY,
						positionY: element.transform?.position?.y,
					},
					preview: {
						color: element.color || "#ffffff",
						backgroundColor:
							element.backgroundColor && element.backgroundColor !== "transparent"
								? element.backgroundColor
								: undefined,
						stroke: element.stroke ? { ...element.stroke } : undefined,
						shadow: element.shadow ? { ...element.shadow } : undefined,
						fontWeight: element.fontWeight,
					},
				};

				set((state) => ({
					presets: [newPreset, ...state.presets],
				}));

				return newPreset;
			},
			deletePreset: (id) => {
				set((state) => ({
					presets: state.presets.filter((p) => p.id !== id),
				}));
			},
			renamePreset: (id, name) => {
				const trimmed = name.trim();
				if (!trimmed) return;
				set((state) => ({
					presets: state.presets.map((p) =>
						p.id === id ? { ...p, name: trimmed } : p,
					),
				}));
			},
		}),
		{
			name: "custom-text-style-presets",
		},
	),
);
