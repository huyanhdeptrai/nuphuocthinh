import { describe, expect, test } from "bun:test";
import {
	buildBlurStripElement,
	buildFrostedGlassElement,
	buildPixelateElement,
	buildRemoveLogoElement,
	findLatestOverlayElementRef,
} from "./element-utils";

const START = 12.5;

describe("ezmaxsub overlay effect defaults", () => {
	test("Pixelate matches ezmaxsub Kiểu defaults", () => {
		const el = buildPixelateElement({ startTime: START });
		expect(el.effectMode).toBe("pixelate");
		expect(el.name).toBe("Pixelate");
		expect(el.feather).toBe(0.5);
		expect(el.pixelSize).toBe(16);
		expect(el.blurIntensity).toBe(50);
		expect(el.syncWithSubtitles).toBe(false);
		expect(el.subtitlePaddingStart).toBe(0.1);
		expect(el.subtitlePaddingEnd).toBe(0.1);
		expect(el.duration).toBe(4);
		expect(el.startTime).toBe(START);
		expect(el.opacity).toBe(1);
	});

	test("Blur Strip matches ezmaxsub Kiểu defaults", () => {
		const el = buildBlurStripElement({ startTime: START });
		expect(el.effectMode).toBe("blur-strip");
		expect(el.name).toBe("Dải làm mờ");
		expect(el.feather).toBe(0.5);
		expect(el.blurIntensity).toBe(128);
		expect(el.darkenOverlay).toBe(35);
		expect(el.syncWithSubtitles).toBe(false);
		expect(el.subtitlePaddingStart).toBe(0.1);
		expect(el.subtitlePaddingEnd).toBe(0.1);
		expect(el.duration).toBe(4);
	});

	test("Frosted Glass matches ezmaxsub Kiểu defaults", () => {
		const el = buildFrostedGlassElement({ startTime: START });
		expect(el.effectMode).toBe("frosted-glass");
		expect(el.name).toBe("Frosted Glass");
		expect(el.feather).toBe(0.5);
		expect(el.blurIntensity).toBe(80);
		expect(el.grainIntensity).toBe(30);
		expect(el.syncWithSubtitles).toBe(false);
		expect(el.duration).toBe(4);
	});

	test("Kính mờ matches the selected-region defaults", () => {
		const el = buildRemoveLogoElement({ startTime: START });
		expect(el.effectMode).toBe("remove-logo");
		expect(el.name).toBe("Kính mờ");
		expect(el.feather).toBe(0.5);
		expect(el.borderPadding).toBe(4);
		expect(el.syncWithSubtitles).toBe(false);
		expect(el.duration).toBe(4);
	});

	test("findLatestOverlayElementRef returns the last matching overlay", () => {
		const ref = findLatestOverlayElementRef({
			tracks: [
				{
					id: "t1",
					name: "overlay",
					type: "effect",
					elements: [
						{
							id: "old",
							type: "blur-effect",
							name: "Pixelate",
							effectMode: "pixelate",
							startTime: 1,
							duration: 4,
							trimStart: 0,
							trimEnd: 0,
							blurIntensity: 50,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
						{
							id: "new",
							type: "blur-effect",
							name: "Pixelate",
							effectMode: "pixelate",
							startTime: 1,
							duration: 4,
							trimStart: 0,
							trimEnd: 0,
							blurIntensity: 50,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			] as never,
			effectMode: "pixelate",
			startTime: 1,
		});
		expect(ref).toEqual({ trackId: "t1", elementId: "new" });
	});
});
