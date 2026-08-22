import type { OCRRegion } from "../types";

export interface OcrSourceBounds {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
}

export interface NormalizedBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

function clamp({
	value,
	minimum = 0,
	maximum = 1,
}: {
	value: number;
	minimum?: number;
	maximum?: number;
}): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.min(maximum, Math.max(minimum, value));
}

export function isVideoOcrInput({
	assetType,
	blobType,
	fileName,
}: {
	assetType?: string;
	blobType?: string;
	fileName?: string;
}): boolean {
	return (
		assetType === "video" ||
		Boolean(blobType?.startsWith("video/")) ||
		/\.(mp4|mov|mkv|webm|avi)$/i.test(fileName || "")
	);
}

/** Server-safe, idempotent validation that preserves the user's exact crop. */
export function prepareVideoOcrRegions(regions: OCRRegion[]): OCRRegion[] {
	return regions
		.filter((region) => region.enabled)
		.map((region) => {
			const x = clamp({ value: region.x });
			const y = clamp({ value: region.y });
			const right = clamp({ value: region.x + region.width });
			const bottom = clamp({ value: region.y + region.height });
			return {
				...region,
				x,
				y,
				width: Math.max(0, right - x),
				height: Math.max(0, bottom - y),
			};
		})
		.filter((region) => region.width > 0 && region.height > 0);
}

/**
	* Convert rectangles drawn on the project canvas to rectangles in the source
	* video's coordinate system. This is the inverse of the renderer's contain +
	* transform calculation and therefore works for portrait video on a landscape
	* canvas, position/scale, flips, and rotation.
 */
export function mapCanvasOcrRegionsToSource({
	regions,
	canvasSize,
	sourceBounds,
}: {
	regions: OCRRegion[];
	canvasSize: { width: number; height: number };
	sourceBounds: OcrSourceBounds;
}): OCRRegion[] {
	if (
		canvasSize.width <= 0 ||
		canvasSize.height <= 0 ||
		Math.abs(sourceBounds.width) < 1 ||
		Math.abs(sourceBounds.height) < 1
	) {
		return [];
	}

	const angle = (-sourceBounds.rotation * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return prepareVideoOcrRegions(regions)
		.map((region) => {
			const left = region.x * canvasSize.width;
			const top = region.y * canvasSize.height;
			const right = (region.x + region.width) * canvasSize.width;
			const bottom = (region.y + region.height) * canvasSize.height;
			const points = [
				{ x: left, y: top },
				{ x: right, y: top },
				{ x: right, y: bottom },
				{ x: left, y: bottom },
			].map((point) => {
				const dx = point.x - sourceBounds.cx;
				const dy = point.y - sourceBounds.cy;
				const localX = dx * cos - dy * sin;
				const localY = dx * sin + dy * cos;
				return {
					x: localX / sourceBounds.width + 0.5,
					y: localY / sourceBounds.height + 0.5,
				};
			});

			const rawLeft = Math.min(...points.map((point) => point.x));
			const rawTop = Math.min(...points.map((point) => point.y));
			const rawRight = Math.max(...points.map((point) => point.x));
			const rawBottom = Math.max(...points.map((point) => point.y));
			const x = clamp({ value: rawLeft });
			const y = clamp({ value: rawTop });
			const mappedRight = clamp({ value: rawRight });
			const mappedBottom = clamp({ value: rawBottom });

			return {
				...region,
				x,
				y,
				width: Math.max(0, mappedRight - x),
				height: Math.max(0, mappedBottom - y),
			};
		})
		.filter((region) => region.width > 0 && region.height > 0);
}

/** Maps source-video normalized bounds forward onto the current canvas. */
export function mapSourceBoundsToCanvas({
	bounds,
	canvasSize,
	sourceBounds,
}: {
	bounds: NormalizedBounds;
	canvasSize: { width: number; height: number };
	sourceBounds: OcrSourceBounds;
}): NormalizedBounds | null {
	if (
		canvasSize.width <= 0 ||
		canvasSize.height <= 0 ||
		Math.abs(sourceBounds.width) < 1 ||
		Math.abs(sourceBounds.height) < 1
	) return null;

	const angle = (sourceBounds.rotation * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const right = bounds.x + bounds.width;
	const bottom = bounds.y + bounds.height;
	const points = [
		{ x: bounds.x, y: bounds.y },
		{ x: right, y: bounds.y },
		{ x: right, y: bottom },
		{ x: bounds.x, y: bottom },
	].map((point) => {
		const localX = (point.x - 0.5) * sourceBounds.width;
		const localY = (point.y - 0.5) * sourceBounds.height;
		return {
			x: sourceBounds.cx + localX * cos - localY * sin,
			y: sourceBounds.cy + localX * sin + localY * cos,
		};
	});
	const left = clamp({ value: Math.min(...points.map((point) => point.x)) / canvasSize.width });
	const top = clamp({ value: Math.min(...points.map((point) => point.y)) / canvasSize.height });
	const mappedRight = clamp({ value: Math.max(...points.map((point) => point.x)) / canvasSize.width });
	const mappedBottom = clamp({ value: Math.max(...points.map((point) => point.y)) / canvasSize.height });
	if (mappedRight <= left || mappedBottom <= top) return null;
	return { x: left, y: top, width: mappedRight - left, height: mappedBottom - top };
}
