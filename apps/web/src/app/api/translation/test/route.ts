import { NextResponse } from "next/server";
import { z } from "zod";
import {
	createProviderHeaders,
	getProviderBaseUrl,
	readProviderError,
} from "../provider-utils";

const testRequestSchema = z.object({
	provider: z.enum(["openrouter", "custom"]).optional(),
	endpoint: z.string().optional(),
	apiKey: z.string().optional(),
	model: z.string().optional(),
});

export async function POST(request: Request) {
	try {
		const raw: unknown = await request.json();
		const body = testRequestSchema.parse(raw);
		const provider = body.provider ?? "openrouter";
		const model = body.model?.trim() || "openai/gpt-4o-mini";
		const effectiveApiKey =
			body.apiKey?.trim() ||
			(provider === "openrouter"
				? process.env.OPENROUTER_API_KEY?.trim()
				: undefined);

		if (provider === "openrouter" && !effectiveApiKey) {
			return NextResponse.json(
				{
					error:
						"Chưa có OpenRouter API Key. Vui lòng nhập API Key OpenRouter (sk-or-v1-...).",
				},
				{ status: 400 },
			);
		}

		const baseUrl = getProviderBaseUrl({
			provider,
			customEndpoint: body.endpoint,
		});

		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: createProviderHeaders({ provider, apiKey: effectiveApiKey }),
			body: JSON.stringify({
				model,
				stream: false,
				max_tokens: 10,
				messages: [
					{
						role: "user",
						content: "Hi",
					},
				],
			}),
			cache: "no-store",
			signal: AbortSignal.timeout(25_000),
		});

		if (!response.ok) {
			const errorMsg = await readProviderError(response);
			return NextResponse.json(
				{ error: errorMsg || `HTTP ${response.status}` },
				{ status: response.status },
			);
		}

		return NextResponse.json({
			success: true,
			message: `Kết nối thành công tới model ${model}!`,
		});
	} catch (cause) {
		const message =
			cause instanceof Error ? cause.message : "Kiểm tra kết nối thất bại.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
