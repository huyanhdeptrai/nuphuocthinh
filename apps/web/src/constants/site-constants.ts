export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4000";

export const SITE_INFO = {
	title: "nuphuocthinh",
	description:
		"nuphuocthinh — trình chỉnh sửa, dịch phụ đề và thuyết minh video dùng cá nhân.",
	url: SITE_URL,
	openGraphImage: "/brand/nuphuocthinh/logo.png",
	twitterImage: "/brand/nuphuocthinh/logo.png",
	favicon: "/brand/nuphuocthinh/logo.png",
};

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [];

export const DEFAULT_LOGO_URL = "/brand/nuphuocthinh/logo.png";

export const SOCIAL_LINKS = {
	x: "",
	github: "",
	discord: "",
};
