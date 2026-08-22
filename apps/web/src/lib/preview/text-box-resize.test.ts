import { describe, expect, test } from "bun:test";
import { resizeTextBoxFromSide } from "./text-box-resize";

describe("text box side resize", () => {
	const initialTransform = {
		scale: 0.5,
		position: { x: 120, y: 300 },
		rotate: 0,
	};

	test("right handle widens around the fixed text center", () => {
		const result = resizeTextBoxFromSide({
			handle: "right",
			deltaX: 100,
			initialBoxWidth: 42,
			pixelsPerBoxUnit: 6,
			initialTransform,
		});

		expect(result.boxWidth).toBeCloseTo(58.6666667, 5);
		expect(result.transform).toEqual(initialTransform);
	});

	test("left handle widens around the same fixed text center", () => {
		const result = resizeTextBoxFromSide({
			handle: "left",
			deltaX: -100,
			initialBoxWidth: 42,
			pixelsPerBoxUnit: 6,
			initialTransform,
		});

		expect(result.boxWidth).toBeCloseTo(58.6666667, 5);
		expect(result.transform.position.x).toBe(120);
	});
});
