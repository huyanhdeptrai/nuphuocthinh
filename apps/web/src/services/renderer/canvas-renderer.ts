import type { BaseNode } from "./nodes/base-node";

export type RenderQuality = "preview" | "export";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: number;
	imageSmoothingQuality?: ImageSmoothingQuality;
	quality?: RenderQuality;
	previewMaxEdge?: number;
	bufferWidth?: number;
	bufferHeight?: number;
};

export class CanvasRenderer {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
	width: number;
	height: number;
	bufferWidth: number;
	bufferHeight: number;
	fps: number;
	quality: RenderQuality;
	previewMaxEdge: number;
	private smoothingQuality: ImageSmoothingQuality;
	private targetContext: CanvasRenderingContext2D | null = null;
	private lastTarget: HTMLCanvasElement | null = null;

	constructor({
		width,
		height,
		fps,
		imageSmoothingQuality = "low",
		quality = "export",
		previewMaxEdge = 1280,
		bufferWidth,
		bufferHeight,
	}: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.bufferWidth = bufferWidth ?? width;
		this.bufferHeight = bufferHeight ?? height;
		this.fps = fps;
		this.quality = quality;
		this.previewMaxEdge = previewMaxEdge;
		this.smoothingQuality = imageSmoothingQuality;

		try {
			this.canvas = new OffscreenCanvas(this.bufferWidth, this.bufferHeight);
		} catch {
			this.canvas = document.createElement("canvas");
			this.canvas.width = this.bufferWidth;
			this.canvas.height = this.bufferHeight;
		}

		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get canvas context");
		}

		this.context = context as
			| OffscreenCanvasRenderingContext2D
			| CanvasRenderingContext2D;
		this.applySmoothing();
	}

	get viewScaleX(): number {
		return this.bufferWidth / Math.max(1, this.width);
	}

	get viewScaleY(): number {
		return this.bufferHeight / Math.max(1, this.height);
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;
		this.bufferWidth = width;
		this.bufferHeight = height;

		if (this.canvas instanceof OffscreenCanvas) {
			this.canvas = new OffscreenCanvas(width, height);
		} else {
			this.canvas.width = width;
			this.canvas.height = height;
		}

		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get canvas context");
		}
		this.context = context as
			| OffscreenCanvasRenderingContext2D
			| CanvasRenderingContext2D;
		this.applySmoothing();
	}

	applyViewTransform(
		context:
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D = this.context,
	) {
		context.setTransform(this.viewScaleX, 0, 0, this.viewScaleY, 0, 0);
	}

	private applySmoothing() {
		this.context.imageSmoothingEnabled = true;
		this.context.imageSmoothingQuality = this.smoothingQuality;
		this.applyViewTransform();
	}

	private clear() {
		this.context.clearRect(0, 0, this.width, this.height);
	}

	async render({ node, time }: { node: BaseNode; time: number }) {
		this.clear();
		await node.render({ renderer: this, time });
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: BaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		if (this.lastTarget !== targetCanvas) {
			this.targetContext = targetCanvas.getContext("2d");
			this.lastTarget = targetCanvas;
		}

		const ctx = this.targetContext;
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		const previousCanvas = this.canvas;
		const previousContext = this.context;
		this.canvas = targetCanvas;
		this.context = ctx;
		this.bufferWidth = targetCanvas.width;
		this.bufferHeight = targetCanvas.height;
		this.applySmoothing();

		try {
			await this.render({ node, time });
		} finally {
			this.canvas = previousCanvas;
			this.context = previousContext;
			this.bufferWidth = previousCanvas.width;
			this.bufferHeight = previousCanvas.height;
		}
	}
}
