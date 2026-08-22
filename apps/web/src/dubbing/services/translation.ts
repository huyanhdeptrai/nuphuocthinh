/**
 * Translation service using Google Translate GTX endpoint with custom glossary support.
 */

export interface TranslationOptions {
	sourceLang?: string; // default "auto"
	targetLang?: string; // default "vi"
	customGlossary?: string; // e.g. "Speaker A=Anh, Speaker B=Em"
}

/**
 * Translates a single text string.
 */
export async function translateText(
	text: string,
	options: TranslationOptions = {}
): Promise<string> {
	if (!text || !text.trim()) return "";

	const sourceLang = options.sourceLang || "auto";
	const targetLang = options.targetLang || "vi";

	try {
		const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
			sourceLang
		)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Translation HTTP error! status: ${res.status}`);
		}

		const data = await res.json();
		let translated = "";

		if (Array.isArray(data) && Array.isArray(data[0])) {
			for (const item of data[0]) {
				if (item?.[0]) {
					translated += item[0];
				}
			}
		}

		if (!translated) {
			translated = text;
		}

		// Apply custom glossary if provided
		if (options.customGlossary) {
			translated = applyGlossary(translated, options.customGlossary);
		}

		return translated;
	} catch {
		return text;
	}
}

/**
 * Batch translates multiple strings.
 */
export async function translateBatch(
	texts: string[],
	options: TranslationOptions = {}
): Promise<string[]> {
	const results: string[] = [];
	for (const text of texts) {
		const translated = await translateText(text, options);
		results.push(translated);
	}
	return results;
}

/**
 * Replaces words based on key=value pairs in customGlossary string.
 */
function applyGlossary(text: string, glossary: string): string {
	let result = text;
	const pairs = glossary.split(/[,;\n]/);

	for (const pair of pairs) {
		const parts = pair.split("=");
		if (parts.length === 2) {
			const search = parts[0].trim();
			const replace = parts[1].trim();
			if (search && replace) {
				const regex = new RegExp(escapeRegExp(search), "gi");
				result = result.replace(regex, replace);
			}
		}
	}

	return result;
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

