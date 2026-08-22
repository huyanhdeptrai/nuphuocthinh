import type { TextElement, TextStroke, TextShadow } from "@/types/timeline";

export interface TextStylePreset {
	id: string;
	name: string;
	styles: Partial<
		Pick<
			TextElement,
			| "color"
			| "backgroundColor"
			| "stroke"
			| "shadow"
			| "fontWeight"
			| "backgroundBorderRadius"
			| "backgroundPaddingX"
			| "backgroundPaddingY"
		>
	>;
	preview: {
		color: string;
		backgroundColor?: string;
		stroke?: TextStroke;
		shadow?: TextShadow;
		fontWeight?: "normal" | "bold";
	};
}

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
	{
		id: "clear-all",
		name: "Mặc định (Không viền/nền)",
		styles: {
			color: "#ffffff",
			backgroundColor: "transparent",
			stroke: undefined,
			shadow: undefined,
		},
		preview: {
			color: "#ffffff",
		},
	},
	{
		id: "neon-modern",
		name: "Neon hiện đại (#E2FD53 / #02252D)",
		styles: {
			color: "#02252D",
			backgroundColor: "#E2FD53",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#02252D",
			backgroundColor: "#E2FD53",
			fontWeight: "bold",
		},
	},
	{
		id: "yellow-tiktok",
		name: "Vàng TikTok (#FFD400 / #111111)",
		styles: {
			color: "#111111",
			backgroundColor: "#FFD400",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#111111",
			backgroundColor: "#FFD400",
			fontWeight: "bold",
		},
	},
	{
		id: "classic-contrast",
		name: "Classic (#111111 / #FFFFFF)",
		styles: {
			color: "#FFFFFF",
			backgroundColor: "#111111",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#FFFFFF",
			backgroundColor: "#111111",
			fontWeight: "bold",
		},
	},
	{
		id: "cream-navy",
		name: "Cream Navy (#FFF4D6 / #102A43)",
		styles: {
			color: "#102A43",
			backgroundColor: "#FFF4D6",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#102A43",
			backgroundColor: "#FFF4D6",
			fontWeight: "bold",
		},
	},
	{
		id: "cyan-dark",
		name: "Cyan Dark (#67E8F9 / #082F49)",
		styles: {
			color: "#082F49",
			backgroundColor: "#67E8F9",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#082F49",
			backgroundColor: "#67E8F9",
			fontWeight: "bold",
		},
	},
	{
		id: "mint-green",
		name: "Mint (#A7F3D0 / #064E3B)",
		styles: {
			color: "#064E3B",
			backgroundColor: "#A7F3D0",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#064E3B",
			backgroundColor: "#A7F3D0",
			fontWeight: "bold",
		},
	},
	{
		id: "pink-burgundy",
		name: "Pink Burgundy (#FFD1DC / #4A0D24)",
		styles: {
			color: "#4A0D24",
			backgroundColor: "#FFD1DC",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#4A0D24",
			backgroundColor: "#FFD1DC",
			fontWeight: "bold",
		},
	},
	{
		id: "peach-brown",
		name: "Peach Brown (#FFD0A8 / #4A1D0B)",
		styles: {
			color: "#4A1D0B",
			backgroundColor: "#FFD0A8",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#4A1D0B",
			backgroundColor: "#FFD0A8",
			fontWeight: "bold",
		},
	},
	{
		id: "lavender-purple",
		name: "Lavender (#E9D5FF / #312E81)",
		styles: {
			color: "#312E81",
			backgroundColor: "#E9D5FF",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#312E81",
			backgroundColor: "#E9D5FF",
			fontWeight: "bold",
		},
	},
	{
		id: "orange-navy",
		name: "Orange Navy (#FFB703 / #082F49)",
		styles: {
			color: "#082F49",
			backgroundColor: "#FFB703",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#082F49",
			backgroundColor: "#FFB703",
			fontWeight: "bold",
		},
	},
	{
		id: "dark-red-cream",
		name: "Dark Red (#8B1E2D / #FFF7E8)",
		styles: {
			color: "#FFF7E8",
			backgroundColor: "#8B1E2D",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#FFF7E8",
			backgroundColor: "#8B1E2D",
			fontWeight: "bold",
		},
	},
	{
		id: "purple-yellow",
		name: "Purple Yellow (#4C1D95 / #FDE047)",
		styles: {
			color: "#FDE047",
			backgroundColor: "#4C1D95",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#FDE047",
			backgroundColor: "#4C1D95",
			fontWeight: "bold",
		},
	},
	{
		id: "black-neon-lime",
		name: "Black Neon (#0B0F14 / #B6FF39)",
		styles: {
			color: "#B6FF39",
			backgroundColor: "#0B0F14",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#B6FF39",
			backgroundColor: "#0B0F14",
			fontWeight: "bold",
		},
	},
	{
		id: "white-shadow",
		name: "Trắng đổ bóng nhẹ",
		styles: {
			color: "#ffffff",
			stroke: undefined,
			shadow: { color: "#000000", offsetX: 2, offsetY: 2, blur: 4 },
		},
		preview: {
			color: "#ffffff",
			shadow: { color: "#000000", offsetX: 2, offsetY: 2, blur: 4 },
		},
	},
	{
		id: "white-black-stroke",
		name: "Trắng viền đen (CapCut)",
		styles: {
			color: "#ffffff",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#ffffff",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "white-deep-shadow",
		name: "Trắng bóng đen đậm",
		styles: {
			color: "#ffffff",
			stroke: undefined,
			shadow: { color: "#000000", offsetX: 3, offsetY: 3, blur: 0 },
		},
		preview: {
			color: "#ffffff",
			shadow: { color: "#000000", offsetX: 3, offsetY: 3, blur: 0 },
		},
	},
	{
		id: "black-white-stroke",
		name: "Đen viền trắng",
		styles: {
			color: "#000000",
			stroke: { color: "#ffffff", width: 4 },
			shadow: undefined,
		},
		preview: {
			color: "#000000",
			stroke: { color: "#ffffff", width: 4 },
		},
	},
	{
		id: "yellow-black-stroke",
		name: "Vàng viền đen (Sub Nổi bật)",
		styles: {
			color: "#ffeb3b",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#ffeb3b",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "red-white-stroke",
		name: "Đỏ viền trắng",
		styles: {
			color: "#f44336",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#f44336",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "orange-white-stroke",
		name: "Cam viền trắng",
		styles: {
			color: "#ff9800",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#ff9800",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "blue-white-stroke",
		name: "Xanh dương viền trắng",
		styles: {
			color: "#2196f3",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#2196f3",
			stroke: { color: "#ffffff", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "green-black-stroke",
		name: "Xanh lá viền đen",
		styles: {
			color: "#4caf50",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
		preview: {
			color: "#4caf50",
			stroke: { color: "#000000", width: 4 },
			shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		},
	},
	{
		id: "black-gray-box",
		name: "Chữ đen thẻ xám nhạt",
		styles: {
			color: "#000000",
			backgroundColor: "#e0e0e0",
			stroke: undefined,
			shadow: undefined,
		},
		preview: {
			color: "#000000",
			backgroundColor: "#e0e0e0",
		},
	},
	{
		id: "white-dark-gray-box",
		name: "Chữ trắng thẻ xám đậm",
		styles: {
			color: "#ffffff",
			backgroundColor: "#424242",
			stroke: undefined,
			shadow: undefined,
		},
		preview: {
			color: "#ffffff",
			backgroundColor: "#424242",
		},
	},
	{
		id: "black-yellow-box",
		name: "Chữ đen thẻ vàng (CapCut Box)",
		styles: {
			color: "#000000",
			backgroundColor: "#ffeb3b",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#000000",
			backgroundColor: "#ffeb3b",
			fontWeight: "bold",
		},
	},
	{
		id: "white-purple-box",
		name: "Chữ trắng thẻ tím",
		styles: {
			color: "#ffffff",
			backgroundColor: "#9c27b0",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#ffffff",
			backgroundColor: "#9c27b0",
			fontWeight: "bold",
		},
	},
	{
		id: "purple-white-box",
		name: "Chữ tím thẻ trắng",
		styles: {
			color: "#9c27b0",
			backgroundColor: "#ffffff",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#9c27b0",
			backgroundColor: "#ffffff",
			fontWeight: "bold",
		},
	},
	{
		id: "black-white-box",
		name: "Chữ đen thẻ trắng",
		styles: {
			color: "#000000",
			backgroundColor: "#ffffff",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#000000",
			backgroundColor: "#ffffff",
			fontWeight: "bold",
		},
	},
	{
		id: "white-black-box",
		name: "Chữ trắng thẻ đen",
		styles: {
			color: "#ffffff",
			backgroundColor: "#000000",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#ffffff",
			backgroundColor: "#000000",
			fontWeight: "bold",
		},
	},
	{
		id: "green-black-box",
		name: "Chữ xanh lá thẻ đen",
		styles: {
			color: "#00e676",
			backgroundColor: "#000000",
			stroke: undefined,
			shadow: undefined,
			fontWeight: "bold",
		},
		preview: {
			color: "#00e676",
			backgroundColor: "#000000",
			fontWeight: "bold",
		},
	},
	{
		id: "black-cyan-stroke",
		name: "Đen viền xanh ngọc Cyan",
		styles: {
			color: "#000000",
			stroke: { color: "#00e5ff", width: 4 },
			shadow: { color: "#00e5ff", offsetX: 0, offsetY: 0, blur: 6 },
		},
		preview: {
			color: "#000000",
			stroke: { color: "#00e5ff", width: 4 },
			shadow: { color: "#00e5ff", offsetX: 0, offsetY: 0, blur: 6 },
		},
	},
	{
		id: "yellow-red-stroke",
		name: "Vàng viền đỏ (TikTok Viral)",
		styles: {
			color: "#ffd600",
			stroke: { color: "#d50000", width: 4 },
			shadow: { color: "#000000", offsetX: 2, offsetY: 2, blur: 1 },
		},
		preview: {
			color: "#ffd600",
			stroke: { color: "#d50000", width: 4 },
			shadow: { color: "#000000", offsetX: 2, offsetY: 2, blur: 1 },
		},
	},
	{
		id: "pink-neon-glow",
		name: "Hồng Neon phát sáng",
		styles: {
			color: "#ff4081",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#ff4081", offsetX: 0, offsetY: 0, blur: 10 },
		},
		preview: {
			color: "#ff4081",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#ff4081", offsetX: 0, offsetY: 0, blur: 10 },
		},
	},
	{
		id: "gold-neon-glow",
		name: "Vàng kim Neon phát sáng",
		styles: {
			color: "#ffea00",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#ffea00", offsetX: 0, offsetY: 0, blur: 10 },
		},
		preview: {
			color: "#ffea00",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#ffea00", offsetX: 0, offsetY: 0, blur: 10 },
		},
	},
	{
		id: "neon-green-glow",
		name: "Xanh lục Neon phát sáng",
		styles: {
			color: "#00e676",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#00e676", offsetX: 0, offsetY: 0, blur: 10 },
		},
		preview: {
			color: "#00e676",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#00e676", offsetX: 0, offsetY: 0, blur: 10 },
		},
	},
	{
		id: "cyan-ice-glow",
		name: "Xanh băng tuyết Neon",
		styles: {
			color: "#00e5ff",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#00e5ff", offsetX: 0, offsetY: 0, blur: 10 },
		},
		preview: {
			color: "#00e5ff",
			stroke: { color: "#ffffff", width: 1.5 },
			shadow: { color: "#00e5ff", offsetX: 0, offsetY: 0, blur: 10 },
		},
	},
	{
		id: "white-red-glow",
		name: "Trắng hào quang Đỏ",
		styles: {
			color: "#ffffff",
			stroke: undefined,
			shadow: { color: "#ff1744", offsetX: 0, offsetY: 0, blur: 12 },
		},
		preview: {
			color: "#ffffff",
			shadow: { color: "#ff1744", offsetX: 0, offsetY: 0, blur: 12 },
		},
	},
];
