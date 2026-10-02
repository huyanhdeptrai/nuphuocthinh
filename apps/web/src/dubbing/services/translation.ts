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

		const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
		if (!res.ok) {
			throw new Error(`Google Dịch trả lỗi HTTP ${res.status}. Hãy thử lại sau hoặc chọn nhà cung cấp khác.`);
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

		if (!translated.trim()) {
			throw new Error("Google Dịch không trả về bản dịch hợp lệ.");
		}

		// Apply custom glossary if provided
		if (options.customGlossary) {
			translated = applyGlossary(translated, options.customGlossary);
		}

		return translated;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Google Dịch")) {
			throw error;
		}
		throw new Error("Không kết nối được Google Dịch. Kiểm tra mạng hoặc thử lại sau.", { cause: error });
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

