import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type {
	ChromaKeyConfig,
	ElementKeyframes,
	ShapeMaskConfig,
	Transform,
	VideoEffectConfig,
} from "@/types/timeline";
import { resolveAnimatedProperties } from "@/lib/timeline/keyframe-utils";
import {
	applyChromaKey,
	ensureChromaTarget,
	type DrawableCanvas,
} from "@/lib/renderer/chroma-key";
import { applyVideoEffect } from "@/lib/renderer/video-effects";
import { applyShapeMask } from "@/lib/renderer/shape-mask";

const VISUAL_EPSILON = 1 / 1000;

export interface VisualNodeParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	transform: Transform;
	opacity: number;
	filter?: string;
	vignette?: number; // 0-100, edge darkening intensity
	blendMode?: string;
	chromaKey?: ChromaKeyConfig;
	videoEffect?: VideoEffectConfig;
	shapeMask?: ShapeMaskConfig;
	keyframes?: ElementKeyframes;
	playbackRate?: number;
	reversed?: boolean;
	isBackgroundCover?: boolean;
	blurRadius?: number;
}

export abstract class VisualNode<
	Params extends VisualNodeParams = VisualNodeParams,
> extends BaseNode<Params> {
	private chromaTarget?: DrawableCanvas;
	private vfxTarget?: DrawableCanvas;
	private shapeMaskTarget?: DrawableCanvas;

	private previewSourceTarget?: DrawableCanvas;

	shouldRender(time: number): boolean {
		return this.isInRange(time);
	}

	protected getMaskedSource({
		source,
		sourceWidth,
		sourceHeight,
		renderer,
	}: {
		source: CanvasImageSource;
		sourceWidth: number;
		sourceHeight: number;
		renderer: CanvasRenderer;
	}): {
		source: CanvasImageSource;
		sourceWidth: number;
		sourceHeight: number;
	} {
		let currentSource: CanvasImageSource = source;
		let currentWidth = sourceWidth;
		let currentHeight = sourceHeight;

		if (renderer.quality === "preview") {
			const longEdge = Math.max(sourceWidth, sourceHeight);
			if (longEdge > renderer.previewMaxEdge) {
				const scale = renderer.previewMaxEdge / longEdge;
				currentWidth = Math.max(1, Math.round(sourceWidth * scale));
				currentHeight = Math.max(1, Math.round(sourceHeight * scale));
				this.previewSourceTarget = ensureChromaTarget({
					existing: this.previewSourceTarget,
					width: currentWidth,
					height: currentHeight,
				});
				const previewCtx = this.previewSourceTarget.getContext("2d") as
					| CanvasRenderingContext2D
					| OffscreenCanvasRenderingContext2D
					| null;
				if (previewCtx) {
					previewCtx.drawImage(source, 0, 0, currentWidth, currentHeight);
					currentSource = this.previewSourceTarget;
				} else {
					currentWidth = sourceWidth;
					currentHeight = sourceHeight;
				}
			}
		}

		const effectScale = renderer.quality === "preview" ? 0.5 : 1;
		const effectWidth = Math.max(1, Math.round(currentWidth * effectScale));
		const effectHeight = Math.max(1, Math.round(currentHeight * effectScale));

		if (this.params.chromaKey) {
			this.chromaTarget = ensureChromaTarget({
				existing: this.chromaTarget,
				width: effectWidth,
				height: effectHeight,
			});
			applyChromaKey({
				source: currentSource,
				sourceWidth: effectWidth,
				sourceHeight: effectHeight,
				config: this.params.chromaKey,
				target: this.chromaTarget,
			});
			currentSource = this.chromaTarget;
			currentWidth = effectWidth;
			currentHeight = effectHeight;
		}

		if (
			this.params.videoEffect &&
			this.params.videoEffect.effect !== "none" &&
			this.params.videoEffect.intensity > 0
		) {
			this.vfxTarget = ensureChromaTarget({
				existing: this.vfxTarget,
				width: effectWidth,
				height: effectHeight,
			});
			applyVideoEffect({
				source: currentSource,
				sourceWidth: effectWidth,
				sourceHeight: effectHeight,
				config: this.params.videoEffect,
				target: this.vfxTarget,
			});
			currentSource = this.vfxTarget;
			currentWidth = effectWidth;
			currentHeight = effectHeight;
		}

		if (this.params.shapeMask) {
			this.shapeMaskTarget = ensureChromaTarget({
				existing: this.shapeMaskTarget,
				width: currentWidth,
				height: currentHeight,
			});
			applyShapeMask({
				source: currentSource,
				sourceWidth: currentWidth,
				sourceHeight: currentHeight,
				config: this.params.shapeMask,
				target: this.shapeMaskTarget,
			});
			currentSource = this.shapeMaskTarget;
		}

		return {
			source: currentSource,
			sourceWidth: currentWidth,
			sourceHeight: currentHeight,
		};
	}

	protected getLocalTime(time: number): number {
		const rate = this.params.playbackRate ?? 1;
		const elapsed = time - this.params.timeOffset;
		if (this.params.reversed) {
			return this.params.trimStart + rate * (this.params.duration - elapsed);
		}
		return this.params.trimStart + elapsed * rate;
	}

	protected isInRange(time: number): boolean {
		const localTime = this.getLocalTime(time);
		const rate = this.params.playbackRate ?? 1;
		return (
			localTime >= this.params.trimStart - VISUAL_EPSILON &&
			localTime < this.params.trimStart + this.params.duration * rate
		);
	}

	protected renderVisual({
		renderer,
		source,
		sourceWidth,
		sourceHeight,
		time,
	}: {
		renderer: CanvasRenderer;
		source: CanvasImageSource;
		sourceWidth: number;
		sourceHeight: number;
		time: number;
	}): void {
		renderer.context.save();

		if (this.params.isBackgroundCover) {
			const coverScale =
				Math.max(
					renderer.width / sourceWidth,
					renderer.height / sourceHeight,
				) * 1.15;
			const scaledWidth = sourceWidth * coverScale;
			const scaledHeight = sourceHeight * coverScale;
			const x = (renderer.width - scaledWidth) / 2;
			const y = (renderer.height - scaledHeight) / 2;

			renderer.context.globalAlpha = 1;

			// Always paint an opaque cover frame first. A filtered draw can leave
			// transparent pixels around the enlarged image (and some export canvas
			// implementations may fail to preserve that filtered pass), which H.264
			// turns into black bars. The blurred pass below still supplies the visible
			// background while this base pass guarantees that the frame is filled.
			renderer.context.filter = "none";
			renderer.context.drawImage(source, x, y, scaledWidth, scaledHeight);

			if (this.params.blurRadius && this.params.blurRadius > 0) {
				renderer.context.filter = `blur(${this.params.blurRadius.toFixed(1)}px)`;
				renderer.context.drawImage(source, x, y, scaledWidth, scaledHeight);
			}
			renderer.context.restore();
			return;
		}

		if (this.params.blendMode) {
			renderer.context.globalCompositeOperation =
				this.params.blendMode as GlobalCompositeOperation;
		}

		if (this.params.filter && this.params.filter !== "none") {
			renderer.context.filter = this.params.filter;
		}

		// Resolve the effective transform/opacity for this frame. When the
		// element has keyframes, sample them at the element-local time;
		// otherwise use the static base values. `time` here is absolute
		// (timeline time), and keyframes are stored relative to `timeOffset`.
		const localTime = time - this.params.timeOffset;
		const { transform, opacity } = resolveAnimatedProperties({
			keyframes: this.params.keyframes,
			time: localTime,
			baseTransform: this.params.transform,
			baseOpacity: this.params.opacity,
		});
		const containScale = Math.min(
			renderer.width / sourceWidth,
			renderer.height / sourceHeight,
		);
		const scaledWidth = sourceWidth * containScale * transform.scale;
		const scaledHeight = sourceHeight * containScale * transform.scale;
		const x = renderer.width / 2 + transform.position.x - scaledWidth / 2;
		const y = renderer.height / 2 + transform.position.y - scaledHeight / 2;

		renderer.context.globalAlpha = opacity;

		const centerX = x + scaledWidth / 2;
		const centerY = y + scaledHeight / 2;

		const needsFlip = transform.flipX || transform.flipY;
		const needsRotate = transform.rotate !== 0;

		if (needsRotate || needsFlip) {
			renderer.context.translate(centerX, centerY);
			if (needsRotate) {
				renderer.context.rotate((transform.rotate * Math.PI) / 180);
			}
			if (needsFlip) {
				renderer.context.scale(
					transform.flipX ? -1 : 1,
					transform.flipY ? -1 : 1,
				);
			}
			renderer.context.translate(-centerX, -centerY);
		}

		renderer.context.drawImage(source, x, y, scaledWidth, scaledHeight);

		// Vignette: radial gradient darkened at the edges, clipped to the clip rect.
		// Drawn before restore() so it composites inside the same transform/alpha scope.
		const vignette = this.params.vignette ?? 0;
		if (vignette > 0) {
			const intensity = Math.min(Math.max(vignette / 100, 0), 1);
			const inner = Math.min(scaledWidth, scaledHeight) * 0.32;
			const outer = Math.max(scaledWidth, scaledHeight) * 0.72;
			const grad = renderer.context.createRadialGradient(
				centerX,
				centerY,
				inner,
				centerX,
				centerY,
				outer,
			);
			grad.addColorStop(0, "rgba(0,0,0,0)");
			grad.addColorStop(1, `rgba(0,0,0,${(intensity * 0.85).toFixed(3)})`);
			renderer.context.save();
			renderer.context.beginPath();
			renderer.context.rect(x, y, scaledWidth, scaledHeight);
			renderer.context.clip();
			renderer.context.fillStyle = grad;
			renderer.context.fillRect(x, y, scaledWidth, scaledHeight);
			renderer.context.restore();
		}

		renderer.context.restore();
	}
}
