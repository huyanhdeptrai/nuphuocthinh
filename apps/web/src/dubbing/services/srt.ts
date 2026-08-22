import type { RecognitionCue } from "../types";

const SRT_TIME_PATTERN =
	/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;

function parseTimestamp(parts: string[]): number {
	return (
		Number(parts[0]) * 3600 +
		Number(parts[1]) * 60 +
		Number(parts[2]) +
		Number(parts[3]) / 1000
	);
}

export function parseSrtRecognitionCues(content: string): RecognitionCue[] {
	const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
	if (!normalized) throw new Error("File SRT đang trống.");

	const blocks = normalized.split(/\n{2,}/);
	const cues = blocks.map((block, blockIndex) => {
		const lines = block.split("\n");
		if (/^\d+$/.test(lines[0]?.trim() ?? "")) lines.shift();

		const timeLine = lines.shift()?.trim() ?? "";
		const match = timeLine.match(SRT_TIME_PATTERN);
		if (!match) {
			throw new Error(`Mốc thời gian không hợp lệ ở phụ đề ${blockIndex + 1}.`);
		}

		const startTime = parseTimestamp(match.slice(1, 5));
		const endTime = parseTimestamp(match.slice(5, 9));
		if (endTime <= startTime) {
			throw new Error(`Thời gian kết thúc phải lớn hơn bắt đầu ở phụ đề ${blockIndex + 1}.`);
		}

		const text = lines.join("\n").trim();
		if (!text) throw new Error(`Phụ đề ${blockIndex + 1} chưa có nội dung.`);

		return {
			id: `srt-${blockIndex + 1}-${Math.round(startTime * 1000)}`,
			startTime,
			endTime,
			text,
		};
	});

	if (cues.length === 0) throw new Error("Không tìm thấy phụ đề hợp lệ trong file SRT.");
	return cues;
}

