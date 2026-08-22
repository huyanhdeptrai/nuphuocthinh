import { z } from "zod";

export type CompatibleProvider = "openrouter" | "custom";

export function getProviderBaseUrl({
	provider,
	customEndpoint,
}: {
	provider: CompatibleProvider;
	customEndpoint?: string;
}): string {
	if (provider === "openrouter") return "https://openrouter.ai/api/v1";

	const endpoint = customEndpoint?.trim();
	if (!endpoint)
		throw new Error("Vui lòng nhập API endpoint cho Custom provider.");

	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new Error("API endpoint không hợp lệ.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("API endpoint phải sử dụng http hoặc https.");
	}

	return url
		.toString()
		.replace(/\/+$/, "")
		.replace(/\/chat\/completions$/i, "")
		.replace(/\/models$/i, "");
}

export function createProviderHeaders({
	provider,
	apiKey,
}: {
	provider: CompatibleProvider;
	apiKey?: string;
}): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
	if (provider === "openrouter") {
		headers["HTTP-Referer"] = "http://localhost:3000";
		headers["X-Title"] = "OpenCut Translation";
	}
	return headers;
}

export function parseProviderJson(text: string): unknown {
	const trimmed = text.replace(/^﻿/, "").trim();
	if (!trimmed) throw new Error("Nhà cung cấp AI không trả về dữ liệu.");

	if (looksLikeServerSentEvents(trimmed)) {
		return parseSseJson(trimmed);
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		if (trimmed.includes("data:")) return parseSseJson(trimmed);
		throw new Error("Nhà cung cấp AI trả về dữ liệu không phải JSON hợp lệ.");
	}
}

export async function readProviderJson(response: Response): Promise<unknown> {
	return parseProviderJson(await response.text());
}

export async function readProviderError(response: Response): Promise<string> {
	const fallback = `Nhà cung cấp AI trả về lỗi HTTP ${response.status}.`;
	try {
		const data = z
			.object({
				error: z
					.union([z.object({ message: z.string().optional() }), z.string()])
					.optional(),
				message: z.string().optional(),
			})
			.passthrough()
			.parse(await readProviderJson(response));
		if (typeof data.error === "string") return data.error;
		return data.error?.message || data.message || fallback;
	} catch {
		return fallback;
	}
}

function looksLikeServerSentEvents(text: string): boolean {
	return (
		text.startsWith("data:") ||
		text.startsWith("event:") ||
		text.includes("\ndata:")
	);
}

function parseSseJson(text: string): unknown {
	const payloads: unknown[] = [];
	let assembledContent = "";

	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) continue;
		const data = trimmed.slice(5).trim();
		if (!data || data === "[DONE]") continue;
		try {
			const parsed: unknown = JSON.parse(data);
			payloads.push(parsed);
			assembledContent += extractSseDelta(parsed);
		} catch {
			// Ignore a partial SSE frame and keep reading later complete ones.
		}
	}

	if (assembledContent) {
		const lastObject = payloads.findLast(
			(item) => typeof item === "object" && item !== null,
		);
		return {
			...(typeof lastObject === "object" && lastObject !== null
				? lastObject
				: {}),
			choices: [{ message: { content: assembledContent }, text: assembledContent }],
		};
	}

	const lastPayload = payloads.at(-1);
	if (lastPayload !== undefined) return lastPayload;

	throw new Error("Nhà cung cấp AI trả về luồng SSE nhưng không có JSON hợp lệ.");
}

function extractSseDelta(payload: unknown): string {
	if (typeof payload !== "object" || payload === null || !("choices" in payload)) {
		return "";
	}
	const choices = payload.choices;
	if (!Array.isArray(choices) || choices.length === 0) return "";
	const choice = choices[0];
	if (typeof choice !== "object" || choice === null) return "";

	if ("delta" in choice && typeof choice.delta === "object" && choice.delta) {
		const content = "content" in choice.delta ? choice.delta.content : undefined;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.map((part) =>
					typeof part === "object" && part && "text" in part
						? String(part.text ?? "")
						: "",
				)
				.join("");
		}
	}

	if ("message" in choice && typeof choice.message === "object" && choice.message) {
		const content =
			"content" in choice.message ? choice.message.content : undefined;
		if (typeof content === "string") return content;
	}

	if ("text" in choice && typeof choice.text === "string") return choice.text;
	return "";
}

