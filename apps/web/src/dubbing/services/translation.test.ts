import { afterEach, expect, test } from "bun:test";
import { translateText } from "./translation";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("Google translation passes the selected target language and combines segments", async () => {
	let requestedUrl = "";
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input);
		return Response.json([[["Hello ", "Xin "], ["world", "chào"]]]);
	}) as unknown as typeof fetch;
	expect(await translateText("Xin chào", { targetLang: "en" })).toBe("Hello world");
	expect(new URL(requestedUrl).searchParams.get("tl")).toBe("en");
	expect(new URL(requestedUrl).searchParams.get("q")).toBe("Xin chào");
});

test("Google errors do not turn into a successful untranslated result", async () => {
	globalThis.fetch = (async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
	await expect(translateText("Xin chào")).rejects.toThrow("HTTP 429");
});

test("Google responses without a translation report failure", async () => {
	globalThis.fetch = (async () => Response.json([])) as unknown as typeof fetch;
	await expect(translateText("Xin chào")).rejects.toThrow("không trả về bản dịch hợp lệ");
});
