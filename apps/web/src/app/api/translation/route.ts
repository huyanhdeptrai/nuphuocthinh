import { NextResponse } from "next/server";
import { z } from "zod";
import {
	createProviderHeaders,
	getProviderBaseUrl,
	readProviderError,
	readProviderJson,
} from "./provider-utils";

interface TranslationCueInput {
	id: string;
	text: string;
	speaker?: string;
	gender?: "male" | "female" | "unknown";
	selfPronoun?: string;
	addressPronoun?: string;
}

const translationRequestSchema = z.object({
	provider: z.enum(["openrouter", "custom"]).optional(),
	endpoint: z.string().optional(),
	apiKey: z.string().optional(),
	model: z.string().optional(),
	targetLanguage: z.string().optional(),
	stylePrompt: z.string().optional(),
	cues: z
		.array(
			z.object({
				id: z.string(),
				text: z.string(),
				speaker: z.string().optional(),
				gender: z.enum(["male", "female", "unknown"]).optional(),
				selfPronoun: z.string().optional(),
				addressPronoun: z.string().optional(),
			}),
		)
		.optional(),
});

const completionSchema = z
	.object({
		choices: z
			.array(
				z.object({
					message: z
						.object({
							content: z
								.union([
									z.string(),
									z.array(z.object({ text: z.string().optional() })),
								])
								.optional(),
						})
						.optional(),
					text: z.string().optional(),
				}),
			)
			.optional(),
	})
	.passthrough();

const parsedTranslationsSchema = z.array(
	z.union([
		z.string(),
		z.object({
			id: z.string().optional(),
			text: z.string().optional(),
			translation: z.string().optional(),
		}),
	]),
);

interface TranslationOutput {
	id: string;
	text: string;
}

function extractAssistantText(payload: unknown): string {
	const data = completionSchema.parse(payload);
	const content =
		data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
	if (typeof content === "string") return content;
	if (Array.isArray(content))
		return content.map((item) => item.text ?? "").join("");
	throw new Error("Model không trả về nội dung bản dịch.");
}

function parseTranslations({
	content,
	sourceCues,
}: {
	content: string;
	sourceCues: TranslationCueInput[];
}): TranslationOutput[] {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const firstBracket = content.indexOf("[");
	const lastBracket = content.lastIndexOf("]");
	const jsonText =
		fenced ??
		(firstBracket >= 0 && lastBracket > firstBracket
			? content.slice(firstBracket, lastBracket + 1)
			: content);
	const parsed = parsedTranslationsSchema.parse(JSON.parse(jsonText));

	return sourceCues.map((cue, index) => {
		const byId = parsed.find(
			(item) => typeof item !== "string" && item.id === cue.id,
		);
		const item = byId ?? parsed[index];
		const text =
			typeof item === "string" ? item : (item?.text ?? item?.translation ?? "");
		return { id: cue.id, text: text.trim() || cue.text };
	});
}

export async function POST(request: Request) {
	try {
		const body = translationRequestSchema.parse(await request.json());
		const provider = body.provider === "custom" ? "custom" : "openrouter";
		const model = body.model?.trim();
		const targetLanguage = body.targetLanguage?.trim();
		const cues = (body.cues ?? []).filter((cue) => cue.id && cue.text.trim());

		if (!model) throw new Error("Vui lòng chọn hoặc nhập model AI.");
		if (!targetLanguage) throw new Error("Vui lòng chọn ngôn ngữ đích.");
		if (!cues.length) throw new Error("Không có phụ đề để dịch.");
		if (cues.length > 500)
			throw new Error("Mỗi lượt dịch tối đa 500 câu phụ đề.");

		const baseUrl = getProviderBaseUrl({
			provider,
			customEndpoint: body.endpoint,
		});
		const sourceJson = JSON.stringify(cues);
		const assignedRoles = cues.filter(
			(cue) => cue.selfPronoun || cue.addressPronoun || cue.gender || cue.speaker,
		);
		const roleHint =
			assignedRoles.length > 0
				? `
XƯNG HÔ / PHÂN VAI (BẮT BUỘC tuân thủ khi dịch sang tiếng Việt):
- Mỗi câu có thể có speaker (tên vai), gender (male/female), selfPronoun (tự xưng), addressPronoun (gọi người kia).
- Nếu có selfPronoun: nhân vật ĐÓ phải tự xưng đúng từ đó (em/anh/tôi/ta…). Không đảo vai.
- Nếu có addressPronoun: nhân vật ĐÓ phải gọi đối phương đúng từ đó.
- Nữ không được xưng "anh"; nam không được xưng "em" — trừ khi đúng cặp selfPronoun/addressPronoun đã gán.
- Giữ nhất quán xưng hô của cùng một speaker trong cả batch.
- Không dịch lẫn lời của vai này sang vai khác.`
				: `
XƯNG HÔ TIẾNG VIỆT:
- Suy luận giới tính và quan hệ từ ngữ cảnh hội thoại; giữ nhất quán cả video.
- Không đảo vai: cô gái không xưng "anh", chàng trai không xưng "em" trừ khi ngữ cảnh yêu cầu rõ.`;
		const systemPrompt = `Bạn là biên dịch viên phụ đề chuyên nghiệp.
- Tự động phát hiện ngôn ngữ nguồn từ nội dung; không yêu cầu người dùng khai báo.
- Dịch sang ngôn ngữ đích: ${targetLanguage}.
- Giữ nguyên ý nghĩa, tên riêng, số liệu và quan hệ giữa các câu.
- Bản dịch phải ngắn gọn, tự nhiên, phù hợp thời lượng phụ đề.
- Không giải thích, không thêm ghi chú.
- Trả về DUY NHẤT JSON array theo dạng [{"id":"...","text":"..."}], giữ nguyên id và số phần tử.
${roleHint}

PHONG CÁCH DỊCH:
${body.stylePrompt?.trim() || "Dịch tự nhiên, rõ nghĩa, phù hợp ngữ cảnh."}`;

		const effectiveApiKey =
			body.apiKey?.trim() ||
			(provider === "openrouter" ? process.env.OPENROUTER_API_KEY?.trim() : undefined);

		if (provider === "openrouter" && !effectiveApiKey) {
			return NextResponse.json(
				{
					error:
						"Chưa có OpenRouter API Key. Vui lòng nhập API Key OpenRouter (sk-or-v1-...).",
				},
				{ status: 401 },
			);
		}

		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: createProviderHeaders({ provider, apiKey: effectiveApiKey }),
			body: JSON.stringify({
				model,
				stream: false,
				temperature: 0.25,
				messages: [
					{ role: "system", content: systemPrompt },
					{
						role: "user",
						content: `Dịch các câu phụ đề sau:\n${sourceJson}`,
					},
				],
			}),
			cache: "no-store",
			// A 500-cue batch can take longer on large or locally hosted models.
			signal: AbortSignal.timeout(600_000),
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: await readProviderError(response) },
				{ status: response.status },
			);
		}

		const payload = await readProviderJson(response);
		const translations = parseTranslations({
			content: extractAssistantText(payload),
			sourceCues: cues,
		});
		return NextResponse.json({ translations });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Dịch phụ đề thất bại.";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

