import { describe, expect, test } from "bun:test";
import type { CanvasRenderer } from "../canvas-renderer";
import { VisualNode, type VisualNodeParams } from "./visual-node";

type Draw = { filter: string; x: number; y: number; width: number; height: number };

class TestVisualNode extends VisualNode<VisualNodeParams> {
	renderCover(renderer: CanvasRenderer) {
		this.renderVisual({
			renderer,
			source: {} as CanvasImageSource,
			sourceWidth: 1080,
			sourceHeight: 1920,
			time: 0,
		});
	}
}

test("blurred cover paints an unfiltered base before the blur pass", () => {
	const draws: string[] = [];
	const context = {
		filter: "none",
		globalAlpha: 1,
		save() {},
		restore() {},
		drawImage() {
			draws.push(this.filter);
		},
	};
	const renderer = {
		width: 1920,
		height: 1080,
		context,
	} as unknown as CanvasRenderer;
	const node = new TestVisualNode({
		duration: 5,
		timeOffset: 0,
		trimStart: 0,
		trimEnd: 0,
		transform: {
			position: { x: 0, y: 0 },
			scale: 1,
			rotate: 0,
			flipX: false,
			flipY: false,
		},
		opacity: 1,
		isBackgroundCover: true,
		blurRadius: 32,
	});

	node.renderCover(renderer);

	expect(draws).toEqual(["none", "blur(32.0px)"]);
});

describe("background cover sizing", () => {
	test.each([
		[1920, 1080],
		[1080, 1080],
		[1080, 1920],
	] as const)("fills a %dx%d export canvas", (canvasWidth, canvasHeight) => {
		const draws: Draw[] = [];
		const context = {
			filter: "none",
			globalAlpha: 1,
			save() {},
			restore() {},
			drawImage(
				_source: CanvasImageSource,
				x: number,
				y: number,
				width: number,
				height: number,
			) {
				draws.push({ filter: this.filter, x, y, width, height });
			},
		};
		const renderer = {
			width: canvasWidth,
			height: canvasHeight,
			context,
		} as unknown as CanvasRenderer;
		const node = new TestVisualNode({
			duration: 5,
			timeOffset: 0,
			trimStart: 0,
			trimEnd: 0,
			transform: {
				position: { x: 0, y: 0 },
				scale: 1,
				rotate: 0,
				flipX: false,
				flipY: false,
			},
			opacity: 1,
			isBackgroundCover: true,
			blurRadius: 32,
		});

		node.renderCover(renderer);

		const base = draws[0];
		expect(base.x).toBeLessThanOrEqual(0);
		expect(base.y).toBeLessThanOrEqual(0);
		expect(base.x + base.width).toBeGreaterThanOrEqual(canvasWidth);
		expect(base.y + base.height).toBeGreaterThanOrEqual(canvasHeight);
	});
});
