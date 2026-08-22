import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type {
	ElementKeyframes,
	OverlayEffectMode,
	Transform,
} from "@/types/timeline";
import { resolveAnimatedProperties } from "@/lib/timeline/keyframe-utils";

export type BlurEffectNodeParams = {
	effectMode?: OverlayEffectMode;
	blurIntensity: number;
	pixelSize?: number;
	feather?: number;
	boxWidth?: number;
	boxHeight?: number;
	darkenOverlay?: number;
	borderRadius?: number;
	/** Frosted Glass: grain/noise intensity (0–100, default 30). */
	grainIntensity?: number;
	/** Remove Logo: extra padding around masked area in pixels. */
	borderPadding?: number;
	/** Remove Subtitle: expand region by px on each side. */
	expandTop?: number;
	expandBottom?: number;
	expandLeft?: number;
	expandRight?: number;
	syncWithSubtitles?: boolean;
	subtitlePaddingStart?: number;
	subtitlePaddingEnd?: number;
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	transform: Transform;
	opacity: number;
	keyframes?: ElementKeyframes;
};

const VISUAL_EPSILON = 1 / 1000;

export class BlurEffectNode extends BaseNode<BlurEffectNodeParams> {
	private offscreen?: OffscreenCanvas | HTMLCanvasElement;
	private offscreenCtx?:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D;

	private pixelCanvas?: OffscreenCanvas | HTMLCanvasElement;
	private pixelCtx?:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D;

	private maskCanvas?: OffscreenCanvas | HTMLCanvasElement;
	private maskCtx?:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D;

	shouldRender(time: number): boolean {
		return this.isInRange(time);
	}

	private isInRange(time: number): boolean {
		const elapsed = time - this.params.timeOffset;
		return elapsed >= -VISUAL_EPSILON && elapsed < this.params.duration;
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
				const octx = this.offscreen.getContext("2d");
				if (!octx) throw new Error("no 2d context");
				this.offscreenCtx = octx;
			} catch {
				this.offscreen = document.createElement("canvas");
				this.offscreen.width = width;
				this.offscreen.height = height;
				const octx = this.offscreen.getContext("2d");
				if (!octx) throw new Error("no 2d context");
				this.offscreenCtx = octx;
			}
		}

		return { canvas: this.offscreen!, context: this.offscreenCtx! };
	}

	private ensurePixelCanvas({
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
			!this.pixelCanvas ||
			!this.pixelCtx ||
			this.pixelCanvas.width !== width ||
			this.pixelCanvas.height !== height;

		if (needsRecreate) {
			try {
				this.pixelCanvas = new OffscreenCanvas(width, height);
				const pctx = this.pixelCanvas.getContext("2d");
				if (!pctx) throw new Error("no 2d context");
				this.pixelCtx = pctx;
			} catch {
				this.pixelCanvas = document.createElement("canvas");
				this.pixelCanvas.width = width;
				this.pixelCanvas.height = height;
				const pctx = this.pixelCanvas.getContext("2d");
				if (!pctx) throw new Error("no 2d context");
				this.pixelCtx = pctx;
			}
		}

		return { canvas: this.pixelCanvas!, context: this.pixelCtx! };
	}

	private ensureMaskCanvas({
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
			!this.maskCanvas ||
			!this.maskCtx ||
			this.maskCanvas.width !== width ||
			this.maskCanvas.height !== height;

		if (needsRecreate) {
			try {
				this.maskCanvas = new OffscreenCanvas(width, height);
				const mctx = this.maskCanvas.getContext("2d");
				if (!mctx) throw new Error("no 2d context");
				this.maskCtx = mctx;
			} catch {
				this.maskCanvas = document.createElement("canvas");
				this.maskCanvas.width = width;
				this.maskCanvas.height = height;
				const mctx = this.maskCanvas.getContext("2d");
				if (!mctx) throw new Error("no 2d context");
				this.maskCtx = mctx;
			}
		}

		return { canvas: this.maskCanvas!, context: this.maskCtx! };
	}

	async render({
		renderer,
		time,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		if (!this.isInRange(time)) return;

		const ctx = renderer.context;

		// Resolve animated transform/opacity for this frame
		const localTime = time - this.params.timeOffset;
		const { transform, opacity } = resolveAnimatedProperties({
			keyframes: this.params.keyframes,
			time: localTime,
			baseTransform: this.params.transform,
			baseOpacity: this.params.opacity,
		});

		if (opacity <= 0) return;

		const mode = this.params.effectMode ?? "blur-strip";
		const isPixelate = mode === "pixelate";
		const isFrosted = mode === "frosted-glass";
		const isRemoveLogo = mode === "remove-logo";
		const isRemoveSubtitle = mode === "remove-subtitle";
		const blurRadius =
			(this.params.blurIntensity / 100) * (isFrosted ? 35 : 30);

		// Region size: scale relative to canvas dimensions
		const boxWidth = this.params.boxWidth ?? 1;
		const boxHeight = this.params.boxHeight ?? 1;
		const regionWidth = renderer.width * transform.scale * boxWidth;
		const regionHeight = renderer.height * transform.scale * boxHeight;

		// Region center: position is offset from canvas center
		const centerX = renderer.width / 2 + transform.position.x;
		const centerY = renderer.height / 2 + transform.position.y;

		const regionX = centerX - regionWidth / 2;
		const regionY = centerY - regionHeight / 2;

		const regionW = Math.max(1, Math.round(regionWidth * renderer.viewScaleX));
		const regionH = Math.max(1, Math.round(regionHeight * renderer.viewScaleY));
		const removalBlur =
			(isRemoveLogo || isRemoveSubtitle
				? (this.params.blurIntensity / 100) * 48 * renderer.viewScaleX
				: 0);
		// Blurring only the selected pixels discards their neighbours. That makes
		// a small selection look noticeably sharper than the same effect at its
		// original size, especially near its edges. Keep enough source pixels
		// around the selection for the Gaussian kernel, then crop back to it.
		const blurBleed = Math.ceil(removalBlur * 2);

		// Step 1: Capture underlying area into a raw buffer
		const { canvas: pCanvas, context: pCtx } = this.ensurePixelCanvas({
			width: regionW + blurBleed * 2,
			height: regionH + blurBleed * 2,
		});
		pCtx.setTransform(1, 0, 0, 1, 0, 0);
		pCtx.clearRect(
			0,
			0,
			regionW + blurBleed * 2,
			regionH + blurBleed * 2,
		);
		pCtx.drawImage(
			renderer.canvas as CanvasImageSource,
			regionX * renderer.viewScaleX - blurBleed,
			regionY * renderer.viewScaleY - blurBleed,
			regionWidth * renderer.viewScaleX + blurBleed * 2,
			regionHeight * renderer.viewScaleY + blurBleed * 2,
			0,
			0,
			regionW + blurBleed * 2,
			regionH + blurBleed * 2,
		);

		// Step 2: Offscreen composite buffer
		const { canvas: offscreen, context: offscreenCtx } = this.ensureOffscreen({
			width: regionW,
			height: regionH,
		});
		offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
		offscreenCtx.clearRect(0, 0, regionW, regionH);

		if (isPixelate) {
			// Mosaic pixelation pass (sharp, distinct pixel blocks)
			const basePixelSize = Math.max(
				4,
				Math.round(this.params.pixelSize ?? 20),
			);
			const effectivePixelSize = Math.max(
				2,
				Math.round(basePixelSize * renderer.viewScaleX),
			);
			const pW = Math.max(1, Math.round(regionW / effectivePixelSize));
			const pH = Math.max(1, Math.round(regionH / effectivePixelSize));

			const smallCanvas = document.createElement("canvas");
			smallCanvas.width = pW;
			smallCanvas.height = pH;
			const sCtx = smallCanvas.getContext("2d");
			if (sCtx) {
				sCtx.imageSmoothingEnabled = false;
				sCtx.drawImage(pCanvas as CanvasImageSource, 0, 0, pW, pH);
				offscreenCtx.imageSmoothingEnabled = false;
				offscreenCtx.drawImage(smallCanvas, 0, 0, regionW, regionH);
			}
		} else if (isRemoveLogo || isRemoveSubtitle) {
			// Ezmaxsub's removal preview is a dense, even Gaussian concealment:
			// it removes detail inside the selected box without directional streaks.
			offscreenCtx.filter = `blur(${removalBlur}px)`;
			offscreenCtx.drawImage(
				pCanvas as CanvasImageSource,
				-blurBleed,
				-blurBleed,
				regionW + blurBleed * 2,
				regionH + blurBleed * 2,
			);
			offscreenCtx.filter = "none";
		} else {
			// Gaussian Blur background pass
			offscreenCtx.filter = `blur(${Math.max(1, blurRadius)}px)`;
			offscreenCtx.drawImage(
				pCanvas as CanvasImageSource,
				0,
				0,
				regionW,
				regionH,
			);
			offscreenCtx.filter = "none";
		}

		// Step 3: Frosted Glass Overlay (Organic Mist Cloud + Translucent Milk + Sparkling Frost Crystals)
		if (isFrosted) {
			// A. Organic Billowy Mist Puffs (Đám mây sương khói bồng bềnh tán xạ)
			const puffCount = 20;
			const minDim = Math.min(regionW, regionH);
			for (let i = 0; i < puffCount; i++) {
				const seed1 = (i * 9301 + 49297) % 233280;
				const seed2 = ((i + 7) * 9301 + 49297) % 233280;
				const seed3 = ((i + 13) * 9301 + 49297) % 233280;
				const px = (0.15 + (seed1 / 233280) * 0.7) * regionW;
				const py = (0.15 + (seed2 / 233280) * 0.7) * regionH;
				const pr = (0.35 + (seed3 / 233280) * 0.45) * minDim;

				const puffGrad = offscreenCtx.createRadialGradient(
					px,
					py,
					pr * 0.05,
					px,
					py,
					pr,
				);
				puffGrad.addColorStop(0, "rgba(255, 255, 255, 0.75)");
				puffGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
				puffGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.25)");
				puffGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");

				offscreenCtx.fillStyle = puffGrad;
				offscreenCtx.beginPath();
				offscreenCtx.arc(px, py, pr, 0, Math.PI * 2);
				offscreenCtx.fill();
			}

			// B. Soft translucent base fill
			offscreenCtx.fillStyle = "rgba(255, 255, 255, 0.38)";
			offscreenCtx.fillRect(0, 0, regionW, regionH);

			// C. Crisp Frost Grain (Hạt sương kính tán xạ)
			const grainLevel = Math.min(
				100,
				Math.max(0, this.params.grainIntensity ?? 30),
			);
			if (grainLevel > 0) {
				const nW = Math.min(regionW, 512);
				const nH = Math.min(regionH, 512);
				const tempCanvas = document.createElement("canvas");
				tempCanvas.width = nW;
				tempCanvas.height = nH;
				const tCtx = tempCanvas.getContext("2d");
				if (tCtx) {
					const imgData = tCtx.createImageData(nW, nH);
					const d = imgData.data;
					const grainAlpha = (grainLevel / 100) * 160;
					for (let i = 0; i < d.length; i += 4) {
						if (Math.random() < 0.65) {
							// White sparkling micro-frost
							const lum = 215 + Math.random() * 40;
							d[i] = lum;
							d[i + 1] = lum;
							d[i + 2] = lum;
							d[i + 3] = Math.round(Math.random() * grainAlpha);
						}
					}
					tCtx.putImageData(imgData, 0, 0);

					offscreenCtx.save();
					offscreenCtx.globalCompositeOperation = "source-over";
					offscreenCtx.drawImage(tempCanvas, 0, 0, regionW, regionH);
					offscreenCtx.restore();
				}
			}
		}

		// Step 4: Darken Overlay (for Blur Strip)
		const darkenPercent =
			this.params.darkenOverlay ?? (mode === "blur-strip" ? 35 : 0);
		if (darkenPercent > 0 && !isFrosted) {
			const alpha = Math.min(1, Math.max(0, darkenPercent / 100));
			offscreenCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
			offscreenCtx.fillRect(0, 0, regionW, regionH);
		}

		// Step 5: Feather Mask (Only when feather > 0.02 and not pixelate by default)
		const featherVal = this.params.feather ?? 0;
		if (featherVal > 0.02) {
			const featherPx = Math.max(
				1,
				Math.round(Math.min(regionW, regionH) * 0.25 * Math.min(1, featherVal)),
			);
			const { canvas: mCanvas, context: mCtx } = this.ensureMaskCanvas({
				width: regionW,
				height: regionH,
			});

			// The mask canvas is reused between frames. The previous frame leaves it
			// in destination-out mode, so reset compositing before rebuilding the
			// opaque mask or every frame after the first becomes fully transparent.
			mCtx.globalCompositeOperation = "source-over";
			mCtx.clearRect(0, 0, regionW, regionH);
			mCtx.fillStyle = "#ffffff";
			mCtx.fillRect(0, 0, regionW, regionH);

			mCtx.globalCompositeOperation = "destination-out";

			// Left edge
			const gradLeft = mCtx.createLinearGradient(0, 0, featherPx, 0);
			gradLeft.addColorStop(0, "rgba(0,0,0,1)");
			gradLeft.addColorStop(1, "rgba(0,0,0,0)");
			mCtx.fillStyle = gradLeft;
			mCtx.fillRect(0, 0, featherPx, regionH);

			// Right edge
			const gradRight = mCtx.createLinearGradient(
				regionW,
				0,
				regionW - featherPx,
				0,
			);
			gradRight.addColorStop(0, "rgba(0,0,0,1)");
			gradRight.addColorStop(1, "rgba(0,0,0,0)");
			mCtx.fillStyle = gradRight;
			mCtx.fillRect(regionW - featherPx, 0, featherPx, regionH);

			// Top edge
			const gradTop = mCtx.createLinearGradient(0, 0, 0, featherPx);
			gradTop.addColorStop(0, "rgba(0,0,0,1)");
			gradTop.addColorStop(1, "rgba(0,0,0,0)");
			mCtx.fillStyle = gradTop;
			mCtx.fillRect(0, 0, regionW, featherPx);

			// Bottom edge
			const gradBottom = mCtx.createLinearGradient(
				0,
				regionH,
				0,
				regionH - featherPx,
			);
			gradBottom.addColorStop(0, "rgba(0,0,0,1)");
			gradBottom.addColorStop(1, "rgba(0,0,0,0)");
			mCtx.fillStyle = gradBottom;
			mCtx.fillRect(0, regionH - featherPx, regionW, featherPx);

			// Apply feathered mask to the entire offscreen composite
			offscreenCtx.globalCompositeOperation = "destination-in";
			offscreenCtx.drawImage(mCanvas as CanvasImageSource, 0, 0);
			offscreenCtx.globalCompositeOperation = "source-over";
		}

		// Step 6: Compute final draw region with expand (remove-subtitle) or padding (remove-logo)
		let drawX = regionX;
		let drawY = regionY;
		let drawW = regionWidth;
		let drawH = regionHeight;

		if (mode === "remove-subtitle") {
			const eT = this.params.expandTop ?? 0;
			const eB = this.params.expandBottom ?? 0;
			const eL = this.params.expandLeft ?? 0;
			const eR = this.params.expandRight ?? 0;
			drawX -= eL;
			drawY -= eT;
			drawW += eL + eR;
			drawH += eT + eB;
		} else if (mode === "remove-logo") {
			const pad = this.params.borderPadding ?? 0;
			drawX -= pad;
			drawY -= pad;
			drawW += pad * 2;
			drawH += pad * 2;
		}

		// Step 7: Draw the final composite directly to the canvas
		ctx.save();
		ctx.globalAlpha = opacity;

		// Apply rotation around the region center
		if (transform.rotate !== 0) {
			ctx.translate(centerX, centerY);
			ctx.rotate((transform.rotate * Math.PI) / 180);
			ctx.translate(-centerX, -centerY);
		}

		// Apply border radius clipping if set
		const borderRadius = this.params.borderRadius ?? (isFrosted ? 4 : 0);
		if (borderRadius > 0 && typeof ctx.roundRect === "function") {
			ctx.beginPath();
			ctx.roundRect(drawX, drawY, drawW, drawH, borderRadius);
			ctx.clip();
		}

		if (isPixelate) {
			ctx.imageSmoothingEnabled = false;
		}

		ctx.drawImage(offscreen as CanvasImageSource, drawX, drawY, drawW, drawH);

		ctx.restore();
	}
}
