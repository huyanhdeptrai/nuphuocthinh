import type { CanvasRenderer } from "../canvas-renderer";
import { loadCachedImage } from "../image-cache";
import { VisualNode, type VisualNodeParams } from "./visual-node";

export interface ImageNodeParams extends VisualNodeParams {
	url: string;
}

export class ImageNode extends VisualNode<ImageNodeParams> {
	private image?: HTMLImageElement;
	private readyPromise: Promise<void>;

	constructor(params: ImageNodeParams) {
		super(params);
		this.readyPromise = this.load();
	}

	private async load() {
		this.image = await loadCachedImage(this.params.url);
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		await super.render({ renderer, time });

		if (!this.isInRange(time)) {
			return;
		}

		await this.readyPromise;

		if (!this.image) {
			return;
		}

		const mediaW = this.image.naturalWidth || renderer.width;
		const mediaH = this.image.naturalHeight || renderer.height;

		const masked = this.getMaskedSource({
			source: this.image,
			sourceWidth: mediaW,
			sourceHeight: mediaH,
			renderer,
		});
		this.renderVisual({ renderer, ...masked, time });
	}
}
