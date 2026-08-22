import { describe, expect, test } from "bun:test";
import { smearHorizontalRGBA } from "./delogo-smear";

describe("smearHorizontalRGBA (ezmaxsub delogo)", () => {
	test("smears a single bright pixel horizontally into streaks", () => {
		// 1x5 row: one white pixel in the middle on a black background.
		const width = 5;
		const height = 1;
		const src = new Uint8ClampedArray(width * height * 4);
		// pixel (0,2) = white
		const mid = 2;
		src[mid * 4] = 255;
		src[mid * 4 + 1] = 255;
		src[mid * 4 + 2] = 255;
		src[mid * 4 + 3] = 255;

		const out = smearHorizontalRGBA({ src, width, height, radius: 1 });

		// radius 1 => window 3, so neighbours of the white pixel must also lighten.
		expect(out[mid * 4]).toBeGreaterThan(0);
		expect(out[(mid - 1) * 4]).toBeGreaterThan(0);
		expect(out[(mid + 1) * 4]).toBeGreaterThan(0);
		// far pixels (outside the window) stay dark
		expect(out[0]).toBe(0);
		expect(out[(width - 1) * 4]).toBe(0);
	});

	test("preserves a flat colour exactly (no darkening)", () => {
		const width = 4;
		const height = 2;
		const src = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < src.length; i += 4) {
			src[i] = 128;
			src[i + 1] = 64;
			src[i + 2] = 200;
			src[i + 3] = 255;
		}

		const out = smearHorizontalRGBA({ src, width, height, radius: 2 });

		// Every pixel should be identical to the input (a constant signal is
		// invariant under box filtering). This catches the off-by-N edge bug
		// that darkens the first/last pixels.
		for (let i = 0; i < src.length; i++) {
			expect(Math.abs(out[i] - src[i])).toBeLessThanOrEqual(1);
		}
	});

	test("returns a copy, not a shared buffer", () => {
		const src = new Uint8ClampedArray(4);
		src[0] = 255;
		const out = smearHorizontalRGBA({ src, width: 1, height: 1, radius: 1 });
		expect(out).not.toBe(src);
		expect(out[0]).toBe(src[0]);
	});
});
