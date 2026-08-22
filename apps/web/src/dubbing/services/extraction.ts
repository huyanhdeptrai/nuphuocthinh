import type { DubbingCue } from "../types";

export function parseSubtitleFileToCues(fileContent: string, _fileName: string): DubbingCue[] {
	const blocks = fileContent.replace(/\r/g, "").trim().split(/\n\s*\n/);
	return blocks.flatMap((block, idx) => {
		const lines = block.split("\n");
		const timing = lines.find((line) => line.includes("-->"));
		if (!timing) return [];
		const [start, end] = timing.split("-->").map((value) => parseTimecode(value.trim()));
		if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
		return [{
			id: `cue-${Date.now()}-${idx}`,
			startTime: start,
			endTime: end,
			originalText: lines.slice(lines.indexOf(timing) + 1).join("\n").trim(),
			translatedText: "",
			speaker: "Speaker A",
			status: "idle",
		}];
	});
}

function parseTimecode(value: string): number {
	const parts = value.replace(",", ".").split(":").map(Number);
	if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return Number.NaN;
	return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function exportCuesToSrt(cues: DubbingCue[], useTranslatedText = true): string {
	return cues.map((cue, index) => {
		const text = useTranslatedText ? cue.translatedText || cue.originalText : cue.originalText;
		return `${index + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(cue.endTime)}\n${text}\n`;
	}).join("\n");
}

function formatSrtTime(seconds: number): string {
	const pad = (value: number, size = 2) => String(value).padStart(size, "0");
	const millis = Math.floor((seconds % 1) * 1000);
	const whole = Math.floor(seconds);
	return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)},${pad(millis, 3)}`;
}
