import type {
	RecognitionCue,
	SpeakerCountSetting,
	SpeakerProfile,
} from "../types";

export interface SpeakerSegment {
	startTime: number;
	endTime: number;
	speaker: string;
}

export interface RecognitionAnalysis {
	totalMs: number;
	uploadParseMs?: number;
	tempWriteMs?: number;
	normalizeMs?: number;
	asrMs?: number;
	diarizationMs?: number;
	diarizationInferenceMs?: number;
	mergeMs?: number;
	audioFilterPreset?: string;
	device?: string;
	deviceLabel?: string;
	normalizedAudioCacheHit?: boolean;
	diarizationCacheHit?: boolean;
	ffmpegSkipped?: boolean;
}

export interface SpeakerDiarizationResult {
	segments: SpeakerSegment[];
	device?: string;
	deviceLabel?: string;
	detectedSpeakers?: number;
	analysis?: RecognitionAnalysis;
}

export const SPEAKER_COLORS = [
	"#22c55e",
	"#3b82f6",
	"#f59e0b",
	"#a855f7",
	"#ef4444",
	"#06b6d4",
	"#ec4899",
	"#84cc16",
	"#f97316",
	"#6366f1",
] as const;

const ONSET_WINDOW_SEC = 0.4;
const ONSET_SAMPLE_SEC = 0.12;
const MIN_WINDOW_SEC = 0.08;
const START_PAD_SEC = 0.02;
const OCR_LOOKBEHIND_SEC = 0.55;
const OCR_FORWARD_SEC = 0.12;
const SHORT_CHAR_LIMIT = 3;
const MIN_USABLE_SEGMENT_SEC = 0.16;
const PRIOR_CARRY_GAP_SEC = 0.45;
const MAX_NEAREST_SEC = 0.55;

export type SpeakerAssignMode = "onset" | "lookbehind";

function overlapDuration({
	range,
	segment,
}: {
	range: { startTime: number; endTime: number };
	segment: SpeakerSegment;
}): number {
	return Math.max(
		0,
		Math.min(range.endTime, segment.endTime) -
			Math.max(range.startTime, segment.startTime),
	);
}

function cueCharCount(text: string): number {
	return text.replace(/\s+/g, "").length;
}

function expectedSpeechDuration({
	text,
	duration,
}: {
	text: string;
	duration: number;
}): number {
	const chars = cueCharCount(text);
	if (chars <= 0) return Math.min(Math.max(duration, 0), 0.3);
	const estimate = Math.max(0.16, chars * 0.26 + 0.1);
	if (duration <= 0) return estimate;
	return Math.min(duration, estimate);
}

export function clipOverlappingCueTimes({
	cues,
}: {
	cues: RecognitionCue[];
}): RecognitionCue[] {
	return cues.map((cue, index) => {
		const next = cues[index + 1];
		if (!next || cue.endTime <= next.startTime) return cue;
		return {
			...cue,
			endTime: Number(Math.max(cue.startTime, next.startTime).toFixed(2)),
		};
	});
}

export function resolveAsrCueEndTime({
	startTime,
	endTime,
	text,
}: {
	startTime: number;
	endTime: number;
	text: string;
}): number {
	if (endTime > startTime) return endTime;
	return Number(
		(
			startTime +
			expectedSpeechDuration({ text, duration: Number.POSITIVE_INFINITY })
		).toFixed(2),
	);
}

function assignmentWindow({
	cue,
	mode,
}: {
	cue: RecognitionCue;
	mode: SpeakerAssignMode;
}): { startTime: number; endTime: number } {
	if (mode === "lookbehind") {
		return {
			startTime: Math.max(0, cue.startTime - OCR_LOOKBEHIND_SEC),
			endTime: cue.startTime + Math.max(MIN_WINDOW_SEC, OCR_FORWARD_SEC),
		};
	}
	const duration = Math.max(0, cue.endTime - cue.startTime);
	const speechEnd =
		cue.startTime + expectedSpeechDuration({ text: cue.text, duration });
	const onsetEnd = cue.startTime + ONSET_WINDOW_SEC;
	const end = Math.max(
		cue.startTime + MIN_WINDOW_SEC,
		Math.min(cue.endTime, speechEnd, onsetEnd),
	);
	return {
		startTime: Math.max(0, cue.startTime - START_PAD_SEC),
		endTime: end,
	};
}

function cueSampleTime({
	cue,
	mode,
}: {
	cue: RecognitionCue;
	mode: SpeakerAssignMode;
}): number {
	if (mode === "lookbehind") return cue.startTime;
	const duration = Math.max(0, cue.endTime - cue.startTime);
	return cue.startTime + Math.min(ONSET_SAMPLE_SEC, duration * 0.3);
}

function containsTime({
	segment,
	time,
}: {
	segment: SpeakerSegment;
	time: number;
}): boolean {
	return segment.startTime <= time && time < segment.endTime;
}

function usableSegments({
	segments,
}: {
	segments: SpeakerSegment[];
}): SpeakerSegment[] {
	return segments.filter(
		(segment) => segment.endTime - segment.startTime >= MIN_USABLE_SEGMENT_SEC,
	);
}

function scoreSpeakers({
	cue,
	segments,
	mode,
}: {
	cue: RecognitionCue;
	segments: SpeakerSegment[];
	mode: SpeakerAssignMode;
}): Map<string, number> {
	const window = assignmentWindow({ cue, mode });
	const sampleTime = cueSampleTime({ cue, mode });
	const scores = new Map<string, number>();
	for (const segment of segments) {
		const overlap = overlapDuration({ range: window, segment });
		if (overlap > 0) {
			scores.set(segment.speaker, (scores.get(segment.speaker) ?? 0) + overlap);
		}
		if (containsTime({ segment, time: sampleTime })) {
			scores.set(segment.speaker, (scores.get(segment.speaker) ?? 0) + 0.35);
		}
	}
	return scores;
}

function bestScoredSpeaker({
	scores,
}: {
	scores: Map<string, number>;
}): { speaker?: string; score: number } {
	let speaker: string | undefined;
	let score = 0;
	for (const [label, value] of scores.entries()) {
		if (value > score) {
			score = value;
			speaker = label;
		}
	}
	return { speaker, score };
}

function speakerAtTime({
	segments,
	time,
}: {
	segments: SpeakerSegment[];
	time: number;
}): string | undefined {
	const hits = segments.filter((segment) => containsTime({ segment, time }));
	if (hits.length === 0) return undefined;
	hits.sort(
		(a, b) =>
			a.endTime - a.startTime - (b.endTime - b.startTime) ||
			b.startTime - a.startTime,
	);
	return hits[0]?.speaker;
}

function previousSpeakerBefore({
	segments,
	time,
}: {
	segments: SpeakerSegment[];
	time: number;
}): string | undefined {
	let best: SpeakerSegment | undefined;
	for (const segment of segments) {
		if (segment.endTime > time + 0.04) continue;
		if (!best || segment.endTime > best.endTime) best = segment;
	}
	if (!best) return undefined;
	if (time - best.endTime > PRIOR_CARRY_GAP_SEC) return undefined;
	return best.speaker;
}

function nearestSpeakerByStart({
	segments,
	time,
}: {
	segments: SpeakerSegment[];
	time: number;
}): string | undefined {
	let best: SpeakerSegment | undefined;
	let minDistance = Infinity;
	for (const segment of segments) {
		const dist = Math.abs(segment.startTime - time);
		if (dist < minDistance) {
			minDistance = dist;
			best = segment;
		}
	}
	if (!best || minDistance > MAX_NEAREST_SEC) return undefined;
	return best.speaker;
}

function pickSpeakerLabel({
	cue,
	segments,
	previousLabel,
	mode,
}: {
	cue: RecognitionCue;
	segments: SpeakerSegment[];
	previousLabel?: string;
	mode: SpeakerAssignMode;
}): string | undefined {
	const scores = scoreSpeakers({ cue, segments, mode });
	const { speaker: scoredSpeaker, score } = bestScoredSpeaker({ scores });
	const duration = Math.max(0, cue.endTime - cue.startTime);
	const shortCue =
		cueCharCount(cue.text) <= SHORT_CHAR_LIMIT || duration <= 0.55;

	if (scoredSpeaker && previousLabel && shortCue && scoredSpeaker !== previousLabel) {
		const previousScore = scores.get(previousLabel) ?? 0;
		if (mode === "lookbehind" && score < previousScore * 1.8 + 0.12) {
			return previousLabel;
		}
		if (mode === "onset" && score < previousScore + 0.08) {
			return previousLabel;
		}
	}

	if (scoredSpeaker) return scoredSpeaker;

	const sampleTime = cueSampleTime({ cue, mode });
	return (
		speakerAtTime({ segments, time: sampleTime }) ??
		speakerAtTime({ segments, time: cue.startTime }) ??
		previousSpeakerBefore({ segments, time: cue.startTime }) ??
		(shortCue ? previousLabel : undefined) ??
		nearestSpeakerByStart({ segments, time: sampleTime })
	);
}

export function assignSpeakersToCues({
	cues,
	segments,
	mode = "lookbehind",
}: {
	cues: RecognitionCue[];
	segments: SpeakerSegment[];
	mode?: SpeakerAssignMode;
}): { cues: RecognitionCue[]; speakers: SpeakerProfile[] } {
	if (segments.length === 0) {
		return { cues, speakers: [] };
	}

	const scoringSegments = usableSegments({ segments });
	const labelSource = scoringSegments.length > 0 ? scoringSegments : segments;
	const orderedLabels = Array.from(
		new Set(
			[...labelSource]
				.sort((a, b) => a.startTime - b.startTime)
				.map((segment) => segment.speaker),
		),
	);
	const profiles = new Map<string, SpeakerProfile>(
		orderedLabels.map((label, index) => [
			label,
			{
				id: `speaker-${index + 1}`,
				name: `N${index + 1}`,
				color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
			},
		]),
	);

	const clippedCues = clipOverlappingCueTimes({
		cues: cues.map((cue) => ({
			...cue,
			endTime: resolveAsrCueEndTime({
				startTime: cue.startTime,
				endTime: cue.endTime,
				text: cue.text,
			}),
		})),
	});

	let previousLabel: string | undefined;
	const labelledCues = clippedCues.map((cue) => {
		const bestSpeakerLabel = pickSpeakerLabel({
			cue,
			segments: labelSource,
			previousLabel,
			mode,
		});
		if (!bestSpeakerLabel) return cue;

		previousLabel = bestSpeakerLabel;
		const profile = profiles.get(bestSpeakerLabel);
		if (!profile) return cue;

		return {
			...cue,
			speaker: profile.name,
			speakerId: profile.id,
			speakerName: profile.name,
			speakerColor: profile.color,
		};
	});

	return { cues: labelledCues, speakers: Array.from(profiles.values()) };
}

export async function requestSpeakerDiarization({
	audioBlob,
	fileName,
	speakerCount,
	audioProfile = "source",
}: {
	audioBlob: Blob;
	fileName: string;
	speakerCount: SpeakerCountSetting;
	audioProfile?: string;
}): Promise<SpeakerDiarizationResult> {
	const formData = new FormData();
	formData.append("engine", "diarize");
	formData.append("mode", "asr");
	formData.append("speakerDiarizationEnabled", "true");
	formData.append("speakerCount", String(speakerCount));
	formData.append("audioProfile", audioProfile);
	formData.append("file", audioBlob, fileName);

	const response = await fetch("/api/asr", {
		method: "POST",
		body: formData,
	});
	const data = (await response.json().catch(() => ({}))) as {
		error?: string;
		segments?: SpeakerSegment[];
		device?: string;
		deviceLabel?: string;
		detectedSpeakers?: number;
		analysis?: RecognitionAnalysis;
	};
	if (!response.ok) {
		throw new Error(
			data.error || `Lỗi máy chủ (${response.status}) khi phân vai.`,
		);
	}
	return {
		segments: Array.isArray(data.segments) ? data.segments : [],
		device: data.device,
		deviceLabel: data.deviceLabel,
		detectedSpeakers: data.detectedSpeakers,
		analysis: data.analysis,
	};
}
