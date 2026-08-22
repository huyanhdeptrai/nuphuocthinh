export interface CueTimingOffsets {
	cueLeadSeconds?: number;
	cueTailSeconds?: number;
}

export interface CueTimeRange {
	startTime: number;
	endTime: number;
}

const MAX_OFFSET_SECONDS = 3_600;

export function parseSignedSeconds(value: string): number | null {
	const normalized = value.trim().replace(",", ".").replace(/\s+/g, "");
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(-MAX_OFFSET_SECONDS, Math.min(MAX_OFFSET_SECONDS, parsed));
}

export function formatSignedSeconds(value?: number): string {
	const safeValue = Number.isFinite(value) ? (value ?? 0) : 0;
	if (safeValue === 0) return "0";
	const formatted = Number(safeValue.toFixed(3)).toString().replace(".", ",");
	return safeValue > 0 ? `+${formatted}` : formatted;
}

export function applyCueTimingOffsets({
	startTime,
	endTime,
	cueLeadSeconds = 0,
	cueTailSeconds = 0,
}: CueTimeRange & CueTimingOffsets): CueTimeRange {
	const adjustedStart = Math.max(0, startTime - cueLeadSeconds);
	const adjustedEnd = Math.max(adjustedStart + 0.1, endTime + cueTailSeconds);
	return { startTime: adjustedStart, endTime: adjustedEnd };
}

