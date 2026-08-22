import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import { isBottomAlignedSubtitleText } from "./text-utils";
import { materializeSubtitleSyncedEffects } from "./subtitle-effect-sync";

function text(name: string): TextElement {
	return { name } as TextElement;
}

describe("subtitle timeline text detection", () => {
	test("recognizes template subtitles and generated source/translated captions", () => {
		expect(isBottomAlignedSubtitleText({ element: text("Subtitle") })).toBe(true);
		expect(isBottomAlignedSubtitleText({ element: text("[N1] Caption 1") })).toBe(
			true,
		);
		expect(
			isBottomAlignedSubtitleText({
				element: {
					...text("Nội dung tùy chỉnh"),
					subtitleSpeaker: { id: "speaker-1", name: "N1", color: "#fff" },
				} as never,
			}),
		).toBe(true);
	});

	test("does not treat ordinary text as a subtitle cue", () => {
		expect(isBottomAlignedSubtitleText({ element: text("Title") })).toBe(false);
	});

	test("materializes one effect element for every subtitle cue", () => {
		const tracks = [
			{
				id: "subtitles",
				type: "text",
				elements: [
					{ ...text("Caption 1"), type: "text", startTime: 1, duration: 2, transform: { scale: 1, position: { x: 0, y: 100 }, rotate: 0 } },
					{ ...text("Caption 2"), type: "text", startTime: 5, duration: 1, transform: { scale: 1, position: { x: 20, y: 120 }, rotate: 0 } },
				],
			},
			{
				id: "effects",
				type: "effect",
				elements: [{ id: "effect-1", type: "blur-effect", name: "Pixelate", startTime: 0, duration: 4, blurIntensity: 50, transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 }, opacity: 1 }],
			},
		] as never;
		const result = materializeSubtitleSyncedEffects({ tracks, trackId: "effects", elementId: "effect-1" });
		const effectElements = result.find((track) => track.id === "effects")?.elements ?? [];
		expect(effectElements).toHaveLength(2);
		expect(effectElements.map((element) => element.startTime)).toEqual([0.9, 4.9]);
	});

	test("fits each effect to the subtitle background and symmetric coverage", () => {
		const subtitle = {
			...text("Caption 1"),
			type: "text",
			content: "Hi",
			fontSize: 10,
			fontFamily: "Arial",
			fontWeight: "normal",
			fontStyle: "normal",
			backgroundColor: "#ffff00",
			backgroundWidthMode: "full",
			backgroundPaddingX: 8,
			backgroundPaddingY: 4,
			boxWidth: 20,
			startTime: 1,
			duration: 2,
			transform: { scale: 1, position: { x: 0, y: 100 }, rotate: 0 },
	};
		const tracks = [
			{ id: "subtitles", type: "text", elements: [subtitle] },
			{
				id: "effects",
				type: "effect",
				elements: [{
					id: "effect-1", type: "blur-effect", name: "Blur", startTime: 0,
					duration: 4, blurIntensity: 50, subtitleExpandX: 10,
					subtitleExpandY: 5,
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 }, opacity: 1,
				}],
			},
		] as never;

		const result = materializeSubtitleSyncedEffects({
			tracks,
			trackId: "effects",
			elementId: "effect-1",
			canvasSize: { width: 900, height: 1600 },
		});
		const effect = result.find((track) => track.id === "effects")?.elements[0] as {
			boxWidth: number;
			boxHeight: number;
			transform: { position: { y: number } };
		};

		// 20 design units map to a 200px input box; a full background adds
		// 16px internal padding and the control adds 10px on each side.
		expect(effect.boxWidth).toBeCloseTo(236 / 900);
		expect(effect.boxHeight).toBeCloseTo(118 / 1600);
		// Bottom-aligned subtitle text is drawn above its anchor, so the effect
		// must shift to the vertical centre of the same background rectangle.
		expect(effect.transform.position.y).toBeCloseTo(70);
	});

	test("uses the editable input box when the subtitle has no background", () => {
		const subtitle = {
			...text("Caption 1"),
			type: "text",
			content: "Hi",
			fontSize: 10,
			fontFamily: "Arial",
			fontWeight: "normal",
			fontStyle: "normal",
			backgroundColor: "transparent",
			boxWidth: 20,
			startTime: 1,
			duration: 2,
			transform: { scale: 1, position: { x: 0, y: 100 }, rotate: 0 },
		};
		const tracks = [
			{ id: "subtitles", type: "text", elements: [subtitle] },
			{
				id: "effects",
				type: "effect",
				elements: [{
					id: "effect-1", type: "blur-effect", name: "Blur", startTime: 0,
					duration: 4, blurIntensity: 50,
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 }, opacity: 1,
				}],
			},
		] as never;

		const result = materializeSubtitleSyncedEffects({
			tracks,
			trackId: "effects",
			elementId: "effect-1",
			canvasSize: { width: 900, height: 1600 },
		});
		const effect = result.find((track) => track.id === "effects")?.elements[0] as {
			boxWidth: number;
		};

		expect(effect.boxWidth).toBeCloseTo(200 / 900);
	});

	test("materializes overlays from detected original subtitle bounds", () => {
		const tracks = [
			{
				id: "effects",
				type: "effect",
				elements: [{
					id: "effect-1", type: "blur-effect", name: "Kính mờ", startTime: 0,
					duration: 4, blurIntensity: 75, subtitleSyncSource: "original-subtitles",
					subtitleExpandX: 10, subtitleExpandY: 5,
					transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 }, opacity: 1,
				}],
			},
		] as never;
		const result = materializeSubtitleSyncedEffects({
			tracks,
			trackId: "effects",
			elementId: "effect-1",
			canvasSize: { width: 1000, height: 2000 },
			originalSubtitleCues: [{
				id: "original-1", mediaId: "video-1", videoElementId: "clip-1",
				startTime: 2, endTime: 3, confidence: 0.9,
				bounds: { x: 0.2, y: 0.3, width: 0.4, height: 0.1 },
			}],
		});
		const effect = result[0].elements[0] as {
			startTime: number; duration: number; boxWidth: number; boxHeight: number;
			transform: { position: { x: number; y: number } };
		};
		expect(effect.startTime).toBeCloseTo(1.9);
		expect(effect.duration).toBeCloseTo(1.2);
		expect(effect.boxWidth).toBeCloseTo(0.42);
		expect(effect.boxHeight).toBeCloseTo(0.105);
		expect(effect.transform.position.x).toBeCloseTo(-100);
		expect(effect.transform.position.y).toBeCloseTo(-300);
	});
});
