import { describe, expect, test } from "bun:test";
import { hitTestElements } from "./hit-test";

describe("hitTestElements", () => {
	test("selects the effect under the pointer instead of an unrelated effect", () => {
		const result = hitTestElements({
			point: { x: 500, y: 500 },
			tracks: [
				{
					id: "effects",
					name: "Effects",
					type: "effect",
					hidden: false,
					elements: [
						{
							id: "z-top-effect",
							type: "blur-effect",
							name: "Top effect",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							blurIntensity: 50,
							boxWidth: 0.2,
							boxHeight: 0.2,
							transform: { scale: 1, position: { x: 0, y: -200 }, rotate: 0 },
							opacity: 1,
						},
						{
							id: "a-bottom-effect",
							type: "blur-effect",
							name: "Bottom effect",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							blurIntensity: 50,
							boxWidth: 0.2,
							boxHeight: 0.2,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
			mediaAssets: [],
			canvasWidth: 1000,
			canvasHeight: 1000,
			currentTime: 1,
		});

		expect(result?.element.id).toBe("a-bottom-effect");
	});
});
