import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";

export type BlurBackgroundNodeParams = {
	blurIntensity: number;
	contentNodes: BaseNode[];
};

export class BlurBackgroundNode extends BaseNode<BlurBackgroundNodeParams> {
	private blurIntensity: number;
	private contentNodes: BaseNode[];
	private offscreen?: OffscreenCanvas | HTMLCanvasElement;
	private offscreenCtx?:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D;

	constructor(params: BlurBackgroundNodeParams) {
		super(params);
		this.blurIntensity = params.blurIntensity;
		this.contentNodes = params.contentNodes;
	}

	private ensureOffscreen({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): {
		canvas: OffscreenCanvas | HTMLCanvasElement;
		context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
	} {
		const needsRecreate =
			!this.offscreen ||
			!this.offscreenCtx ||
			this.offscreen.width !== width ||
			this.offscreen.height !== height;

		if (needsRecreate) {
			try {
				this.offscreen = new OffscreenCanvas(width, height);
				const ctx = this.offscreen.getContext("2d");
				if (!ctx) {
					throw new Error("failed to get offscreen canvas context");
				}
				this.offscreenCtx = ctx;
			} catch {
				this.offscreen = document.createElement("canvas");
				this.offscreen.width = width;
				this.offscreen.height = height;
				const ctx = this.offscreen.getContext("2d");
				if (!ctx) {
					throw new Error("failed to get canvas context");
				}
				this.offscreenCtx = ctx;
			}
		}

		return { canvas: this.offscreen!, context: this.offscreenCtx! };
	}

	async render({
		renderer,
		time,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		const { canvas: offscreen, context: offscreenCtx } = this.ensureOffscreen({
			width: renderer.bufferWidth,
			height: renderer.bufferHeight,
		});
		offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
		offscreenCtx.clearRect(0, 0, renderer.bufferWidth, renderer.bufferHeight);
		renderer.applyViewTransform(offscreenCtx);

		const originalContext = renderer.context;
		renderer.context = offscreenCtx;

		for (const node of this.contentNodes) {
			if (!node.shouldRender(time)) continue;
			await node.render({ renderer, time });
		}

		// Calculate cover zoom scale so that even vertical (9:16) video on landscape (16:9, 4:3) canvas
		// (or vice-versa) completely fills and covers the entire background without gaps.
		const aspect = renderer.width / Math.max(1, renderer.height);
		const coverZoomScale = Math.max(
			aspect >= 1 ? aspect / 0.52 : (1 / aspect) * 1.95,
			3.2,
		) * 1.15;

		const scaledWidth = renderer.width * coverZoomScale;
		const scaledHeight = renderer.height * coverZoomScale;
		const offsetX = (renderer.width - scaledWidth) / 2;
		const offsetY = (renderer.height - scaledHeight) / 2;

		// Scale blur intensity relative to canvas buffer resolution for smooth creamy blur
		const blurPx = Math.max(4, this.blurIntensity * (renderer.width / 960) * 1.5);

		renderer.context.save();
		renderer.context.filter = `blur(${blurPx.toFixed(1)}px)`;
		renderer.context.drawImage(
			offscreen as CanvasImageSource,
			offsetX,
			offsetY,
			scaledWidth,
			scaledHeight,
		);
		renderer.context.restore();
	}
}
