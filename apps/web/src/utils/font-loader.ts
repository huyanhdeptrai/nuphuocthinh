import { FONT_OPTIONS, getGoogleFontsStylesheetUrls } from "@/constants/font-constants";

const loadedFonts = new Set<string>();
let sheetsInjected = false;

/**
 * Injects Google Fonts stylesheets into document head if not already present
 */
export function injectGoogleFontsStylesheets(): void {
	if (typeof window === "undefined" || sheetsInjected) return;

	// Preconnect links
	if (!document.querySelector("link[data-lemyloi-dichvideo-preconnect]")) {
		const preconnect1 = document.createElement("link");
		preconnect1.rel = "preconnect";
		preconnect1.href = "https://fonts.googleapis.com";
		preconnect1.setAttribute("data-lemyloi-dichvideo-preconnect", "true");
		document.head.appendChild(preconnect1);

		const preconnect2 = document.createElement("link");
		preconnect2.rel = "preconnect";
		preconnect2.href = "https://fonts.gstatic.com";
		preconnect2.crossOrigin = "anonymous";
		preconnect2.setAttribute("data-lemyloi-dichvideo-preconnect", "true");
		document.head.appendChild(preconnect2);
	}

	// Stylesheet links
	const urls = getGoogleFontsStylesheetUrls();
	urls.forEach((url, idx) => {
		const selector = `link[data-lemyloi-dichvideo-font-batch="${idx}"]`;
		if (!document.querySelector(selector)) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = url;
			link.setAttribute("data-lemyloi-dichvideo-font-batch", String(idx));
			document.head.appendChild(link);
		}
	});

	sheetsInjected = true;
}

/**
 * Ensures a specific font family is loaded and ready in document.fonts
 */
export async function ensureFontLoaded(fontFamily: string, weight = "400"): Promise<boolean> {
	if (typeof window === "undefined" || !("fonts" in document)) return true;

	injectGoogleFontsStylesheets();

	const fontKey = `${fontFamily}_${weight}`;
	if (loadedFonts.has(fontKey)) return true;

	try {
		// Wait for font to be loaded in document.fonts API
		await document.fonts.load(`${weight} 16px "${fontFamily}"`);
		loadedFonts.add(fontKey);
		return true;
	} catch (e) {
		console.warn(`[font-loader] Could not load font ${fontFamily}:`, e);
		return false;
	}
}
