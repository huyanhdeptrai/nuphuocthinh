import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import { resolveAnimatedTextSelectionState } from "./text-selection-state";

const BASE_TEXT = {
	id: "subtitle-1",
	type: "text",
	name: "Subtitle",
	content: "Để anh cho anh em xem nè,",
	startTime: 0,
	duration: 2,
	trimStart: 0,
	trimEnd: 0,
	fontSize: 48,
	fontFamily: "Arial",
	color: "#111111",
	backgroundColor: "#dfff35",
	textAlign: "center",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	transform: {
		scale: 1,
		position: { x: 0, y: 100 },
		rotate: 0,
	},
	opacity: 1,
} satisfies TextElement;

describe("animated text selection state", () => {
	test("moves the selection with a bouncing subtitle at the current frame", () => {
		const state = resolveAnimatedTextSelectionState({
			element: {
				...BASE_TEXT,
				textAnimations: {
					in: { type: "bounce", duration: 1, intensity: 1 },
				},
			},
			resolvedTransform: BASE_TEXT.transform,
			localTime: 0.2,
		});

		// bounce at 0.2 s offsets the renderer by -15.36 px; the selection
		// must use that same frame-specific origin instead of the static y=100.
		expect(state.transform.position.y).toBeCloseTo(84.64, 5);
		expect(state.transform.scale).toBe(1);
	});

	test("scales the selection with a scale-in subtitle", () => {
		const state = resolveAnimatedTextSelectionState({
			element: {
				...BASE_TEXT,
				transform: { ...BASE_TEXT.transform, scale: 2 },
				textAnimations: {
					in: { type: "scale-in", duration: 1, intensity: 1 },
				},
			},
			resolvedTransform: { ...BASE_TEXT.transform, scale: 2 },
			localTime: 0.5,
		});

		expect(state.transform.scale).toBeCloseTo(1.3, 5);
	});
});
