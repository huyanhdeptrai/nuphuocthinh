import { describe, expect, test } from "bun:test";
import {
	mapCanvasOcrRegionsToSource,
	mapSourceBoundsToCanvas,
} from "./ocr-regions";

describe("OCR source/canvas rectangle mapping", () => {
	test("round-trips an unrotated subtitle box", () => {
		const sourceBounds = { cx: 500, cy: 1000, width: 800, height: 1600, rotation: 0 };
		const canvasSize = { width: 1000, height: 2000 };
		const source = { x: 0.25, y: 0.7, width: 0.5, height: 0.1 };
		const canvas = mapSourceBoundsToCanvas({ bounds: source, canvasSize, sourceBounds });
		expect(canvas?.x).toBeCloseTo(0.3);
		expect(canvas?.y).toBeCloseTo(0.66);
		expect(canvas?.width).toBeCloseTo(0.4);
		expect(canvas?.height).toBeCloseTo(0.08);
		const back = mapCanvasOcrRegionsToSource({
			regions: [{ id: "r", name: "R", ...canvas!, enabled: true }],
			canvasSize,
			sourceBounds,
		});
		expect(back[0].x).toBeCloseTo(source.x);
		expect(back[0].y).toBeCloseTo(source.y);
		expect(back[0].width).toBeCloseTo(source.width);
		expect(back[0].height).toBeCloseTo(source.height);
	});
});
