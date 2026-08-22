import type { NarrationPerformance } from "../narration-store";

export interface NarrationTimingPlan {
	duration: number;
	playbackRate: number;
	difference: number;
	needsReview: boolean;
}

export function narrationSynthesisAdjustments({
	autoMatchDuration,
	speed,
	pitch,
}: {
	autoMatchDuration: boolean;
	speed: number;
	pitch: number;
}) {
	return {
		rate: autoMatchDuration ? 1 : clamp({ value: speed, min: 0.5, max: 2 }),
		pitch: clamp({ value: pitch, min: -12, max: 12 }),
	};
}

const NARRATION_NAME_PATTERN = /^\[Thuyết minh:(.+?)\]/u;

export function buildNarrationElementName({
	cueId,
	label,
}: {
	cueId: string;
	label: string;
}) {
	return `[Thuyết minh:${cueId}] ${label}`;
}

export function narrationCueIdFromElementName(name: string) {
	return name.match(NARRATION_NAME_PATTERN)?.[1] ?? null;
}

const clamp = ({ value, min, max }: { value: number; min: number; max: number }) =>
	Math.min(max, Math.max(min, value));

export function planNarrationTiming({
	rawDuration,
	targetDuration,
	autoMatchDuration,
}: {
	rawDuration: number;
	targetDuration: number;
	autoMatchDuration: boolean;
}): NarrationTimingPlan {
	const safeRawDuration = Math.max(0.01, rawDuration);
	const safeTargetDuration = Math.max(0.1, targetDuration);
	const playbackRate = autoMatchDuration
		? clamp({ value: safeRawDuration / safeTargetDuration, min: 0.2, max: 5 })
		: 1;
	// The timeline can only retime between 0.2x and 5x. Derive the clip's
	// actual duration from the clamped rate; forcing the cue duration here
	// would silently truncate speech (too long) or append silence (too short).
	const duration = safeRawDuration / playbackRate;
	const difference = duration - safeTargetDuration;

	return {
		duration,
		playbackRate,
		difference,
		needsReview:
			Math.abs(difference) > 0.08 ||
			(autoMatchDuration && (playbackRate < 0.7 || playbackRate > 1.45)),
	};
}

export function narrationConcurrency(performance: NarrationPerformance) {
	if (performance === "maximum") return 3;
	if (performance === "standard") return 2;
	return 1;
}

export interface NarrationLaneItem {
	id: string;
	speakerId: string;
	startTime: number;
	endTime: number;
}

/** Assigns cues to deterministic, non-overlapping lanes per speaker. */
export function allocateNarrationLanes(items: NarrationLaneItem[]) {
	const assignments = new Map<string, number>();
	const laneEnds = new Map<string, number[]>();
	const ordered = [...items].sort(
		(left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.id.localeCompare(right.id),
	);
	for (const item of ordered) {
		const speakerLanes = laneEnds.get(item.speakerId) || [];
		let lane = speakerLanes.findIndex((endTime) => endTime <= item.startTime);
		if (lane < 0) lane = speakerLanes.length;
		speakerLanes[lane] = Math.max(item.startTime, item.endTime);
		laneEnds.set(item.speakerId, speakerLanes);
		assignments.set(item.id, lane);
	}
	return assignments;
}

export async function mapWithConcurrency<T, R>({
	items,
	concurrency,
	worker,
}: {
	items: T[];
	concurrency: number;
	worker: (item: T, index: number) => Promise<R>;
}): Promise<R[]> {
	const output = new Array<R>(items.length);
	let nextIndex = 0;
	const runners = Array.from(
		{ length: Math.min(Math.max(1, concurrency), items.length) },
		async () => {
			while (nextIndex < items.length) {
				const index = nextIndex++;
				output[index] = await worker(items[index], index);
			}
		},
	);
	await Promise.all(runners);
	return output;
}

