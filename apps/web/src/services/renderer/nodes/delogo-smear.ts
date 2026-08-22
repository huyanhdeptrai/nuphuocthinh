/**
 * Horizontal delogo smear (ezmaxsub Remove Logo / Remove Subtitle).
 *
 * ezmaxsub's delogo doesn't soften the region with an even Gaussian blur — it
 * drags the underlying pixels horizontally into vertical colour streaks, which
 * erases the logo/subtitle while keeping the surrounding colour. This is a
 * per-row running box-average (O(width) per row, separable), implemented as a
 * pure function over raw RGBA so it's testable without a canvas.
 */

export type RGBA = Uint8ClampedArray;

/**
 * Applies a horizontal box blur of the given radius to `src` and returns the
 * result as a new RGBA buffer. `width * height * 4` must equal src.length.
 */
export function smearHorizontalRGBA({
	src,
	width,
	height,
	radius,
}: {
	src: RGBA;
	width: number;
	height: number;
	radius: number;
}): RGBA {
	const out = new Uint8ClampedArray(src.length);
	const r = Math.max(1, Math.round(radius));
	const window = r * 2 + 1;

	for (let y = 0; y < height; y++) {
		const rowBase = y * width;
		let ra = 0;
		let ga = 0;
		let ba = 0;
		let aa = 0;

		// Initial window for x = 0 (clamp out-of-bounds to the edges).
		for (let x = -r; x <= r; x++) {
			const xx = x < 0 ? 0 : x >= width ? width - 1 : x;
			const i = (rowBase + xx) * 4;
			ra += src[i];
			ga += src[i + 1];
			ba += src[i + 2];
			aa += src[i + 3];
		}

		for (let x = 0; x < width; x++) {
			const di = (rowBase + x) * 4;
			out[di] = ra / window;
			out[di + 1] = ga / window;
			out[di + 2] = ba / window;
			out[di + 3] = aa / window;

			// Slide the window right by one pixel.
			const addX = x + r + 1 < width ? x + r + 1 : width - 1;
			const remX = x - r >= 0 ? x - r : 0;
			const ai = (rowBase + addX) * 4;
			const ri = (rowBase + remX) * 4;
			ra += src[ai] - src[ri];
			ga += src[ai + 1] - src[ri + 1];
			ba += src[ai + 2] - src[ri + 2];
			aa += src[ai + 3] - src[ri + 3];
		}
	}

	return out;
}
