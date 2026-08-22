import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type { TextElement } from "@/types/timeline";
import { getTextScaleFactor } from "@/constants/text-constants";
import { resolveAnimatedProperties } from "@/lib/timeline/keyframe-utils";
import { resolveTextAnimations } from "@/lib/timeline/text-animation-utils";

export type RenderContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

function scaleFontSize({
	fontSize,
	canvasWidth,
	canvasHeight,
}: {
	fontSize: number;
	canvasWidth: number;
	canvasHeight: number;
}): number {
	return fontSize * getTextScaleFactor({ canvasWidth, canvasHeight });
}

export function scaleBoxWidth({
	boxWidth,
	canvasWidth,
	canvasHeight,
}: {
	boxWidth: number;
	canvasWidth: number;
	canvasHeight: number;
}): number {
	return boxWidth * getTextScaleFactor({ canvasWidth, canvasHeight });
}

export function getMultilineStartY({
	lineCount,
	lineHeight,
	textBaseline,
}: {
	lineCount: number;
	lineHeight: number;
	textBaseline: CanvasTextBaseline;
}): number {
	if (textBaseline === "bottom") {
		// Keep the last line's baseline at the element origin. The selection
		// bounds use the full line box above that origin, so starting at
		// -totalHeight would shift every subtitle line one line too high.
		return -(Math.max(1, lineCount) - 1) * lineHeight;
	}
	return -(Math.max(1, lineCount) * lineHeight) / 2 + lineHeight / 2;
}

export function wrapText({
	context,
	text,
	maxWidth,
}: {
	context: RenderContext;
	text: string;
	maxWidth: number;
}): string[] {
	if (maxWidth <= 0) return text.split("\n");

	const lines: string[] = [];
	const paragraphs = text.split("\n");

	for (const paragraph of paragraphs) {
		if (paragraph === "") {
			lines.push("");
			continue;
		}

		// Split paragraph into tokens while preserving whitespace delimiters
		const tokens = paragraph.split(/(\s+)/).filter(Boolean);
		let currentLine = "";

		for (const token of tokens) {
			// If this token is whitespace and we're starting a new line, skip leading whitespace
			if (/^\s+$/.test(token) && currentLine === "") {
				continue;
			}

			const testLine = currentLine + token;
			const metrics = context.measureText(testLine);

			if (metrics.width > maxWidth && currentLine.trim() !== "") {
				lines.push(currentLine.trimEnd());

				if (/^\s+$/.test(token)) {
					currentLine = "";
				} else if (context.measureText(token).width > maxWidth) {
					// Fallback for an abnormally long single word exceeding maxWidth: break by character
					let charChunk = "";
					for (const char of Array.from(token)) {
						const testChar = charChunk + char;
						if (
							context.measureText(testChar).width > maxWidth &&
							charChunk !== ""
						) {
							lines.push(charChunk);
							charChunk = char;
						} else {
							charChunk = testChar;
						}
					}
					currentLine = charChunk;
				} else {
					currentLine = token;
				}
			} else if (metrics.width > maxWidth && currentLine === "") {
				// Single token alone exceeds maxWidth: break by character
				let charChunk = "";
				for (const char of Array.from(token)) {
					const testChar = charChunk + char;
					if (
						context.measureText(testChar).width > maxWidth &&
						charChunk !== ""
					) {
						lines.push(charChunk);
						charChunk = char;
					} else {
						charChunk = testChar;
					}
				}
				currentLine = charChunk;
			} else {
				currentLine = testLine;
			}
		}

		if (currentLine.trim() !== "") {
			lines.push(currentLine.trimEnd());
		}
	}

	return lines.length > 0 ? lines : [""];
}

export type TextNodeParams = TextElement & {
	canvasCenter: { x: number; y: number };
	canvasWidth: number;
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export class TextNode extends BaseNode<TextNodeParams> {
	private wrapCacheKey = "";
	private wrapCacheLines: string[] = [];

	isInRange({ time }: { time: number }) {
		return (
			time >= this.params.startTime &&
			time < this.params.startTime + this.params.duration
		);
	}

	shouldRender(time: number): boolean {
		return this.isInRange({ time });
	}

	private getWrappedLines({
		context,
		text,
		maxWidth,
	}: {
		context: RenderContext;
		text: string;
		maxWidth: number;
	}): string[] {
		const key = `${text}\0${maxWidth}\0${context.font}`;
		if (key === this.wrapCacheKey) return this.wrapCacheLines;
		this.wrapCacheKey = key;
		this.wrapCacheLines = wrapText({ context, text, maxWidth });
		return this.wrapCacheLines;
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		if (!this.isInRange({ time })) {
			return;
		}

		renderer.context.save();

		// Resolve keyframe-animated transform/opacity for this frame. When the
		// element has keyframes, sample them at the element-local time.
		const localTime = time - this.params.startTime;
		const { transform, opacity } = resolveAnimatedProperties({
			keyframes: this.params.keyframes,
			time: localTime,
			baseTransform: this.params.transform,
			baseOpacity: this.params.opacity,
		});

		// Resolve per-frame text animation (typewriter, fade, slide, bounce, …).
		// Offset/scale/opacity compose with the keyframe values; visibleText may
		// be truncated (typewriter).
		const textAnim = resolveTextAnimations({
			animations: this.params.textAnimations,
			localTime,
			elementDuration: this.params.duration,
			fullText: this.params.content,
			baseScale: transform.scale,
		});
		const effectiveContent = textAnim.visibleText || this.params.content;

		const x = transform.position.x + this.params.canvasCenter.x;
		const y = transform.position.y + this.params.canvasCenter.y;

		renderer.context.translate(x + textAnim.offsetX, y + textAnim.offsetY);
		if (transform.rotate) {
			renderer.context.rotate((transform.rotate * Math.PI) / 180);
		}
		const effectiveScale = transform.scale * textAnim.scale;
		if (effectiveScale !== 1) {
			renderer.context.scale(effectiveScale, effectiveScale);
		}

		const fontWeight = this.params.fontWeight === "bold" ? "bold" : "normal";
		const fontStyle = this.params.fontStyle === "italic" ? "italic" : "normal";
		const textBaseline = this.params.textBaseline || "middle";
		const scaledFontSize = scaleFontSize({
			fontSize: this.params.fontSize,
			canvasWidth: this.params.canvasWidth,
			canvasHeight: this.params.canvasHeight,
		});
		const fontFamily = this.params.fontFamily.includes('"')
			? this.params.fontFamily
			: `"${this.params.fontFamily}"`;
		renderer.context.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
		renderer.context.textAlign = this.params.textAlign;
		renderer.context.textBaseline = textBaseline;
		renderer.context.fillStyle = this.params.color;

		const prevAlpha = renderer.context.globalAlpha;
		renderer.context.globalAlpha = opacity * textAnim.opacity;

		const boxWidth = this.params.boxWidth;
		const hasBoxWidth = boxWidth !== undefined && boxWidth > 0;
		const scaledBoxWidth = hasBoxWidth
			? scaleBoxWidth({
					boxWidth,
					canvasWidth: this.params.canvasWidth,
					canvasHeight: this.params.canvasHeight,
				})
			: 0;
		const hasNewlines = effectiveContent.includes("\n");

		if (hasBoxWidth || hasNewlines) {
			this.renderMultiline({
				context: renderer.context,
				scaledFontSize,
				scaledBoxWidth,
				textBaseline,
				contentOverride: effectiveContent,
			});
		} else {
			this.renderSingleLine({
				context: renderer.context,
				scaledFontSize,
				scaledBoxWidth,
				textBaseline,
				contentOverride: effectiveContent,
			});
		}

		renderer.context.globalAlpha = prevAlpha;
		renderer.context.restore();
	}

	private renderSingleLine({
		context,
		scaledFontSize,
		scaledBoxWidth = 0,
		textBaseline,
		contentOverride,
	}: {
		context: RenderContext;
		scaledFontSize: number;
		scaledBoxWidth?: number;
		textBaseline: CanvasTextBaseline;
		contentOverride?: string;
	}) {
		const content = contentOverride ?? this.params.content;
		if (this.params.backgroundColor && this.params.backgroundColor !== "transparent") {
			const metrics = context.measureText(content);
			const ascent = metrics.actualBoundingBoxAscent ?? scaledFontSize * 0.8;
			const descent =
				metrics.actualBoundingBoxDescent ?? scaledFontSize * 0.2;
			const textW = metrics.width;
			const textH = ascent + descent;
			const padX = this.params.backgroundPaddingX ?? 8;
			const padY = this.params.backgroundPaddingY ?? 4;
			const borderRadius = this.params.backgroundBorderRadius ?? 0;

			const ratio =
				typeof this.params.backgroundWidthRatio === "number"
					? Math.max(0, Math.min(100, this.params.backgroundWidthRatio)) / 100
					: this.params.backgroundWidthMode === "full"
						? 1
						: 0;

			const targetFullWidth = scaledBoxWidth > 0 ? scaledBoxWidth : textW;
			const effectiveBgWidth =
				targetFullWidth > textW
					? textW + (targetFullWidth - textW) * ratio
					: textW;

			const prevAlpha = context.globalAlpha;
			const bgOpacity = this.params.backgroundOpacity ?? 1;
			context.globalAlpha = prevAlpha * bgOpacity;

			context.fillStyle = this.params.backgroundColor;
			let bgLeft = -effectiveBgWidth / 2;
			if (context.textAlign === "left") bgLeft = -effectiveBgWidth / 2;
			if (context.textAlign === "right") bgLeft = -effectiveBgWidth / 2;

			const backgroundTop =
				textBaseline === "bottom" ? -textH - padY : -textH / 2 - padY;
			const bgW = effectiveBgWidth + padX * 2;
			const bgH = textH + padY * 2;
			const bgX = bgLeft - padX;

			if (borderRadius > 0 && context.roundRect) {
				context.beginPath();
				context.roundRect(bgX, backgroundTop, bgW, bgH, borderRadius);
				context.fill();
			} else {
				context.fillRect(bgX, backgroundTop, bgW, bgH);
			}

			context.globalAlpha = prevAlpha;
			context.fillStyle = this.params.color;
		}

		if (this.params.shadow) {
			context.shadowColor = this.params.shadow.color;
			context.shadowOffsetX = this.params.shadow.offsetX;
			context.shadowOffsetY = this.params.shadow.offsetY;
			context.shadowBlur = this.params.shadow.blur;
		}

		if (this.params.stroke && this.params.stroke.width > 0) {
			context.strokeStyle = this.params.stroke.color;
			context.lineWidth = this.params.stroke.width * 2;
			context.lineJoin = "round";
			context.strokeText(content, 0, 0);
		}

		if (this.params.shadow) {
			context.shadowColor = "transparent";
			context.shadowBlur = 0;
			context.shadowOffsetX = 0;
			context.shadowOffsetY = 0;
		}

		context.fillText(content, 0, 0);
	}

	private renderMultiline({
		context,
		scaledFontSize,
		scaledBoxWidth,
		textBaseline,
		contentOverride,
	}: {
		context: RenderContext;
		scaledFontSize: number;
		scaledBoxWidth: number;
		textBaseline: CanvasTextBaseline;
		contentOverride?: string;
	}) {
		const content = contentOverride ?? this.params.content;
		const lines =
			scaledBoxWidth > 0
				? this.getWrappedLines({
						context,
						text: content,
						maxWidth: scaledBoxWidth,
					})
				: content.split("\n");

		const lineHeight = scaledFontSize * 1.3;
		const totalHeight = lines.length * lineHeight;

		const startY = getMultilineStartY({
			lineCount: lines.length,
			lineHeight,
			textBaseline,
		});

		const actualTextWidth = Math.max(
			...lines.map((line) => context.measureText(line).width),
			0,
		);

		const ratio =
			typeof this.params.backgroundWidthRatio === "number"
				? Math.max(0, Math.min(100, this.params.backgroundWidthRatio)) / 100
				: this.params.backgroundWidthMode === "full"
					? 1
					: 0;

		const targetFullWidth = scaledBoxWidth > 0 ? scaledBoxWidth : actualTextWidth;
		const effectiveBgWidth =
			targetFullWidth > actualTextWidth
				? actualTextWidth + (targetFullWidth - actualTextWidth) * ratio
				: actualTextWidth;

		let textX = 0;
		if (context.textAlign === "left") {
			textX = -effectiveBgWidth / 2;
		} else if (context.textAlign === "right") {
			textX = effectiveBgWidth / 2;
		}

		if (this.params.backgroundColor && this.params.backgroundColor !== "transparent") {
			const padX = this.params.backgroundPaddingX ?? 8;
			const padY = this.params.backgroundPaddingY ?? 4;
			const borderRadius = this.params.backgroundBorderRadius ?? 0;
			const firstMetrics = context.measureText(lines[0] ?? "");
			const lastMetrics = context.measureText(lines[lines.length - 1] ?? "");
			const ascent = Math.max(
				firstMetrics.actualBoundingBoxAscent ?? scaledFontSize * 0.8,
				scaledFontSize * 0.8,
			);
			const descent = Math.max(
				lastMetrics.actualBoundingBoxDescent ?? scaledFontSize * 0.2,
				scaledFontSize * 0.2,
			);

			const prevAlpha = context.globalAlpha;
			const bgOpacity = this.params.backgroundOpacity ?? 1;
			context.globalAlpha = prevAlpha * bgOpacity;

			context.fillStyle = this.params.backgroundColor;
			const bgX = -effectiveBgWidth / 2 - padX;
			const bgY = startY - ascent - padY;
			const bgW = effectiveBgWidth + padX * 2;
			const bgH =
				(lines.length - 1) * lineHeight + ascent + descent + padY * 2;

			if (borderRadius > 0 && context.roundRect) {
				context.beginPath();
				context.roundRect(bgX, bgY, bgW, bgH, borderRadius);
				context.fill();
			} else {
				context.fillRect(bgX, bgY, bgW, bgH);
			}

			context.globalAlpha = prevAlpha;
			context.fillStyle = this.params.color;
		}

		for (let i = 0; i < lines.length; i++) {
			const lineY = startY + i * lineHeight;

			if (this.params.shadow) {
				context.shadowColor = this.params.shadow.color;
				context.shadowOffsetX = this.params.shadow.offsetX;
				context.shadowOffsetY = this.params.shadow.offsetY;
				context.shadowBlur = this.params.shadow.blur;
			}

			if (this.params.stroke && this.params.stroke.width > 0) {
				context.strokeStyle = this.params.stroke.color;
				context.lineWidth = this.params.stroke.width * 2;
				context.lineJoin = "round";
				context.strokeText(lines[i], textX, lineY);
			}

			if (this.params.shadow) {
				context.shadowColor = "transparent";
				context.shadowBlur = 0;
				context.shadowOffsetX = 0;
				context.shadowOffsetY = 0;
			}

			context.fillText(lines[i], textX, lineY);
		}
	}
}
