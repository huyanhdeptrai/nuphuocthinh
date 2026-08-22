import type { TimelineTrack } from "@/types/timeline";

export interface DuckWindow {
	id?: string;
	start: number;
	end: number;
	duckVolume?: number;
}

export const DUCK_ATTACK_MS = 150;
export const DUCK_RELEASE_MS = 400;

const NARRATION_NAME_MARKER = "[Thuy";

export function isNarrationAudioElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	if (element.audioRole === "narration") return true;
	if (
		element.audioRole === "source" ||
		element.audioRole === "ducked-source" ||
		element.audioRole === "music-stem"
	) {
		return false;
	}
	const name = element.name || "";
	return (
		name.includes("[Thuyết minh:") ||
		name.includes("[Thuy") ||
		name.startsWith("Thuyết minh") ||
		name.startsWith("TTS:") ||
		name.startsWith("[TTS") ||
		name.includes("· câu ") ||
		name.includes(" câu ")
	);
}

export function isRawSourceAudioElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	if (element.audioRole === "music-stem" || element.audioRole === "ducked-source") {
		return false;
	}
	return (
		element.audioRole === "source" || element.name.startsWith("[Nguồn video:")
	);
}

export function isMusicStemElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	return (
		element.audioRole === "music-stem" ||
		element.name.startsWith("[Nhạc nền video:")
	);
}

export function isDuckedSourceElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	return (
		element.audioRole === "ducked-source" ||
		element.name.startsWith("[Hạ âm video:")
	);
}

export function isSourceAudioElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	return (
		isRawSourceAudioElement({ element }) ||
		isMusicStemElement({ element }) ||
		isDuckedSourceElement({ element })
	);
}

export function getElementAudioRole({
	element,
}: {
	element: { audioRole?: string; name: string };
}): "narration" | "source" | "music-stem" | "ducked-source" | undefined {
	if (
		element.audioRole === "narration" ||
		element.audioRole === "source" ||
		element.audioRole === "music-stem" ||
		element.audioRole === "ducked-source"
	) {
		return element.audioRole;
	}
	if (isMusicStemElement({ element })) return "music-stem";
	if (isDuckedSourceElement({ element })) return "ducked-source";
	if (isRawSourceAudioElement({ element })) return "source";
	if (isNarrationAudioElement({ element })) return "narration";
	return undefined;
}

export function isDuckingCandidateRole(role?: string): boolean {
	return role !== "narration";
}

export function isDuckingCandidateElement({
	element,
}: {
	element: { audioRole?: string; name: string };
}): boolean {
	return !isNarrationAudioElement({ element });
}

export function mergeDuckWindows({
	windows,
}: {
	windows: DuckWindow[];
}): DuckWindow[] {
	const valid = windows
		.filter((window) => window.end > window.start)
		.sort((a, b) => a.start - b.start);
	if (valid.length === 0) return [];

	const merged: DuckWindow[] = [{ ...valid[0] }];
	for (let i = 1; i < valid.length; i++) {
		const current = valid[i];
		const last = merged[merged.length - 1];
		if (current.start <= last.end) {
			last.end = Math.max(last.end, current.end);
			if (current.duckVolume !== undefined && last.duckVolume === undefined) {
				last.duckVolume = current.duckVolume;
			}
			continue;
		}
		merged.push({ ...current });
	}
	return merged;
}

export function collectNarrationDuckWindows({
	tracks,
	duckOverrides,
}: {
	tracks: TimelineTrack[];
	duckOverrides?: Record<string, { startOffset?: number; endOffset?: number; duckVolume?: number }>;
}): DuckWindow[] {
	const windows: DuckWindow[] = [];
	for (const track of tracks) {
		if (track.type !== "audio") continue;
		for (const element of track.elements) {
			if (!isNarrationAudioElement({ element })) continue;
			windows.push({
				id: element.id,
				start: element.startTime,
				end: element.startTime + element.duration,
			});
		}
	}
	const merged = mergeDuckWindows({ windows });
	return merged.map((win, idx) => {
		const id = win.id || `duck-win-${idx}-${Math.round(win.start * 100)}`;
		const override = duckOverrides?.[id];
		if (override) {
			const start = Math.max(0, win.start + (override.startOffset ?? 0));
			const end = Math.max(start + 0.05, win.end + (override.endOffset ?? 0));
			return {
				...win,
				id,
				start,
				end,
				duckVolume: override.duckVolume,
			};
		}
		return {
			...win,
			id,
		};
	});
}

function clamp01({ value }: { value: number }): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function lerp({
	from,
	to,
	progress,
}: {
	from: number;
	to: number;
	progress: number;
}): number {
	return from + (to - from) * clamp01({ value: progress });
}

function gainAtEndOfWindow({
	window,
	baseVolume,
	ducked,
	attackSeconds,
}: {
	window: DuckWindow;
	baseVolume: number;
	ducked: number;
	attackSeconds: number;
}): number {
	if (attackSeconds <= 0) return ducked;
	const windowLength = window.end - window.start;
	if (windowLength >= attackSeconds) return ducked;
	return lerp({
		from: baseVolume,
		to: ducked,
		progress: windowLength / attackSeconds,
	});
}

export function gainAtTime({
	t,
	duckWindows,
	baseVolume,
	duckVolume,
	attackMs,
	releaseMs,
}: {
	t: number;
	duckWindows: DuckWindow[];
	baseVolume: number;
	duckVolume: number;
	attackMs: number;
	releaseMs: number;
}): number {
	if (duckWindows.length === 0) return baseVolume;

	const attackSeconds = Math.max(0, attackMs) / 1000;
	const releaseSeconds = Math.max(0, releaseMs) / 1000;
	let gain = baseVolume;

	for (const window of duckWindows) {
		if (t < window.start || t > window.end + releaseSeconds) {
			continue;
		}

		const effectiveDuckVolume =
			window.duckVolume !== undefined ? window.duckVolume : duckVolume;
		const ducked = baseVolume * clamp01({ value: effectiveDuckVolume });

		if (t <= window.end) {
			const inside =
				attackSeconds > 0 && t < window.start + attackSeconds
					? lerp({
							from: baseVolume,
							to: ducked,
							progress: (t - window.start) / attackSeconds,
						})
					: ducked;
			gain = Math.min(gain, inside);
			continue;
		}

		if (releaseSeconds <= 0) continue;
		const atEnd = gainAtEndOfWindow({
			window,
			baseVolume,
			ducked,
			attackSeconds,
		});
		const faded = lerp({
			from: atEnd,
			to: baseVolume,
			progress: (t - window.end) / releaseSeconds,
		});
		gain = Math.min(gain, faded);
	}

	return gain;
}
