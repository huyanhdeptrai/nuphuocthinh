export const SITE_URL = "https://lemyloi-dichvideo.vercel.app";

export const SITE_INFO = {
	title: "Lemyloi-dichvideo",
	description:
		"Lemyloi-dichvideo is an AI-native, open-source video editor in your browser — a free, privacy-first alternative to CapCut. AI-powered editing, multi-track timeline, MP4/WebM export with no uploads.",
	url: SITE_URL,
	openGraphImage: "/logos/lemyloi-dichvideo/logo.png",
	twitterImage: "/logos/lemyloi-dichvideo/logo.png",
	favicon: "/logos/lemyloi-dichvideo/logo.png",
};

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [];

export const DEFAULT_LOGO_URL = "/logos/lemyloi-dichvideo/logo.png";

export const SOCIAL_LINKS = {
	x: "https://x.com/lemyloi-dichvideo",
	github: "https://github.com/9teeedev/lemyloi-dichvideo",
	discord: "",
};
