import { describe, expect, test } from "bun:test";
import {
	DUCK_ATTACK_MS,
	DUCK_RELEASE_MS,
	gainAtTime,
	isDuckingCandidateRole,
	isNarrationAudioElement,
	isSourceAudioElement,
	mergeDuckWindows,
} from "./duck-envelope";

describe("mergeDuckWindows", () => {
	test("merges overlapping windows", () => {
		const merged = mergeDuckWindows({
			windows: [
				{ start: 1, end: 3 },
				{ start: 2.5, end: 5 },
				{ start: 8, end: 9 },
			],
		});
		expect(merged).toEqual([
			{ start: 1, end: 5 },
			{ start: 8, end: 9 },
		]);
	});

	test("drops empty windows", () => {
		expect(
			mergeDuckWindows({ windows: [{ start: 2, end: 2 }] }),
		).toEqual([]);
	});
});

describe("gainAtTime", () => {
	const windows = [{ start: 2, end: 4 }];

	test("outside windows stays at base volume", () => {
		expect(
			gainAtTime({
				t: 0.5,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBe(1);
	});

	test("inside window uses base * duckVolume", () => {
		expect(
			gainAtTime({
				t: 3,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBeCloseTo(0.15, 6);
	});

	test("attack midpoint is halfway to the duck floor", () => {
		expect(
			gainAtTime({
				t: 2.075,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBeCloseTo(0.575, 5);
	});

	test("release midpoint is halfway back to base", () => {
		expect(
			gainAtTime({
				t: 4.2,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBeCloseTo(0.575, 5);
	});

	test("just before TTS end stays at the duck floor", () => {
		expect(
			gainAtTime({
				t: 3.99,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBeCloseTo(0.15, 5);
	});

	test("overlapping windows take the lower gain", () => {
		expect(
			gainAtTime({
				t: 3,
				duckWindows: [
					{ start: 1, end: 4 },
					{ start: 2.5, end: 5 },
				],
				baseVolume: 1,
				duckVolume: 0.15,
				attackMs: 0,
				releaseMs: 0,
			}),
		).toBeCloseTo(0.15, 6);
	});

	test("empty windows are a no-op", () => {
		expect(
			gainAtTime({
				t: 3,
				duckWindows: [],
				baseVolume: 0.8,
				duckVolume: 0.1,
				attackMs: DUCK_ATTACK_MS,
				releaseMs: DUCK_RELEASE_MS,
			}),
		).toBe(0.8);
	});

	test("duckVolume 1 is a no-op", () => {
		expect(
			gainAtTime({
				t: 3,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 1,
				attackMs: 0,
				releaseMs: 0,
			}),
		).toBe(1);
	});

	test("custom 20ms attack and 50ms release work accurately", () => {
		// Window: start=2.0, end=4.0. Attack=20ms (0.02s), Release=50ms (0.05s).
		// Base=1.0, Duck=0.10 (10%).
		// Before start (t=1.99): 1.0
		expect(
			gainAtTime({
				t: 1.99,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBe(1);

		// Exactly at start (t=2.0): 1.0
		expect(
			gainAtTime({
				t: 2.0,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(1.0, 5);

		// Attack midpoint (t=2.01, 10ms in): lerp(1.0, 0.1, 0.5) = 0.55
		expect(
			gainAtTime({
				t: 2.01,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(0.55, 5);

		// Attack complete (t=2.02, 20ms in): 0.10
		expect(
			gainAtTime({
				t: 2.02,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(0.1, 5);

		// Middle of TTS (t=3.0): 0.10
		expect(
			gainAtTime({
				t: 3.0,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(0.1, 5);

		// Exactly at window end (t=4.0): 0.10
		expect(
			gainAtTime({
				t: 4.0,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(0.1, 5);

		// Release midpoint (t=4.025, 25ms in): lerp(0.1, 1.0, 0.5) = 0.55
		expect(
			gainAtTime({
				t: 4.025,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(0.55, 5);

		// Release complete (t=4.05, 50ms in): 1.0
		expect(
			gainAtTime({
				t: 4.05,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBeCloseTo(1.0, 5);

		// After release (t=4.1): 1.0
		expect(
			gainAtTime({
				t: 4.1,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0.1,
				attackMs: 20,
				releaseMs: 50,
			}),
		).toBe(1);
	});

	test("duckVolume 0 mutes inside", () => {
		expect(
			gainAtTime({
				t: 3,
				duckWindows: windows,
				baseVolume: 1,
				duckVolume: 0,
				attackMs: 0,
				releaseMs: 0,
			}),
		).toBe(0);
	});
});

describe("role helpers", () => {
	test("detects narration by role or name", () => {
		expect(
			isNarrationAudioElement({
				element: { audioRole: "narration", name: "x" },
			}),
		).toBe(true);
		expect(
			isNarrationAudioElement({
				element: { name: "[Thuyết minh:cue-1] câu 1" },
			}),
		).toBe(true);
		expect(isNarrationAudioElement({ element: { name: "music" } })).toBe(
			false,
		);
	});

	test("detects source by role or name", () => {
		expect(
			isSourceAudioElement({
				element: { audioRole: "source", name: "x" },
			}),
		).toBe(true);
		expect(
			isSourceAudioElement({
				element: { name: "[Nguồn video:abc]" },
			}),
		).toBe(true);
	});

	test("isDuckingCandidateRole matches all valid ducking roles", () => {
		expect(isDuckingCandidateRole("source")).toBe(true);
		expect(isDuckingCandidateRole("ducked-source")).toBe(true);
		expect(isDuckingCandidateRole("music-stem")).toBe(true);
		expect(isDuckingCandidateRole("narration")).toBe(false);
		expect(isDuckingCandidateRole(undefined)).toBe(true);
	});
});
