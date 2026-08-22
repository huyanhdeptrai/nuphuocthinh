import { afterEach, describe, expect, test } from "bun:test";
import type { CanvasRenderer } from "../canvas-renderer";
import { BlurEffectNode } from "./blur-effect-node";

class FakeGradient {
	addColorStop() {}
}

class FakeCanvas {
	readonly context: FakeContext;
	static readonly createdSizes: Array<{ width: number; height: number }> = [];

	constructor(
		public width: number,
		public height: number,
	) {
		FakeCanvas.createdSizes.push({ width, height });
		this.context = new FakeContext(this);
	}

	getContext() {
		return this.context;
	}
}

class FakeContext {
	globalAlpha = 1;
	globalCompositeOperation = "source-over";
	fillStyle: string | FakeGradient = "#000000";
	private filterValue = "none";
	static readonly appliedFilters: string[] = [];

	get filter() {
		return this.filterValue;
	}

	set filter(value: string) {
		this.filterValue = value;
		if (value.startsWith("blur(")) FakeContext.appliedFilters.push(value);
	}
	imageSmoothingEnabled = true;
	imageSmoothingQuality: ImageSmoothingQuality = "low";
	centerAlpha = 0;
	readonly sourceAlphasDrawn: number[] = [];
	private readonly stateStack: Array<{
		globalAlpha: number;
		globalCompositeOperation: string;
	}> = [];

	constructor(private readonly canvas: FakeCanvas) {}

	setTransform() {}
	translate() {}
	rotate() {}
	beginPath() {}
	clip() {}
	roundRect() {}

	save() {
		this.stateStack.push({
			globalAlpha: this.globalAlpha,
			globalCompositeOperation: this.globalCompositeOperation,
		});
	}

	restore() {
		const state = this.stateStack.pop();
		if (!state) return;
		this.globalAlpha = state.globalAlpha;
		this.globalCompositeOperation = state.globalCompositeOperation;
	}

	clearRect(x: number, y: number, width: number, height: number) {
		if (this.includesCenter({ x, y, width, height })) this.centerAlpha = 0;
	}

	fillRect(x: number, y: number, width: number, height: number) {
		if (!this.includesCenter({ x, y, width, height })) return;
		if (this.globalCompositeOperation === "destination-out") {
			this.centerAlpha = 0;
			return;
		}
		this.centerAlpha = this.globalAlpha;
	}

	drawImage(source: FakeCanvas, ...args: number[]) {
		const destination = this.readDestination({ source, args });
		if (!this.includesCenter(destination)) return;
		const sourceAlpha = source.context.centerAlpha;
		this.sourceAlphasDrawn.push(sourceAlpha);
		if (this.globalCompositeOperation === "destination-in") {
			this.centerAlpha *= sourceAlpha;
			return;
		}
		this.centerAlpha = sourceAlpha * this.globalAlpha;
	}

	createLinearGradient() {
		return new FakeGradient();
	}

	private readDestination({
		source,
		args,
	}: {
		source: FakeCanvas;
		args: number[];
	}) {
		if (args.length >= 8) {
			return { x: args[4], y: args[5], width: args[6], height: args[7] };
		}
		if (args.length >= 4) {
			return { x: args[0], y: args[1], width: args[2], height: args[3] };
		}
		return {
			x: args[0] ?? 0,
			y: args[1] ?? 0,
			width: source.width,
			height: source.height,
		};
	}

	private includesCenter({
		x,
		y,
		width,
		height,
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) {
		const centerX = this.canvas.width / 2;
		const centerY = this.canvas.height / 2;
		return (
			centerX >= x &&
			centerX < x + width &&
			centerY >= y &&
			centerY < y + height
		);
	}
}

const originalOffscreenCanvas = globalThis.OffscreenCanvas;
const originalDocument = globalThis.document;

afterEach(() => {
	FakeContext.appliedFilters.length = 0;
	FakeCanvas.createdSizes.length = 0;
	Object.assign(globalThis, {
		OffscreenCanvas: originalOffscreenCanvas,
		document: originalDocument,
	});
});

function createRenderer() {
	const target = new FakeCanvas(100, 100);
	target.context.centerAlpha = 1;
	return {
		canvas: target,
		context: target.context,
		width: 100,
		height: 100,
		viewScaleX: 1,
		viewScaleY: 1,
	} as unknown as CanvasRenderer;
}

describe("BlurEffectNode feather mask", () => {
	test("keeps pixelate visible across consecutive rendered frames", async () => {
		Object.assign(globalThis, {
			OffscreenCanvas: FakeCanvas,
			document: {
				createElement: () => new FakeCanvas(1, 1),
			},
		});

		const renderer = createRenderer();
		const node = new BlurEffectNode({
			effectMode: "pixelate",
			blurIntensity: 50,
			pixelSize: 16,
			feather: 0.5,
			boxWidth: 0.5,
			boxHeight: 0.5,
			duration: 4,
			timeOffset: 0,
			trimStart: 0,
			trimEnd: 0,
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
			opacity: 1,
		});

		await node.render({ renderer, time: 0 });
		await node.render({ renderer, time: 1 / 30 });

		const finalEffectAlphas = (
			renderer.context as unknown as FakeContext
		).sourceAlphasDrawn.slice(-2);
		expect(finalEffectAlphas).toEqual([1, 1]);
	});
});

describe("BlurEffectNode removal effects", () => {
	test.each(["remove-logo", "remove-subtitle"] as const)(
		"uses dense Gaussian concealment for %s",
		async (effectMode) => {
			Object.assign(globalThis, {
				OffscreenCanvas: FakeCanvas,
				document: { createElement: () => new FakeCanvas(1, 1) },
			});

			const node = new BlurEffectNode({
				effectMode,
				blurIntensity: 75,
				feather: 0,
				boxWidth: 0.5,
				boxHeight: 0.5,
				duration: 4,
				timeOffset: 0,
				trimStart: 0,
				trimEnd: 0,
				transform: {
					scale: 1,
					position: { x: 0, y: 0 },
					rotate: 0,
				},
				opacity: 1,
			});

			await node.render({ renderer: createRenderer(), time: 0 });

			expect(FakeContext.appliedFilters).toContain("blur(36px)");
		},
	);

	test("keeps source pixels outside a small selected region for a consistent blur", async () => {
		Object.assign(globalThis, {
			OffscreenCanvas: FakeCanvas,
			document: { createElement: () => new FakeCanvas(1, 1) },
		});

		const node = new BlurEffectNode({
			effectMode: "remove-logo",
			blurIntensity: 75,
			feather: 0,
			boxWidth: 0.5,
			boxHeight: 0.5,
			duration: 4,
			timeOffset: 0,
			trimStart: 0,
			trimEnd: 0,
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
			opacity: 1,
		});

		await node.render({ renderer: createRenderer(), time: 0 });

		// A 50px region at 75% blur needs a 72px source margin on each side.
		expect(FakeCanvas.createdSizes).toContainEqual({ width: 194, height: 194 });
	});
});
