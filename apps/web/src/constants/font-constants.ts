export type FontCategory =
	| "all"
	| "sans"
	| "display"
	| "handwriting"
	| "serif"
	| "system";

export interface FontOption {
	value: string;
	label: string;
	category: "system" | "google" | "custom";
	fontType: "sans" | "display" | "handwriting" | "serif" | "system";
	weights?: number[];
	hasClassName?: boolean;
	vietnamese?: boolean;
	previewText?: string;
}

export const FONT_CATEGORIES: { id: FontCategory; label: string; labelVi: string }[] = [
	{ id: "all", label: "All Fonts", labelVi: "Tất cả" },
	{ id: "sans", label: "Modern / Sans", labelVi: "Phổ biến & Hiện đại" },
	{ id: "display", label: "TikTok / Display", labelVi: "Tiêu đề & TikTok" },
	{ id: "handwriting", label: "Handwriting", labelVi: "Viết tay & Nghệ thuật" },
	{ id: "serif", label: "Serif / Classic", labelVi: "Có chân & Cổ điển" },
	{ id: "system", label: "System", labelVi: "Hệ thống" },
];

export const FONT_OPTIONS: FontOption[] = [
	// ==========================================
	// 1. Phổ biến & Hiện đại (Sans-serif) - Rất chuẩn cho phụ đề, dễ đọc
	// ==========================================
	{
		value: "Be Vietnam Pro",
		label: "Be Vietnam Pro",
		category: "google",
		fontType: "sans",
		weights: [400, 500, 600, 700],
		vietnamese: true,
		previewText: "Phụ đề chuẩn tiếng Việt",
	},
	{
		value: "Montserrat",
		label: "Montserrat",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700, 800],
		vietnamese: true,
		previewText: "Hình học hiện đại sang trọng",
	},
	{
		value: "Inter",
		label: "Inter",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		hasClassName: true,
		vietnamese: true,
		previewText: "Siêu nét chuẩn giao diện",
	},
	{
		value: "Roboto",
		label: "Roboto",
		category: "google",
		fontType: "sans",
		weights: [400, 500, 700],
		hasClassName: true,
		vietnamese: true,
		previewText: "Kinh điển, rõ ràng mọi kích cỡ",
	},
	{
		value: "Open Sans",
		label: "Open Sans",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		hasClassName: true,
		vietnamese: true,
		previewText: "Thân thiện, dễ đọc",
	},
	{
		value: "Plus Jakarta Sans",
		label: "Plus Jakarta Sans",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Thời thượng, phong cách mới",
	},
	{
		value: "Lexend",
		label: "Lexend",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Tối ưu tốc độ đọc phụ đề",
	},
	{
		value: "Lexend Deca",
		label: "Lexend Deca",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Thoáng đãng, rõ nét cho video",
	},
	{
		value: "Manrope",
		label: "Manrope",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Hiện đại, công nghệ cao",
	},
	{
		value: "Mulish",
		label: "Mulish",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Tối giản, thanh lịch",
	},
	{
		value: "Quicksand",
		label: "Quicksand",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Bo tròn nhẹ, mềm mại",
	},
	{
		value: "Nunito",
		label: "Nunito",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700, 800],
		vietnamese: true,
		previewText: "Bo tròn thân thiện, cuốn hút",
	},
	{
		value: "Nunito Sans",
		label: "Nunito Sans",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Cân đối, dễ nhìn cho video dài",
	},
	{
		value: "Work Sans",
		label: "Work Sans",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Chuyên nghiệp, chuẩn mực",
	},
	{
		value: "Raleway",
		label: "Raleway",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Thanh lịch, đẳng cấp",
	},
	{
		value: "Rubik",
		label: "Rubik",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Năng động, thể thao",
	},
	{
		value: "Comfortaa",
		label: "Comfortaa",
		category: "google",
		fontType: "sans",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Tròn trịa hiện đại, sáng tạo",
	},
	{
		value: "Urbanist",
		label: "Urbanist",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Hình học sắc sảo, tối giản",
	},
	{
		value: "Bai Jamjuree",
		label: "Bai Jamjuree",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Góc cạnh hiện đại, cá tính",
	},
	{
		value: "Titillium Web",
		label: "Titillium Web",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Phong cách công nghệ, sắc sảo",
	},
	{
		value: "Barlow",
		label: "Barlow",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Hiện đại, rõ ràng",
	},
	{
		value: "Barlow Condensed",
		label: "Barlow Condensed",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Dáng hẹp gọn gàng cho phụ đề",
	},
	{
		value: "Kanit",
		label: "Kanit",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Dày dặn, chuẩn trend video",
	},
	{
		value: "Josefin Sans",
		label: "Josefin Sans",
		category: "google",
		fontType: "sans",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Hình học vintage tinh tế",
	},

	// ==========================================
	// 2. Tiêu đề / TikTok / Shorts (Display / Condensed / Bold)
	// ==========================================
	{
		value: "Oswald",
		label: "Oswald",
		category: "google",
		fontType: "display",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Chuẩn font phụ đề TikTok & Reels",
	},
	{
		value: "Anton",
		label: "Anton",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Chữ đậm to bản, giật tít",
	},
	{
		value: "Saira",
		label: "Saira",
		category: "google",
		fontType: "display",
		weights: [400, 600, 700, 800],
		vietnamese: true,
		previewText: "Đậm nét, dứt khoát",
	},
	{
		value: "Saira Extra Condensed",
		label: "Saira Extra Condensed",
		category: "google",
		fontType: "display",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Siêu gọn cho video khung dọc",
	},
	{
		value: "Saira Condensed",
		label: "Saira Condensed",
		category: "google",
		fontType: "display",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Nén gọn, dễ xếp hàng dài",
	},
	{
		value: "Archivo Black",
		label: "Archivo Black",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Cực đậm, nổi bật mạnh mẽ",
	},
	{
		value: "Paytone One",
		label: "Paytone One",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Dày dặn, vui tươi bắt mắt",
	},
	{
		value: "Russo One",
		label: "Russo One",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Khỏe khoắn, phong cách gaming",
	},
	{
		value: "Chakra Petch",
		label: "Chakra Petch",
		category: "google",
		fontType: "display",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Sci-Fi, Cyberpunk góc cạnh",
	},
	{
		value: "Righteous",
		label: "Righteous",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Retro sáng tạo độc đáo",
	},
	{
		value: "Bangers",
		label: "Bangers",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Phong cách truyện tranh Comic",
	},
	{
		value: "Concert One",
		label: "Concert One",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Vui nhộn, thân thiện",
	},
	{
		value: "Titan One",
		label: "Titan One",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Chữ mập lùn siêu dễ thương",
	},
	{
		value: "Alfa Slab One",
		label: "Alfa Slab One",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Chữ khối to dập nổi bật",
	},
	{
		value: "Rowdies",
		label: "Rowdies",
		category: "google",
		fontType: "display",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Cá tính, phá cách cho Shorts",
	},
	{
		value: "Pattaya",
		label: "Pattaya",
		category: "google",
		fontType: "display",
		weights: [400],
		vietnamese: true,
		previewText: "Cách điệu display độc đáo",
	},

	// ==========================================
	// 3. Viết tay / Nghệ thuật (Handwriting & Script)
	// ==========================================
	{
		value: "Caveat",
		label: "Caveat",
		category: "google",
		fontType: "handwriting",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Viết tay bút mực tự nhiên",
	},
	{
		value: "Dancing Script",
		label: "Dancing Script",
		category: "google",
		fontType: "handwriting",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Mềm mại, lãng mạn, thơ mộng",
	},
	{
		value: "Pacifico",
		label: "Pacifico",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Bút lông cọ vintage rực rỡ",
	},
	{
		value: "Patrick Hand",
		label: "Patrick Hand",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Chữ viết tay học đường dễ mến",
	},
	{
		value: "Itim",
		label: "Itim",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Viết tay dễ thương phong cách Vlog",
	},
	{
		value: "Mali",
		label: "Mali",
		category: "google",
		fontType: "handwriting",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Nét vẽ trẻ trung đáng yêu",
	},
	{
		value: "Sriracha",
		label: "Sriracha",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Viết tay mềm mại lôi cuốn",
	},
	{
		value: "Kalam",
		label: "Kalam",
		category: "google",
		fontType: "handwriting",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Bút bi chân thực tự nhiên",
	},
	{
		value: "Marck Script",
		label: "Marck Script",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Bút lông uốn lượn cổ điển",
	},
	{
		value: "Alex Brush",
		label: "Alex Brush",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Thư pháp thanh lịch trang trọng",
	},
	{
		value: "Great Vibes",
		label: "Great Vibes",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Thư pháp uốn lượn nghệ thuật",
	},
	{
		value: "Satisfy",
		label: "Satisfy",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Viết tay tự do phóng khoáng",
	},
	{
		value: "Playball",
		label: "Playball",
		category: "google",
		fontType: "handwriting",
		weights: [400],
		vietnamese: true,
		previewText: "Chữ nghiêng thể thao năng động",
	},

	// ==========================================
	// 4. Có chân & Cổ điển (Serif)
	// ==========================================
	{
		value: "Playfair Display",
		label: "Playfair Display",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		hasClassName: true,
		vietnamese: true,
		previewText: "Thời trang, quý phái, tạp chí",
	},
	{
		value: "Merriweather",
		label: "Merriweather",
		category: "google",
		fontType: "serif",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Báo chí êm mắt, tinh tế",
	},
	{
		value: "Lora",
		label: "Lora",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Văn học thi ca nghệ thuật",
	},
	{
		value: "EB Garamond",
		label: "EB Garamond",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Cổ điển tinh hoa châu Âu",
	},
	{
		value: "Cormorant Garamond",
		label: "Cormorant Garamond",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Thanh tao quý tộc sang trọng",
	},
	{
		value: "Prata",
		label: "Prata",
		category: "google",
		fontType: "serif",
		weights: [400],
		vietnamese: true,
		previewText: "Thời trang cao cấp ấn tượng",
	},
	{
		value: "Bitter",
		label: "Bitter",
		category: "google",
		fontType: "serif",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Chân dày cá tính mạnh mẽ",
	},
	{
		value: "Vollkorn",
		label: "Vollkorn",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Vững chãi, mộc mạc sách báo",
	},
	{
		value: "Noto Serif",
		label: "Noto Serif",
		category: "google",
		fontType: "serif",
		weights: [400, 700],
		vietnamese: true,
		previewText: "Chuẩn mực cổ điển mọi văn bản",
	},
	{
		value: "Spectral",
		label: "Spectral",
		category: "google",
		fontType: "serif",
		weights: [400, 600, 700],
		vietnamese: true,
		previewText: "Thanh nhã trang trọng điện ảnh",
	},

	// ==========================================
	// 5. Hệ thống (System Fonts)
	// ==========================================
	{
		value: "Arial",
		label: "Arial",
		category: "system",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Phông chữ chuẩn hệ thống",
	},
	{
		value: "Helvetica",
		label: "Helvetica",
		category: "system",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Gọn gàng, tiêu chuẩn toàn cầu",
	},
	{
		value: "Times New Roman",
		label: "Times New Roman",
		category: "system",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Soạn thảo văn bản kinh điển",
	},
	{
		value: "Georgia",
		label: "Georgia",
		category: "system",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Chữ có chân trang nhã trên màn hình",
	},
	{
		value: "Impact",
		label: "Impact",
		category: "system",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Dày đậm tạo điểm nhấn",
	},
	{
		value: "Comic Neue",
		label: "Comic Neue",
		category: "google",
		fontType: "system",
		hasClassName: false,
		vietnamese: true,
		previewText: "Vui vẻ thoải mái",
	},
] as const;

export const DEFAULT_FONT = "Arial";

// Type-safe font family union
export type FontFamily = (typeof FONT_OPTIONS)[number]["value"] | string;

// Helper functions
export const getFontByValue = (value: string): FontOption | undefined =>
	FONT_OPTIONS.find((font) => font.value.toLowerCase() === value.toLowerCase());

export const getGoogleFonts = (): FontOption[] =>
	FONT_OPTIONS.filter((font) => font.category === "google");

export const getSystemFonts = (): FontOption[] =>
	FONT_OPTIONS.filter((font) => font.category === "system");

export const getFontsByType = (type: FontCategory): FontOption[] => {
	if (type === "all") return [...FONT_OPTIONS];
	return FONT_OPTIONS.filter((font) => font.fontType === type);
};

export const searchFonts = (query: string, category: FontCategory = "all"): FontOption[] => {
	const trimmed = query.trim().toLowerCase();
	const pool = getFontsByType(category);
	if (!trimmed) return pool;
	return pool.filter(
		(font) =>
			font.label.toLowerCase().includes(trimmed) ||
			font.value.toLowerCase().includes(trimmed) ||
			(font.previewText && font.previewText.toLowerCase().includes(trimmed)),
	);
};

// URL builder for Google Fonts CSS API
export const getGoogleFontsStylesheetUrls = (): string[] => {
	const googleFonts = FONT_OPTIONS.filter((f) => f.category === "google");
	
	// Batch fonts into chunks to avoid overly long URLs
	const chunks: FontOption[][] = [];
	const chunkSize = 25;
	for (let i = 0; i < googleFonts.length; i += chunkSize) {
		chunks.push(googleFonts.slice(i, i + chunkSize));
	}

	return chunks.map((chunk) => {
		const families = chunk
			.map((font) => {
				const encodedName = font.value.replace(/ /g, "+");
				if (font.weights && font.weights.length > 0) {
					return `family=${encodedName}:wght@${font.weights.join(";")}`;
				}
				return `family=${encodedName}`;
			})
			.join("&");
		return `https://fonts.googleapis.com/css2?${families}&subset=vietnamese&display=swap`;
	});
};
