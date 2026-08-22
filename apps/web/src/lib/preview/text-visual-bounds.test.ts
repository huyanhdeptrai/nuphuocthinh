import { describe, expect, test } from "bun:test";
import { getTextVerticalBounds } from "./text-visual-bounds";

describe("text visual bounds", () => {
	test("contains multiline subtitle background, stroke, and font metrics", () => {
		expect(
			getTextVerticalBounds({
				lineCount: 2,
				lineHeight: 20,
				ascent: 15,
				descent: 5,
				bottomAligned: true,
				backgroundPaddingY: 3,
				strokePadding: 2,
			}),
		).toEqual({ top: -40, bottom: 10, height: 50 });
	});

	test("expands bounds for a downward shadow", () => {
		const bounds = getTextVerticalBounds({
			lineCount: 1,
			lineHeight: 20,
			ascent: 15,
			descent: 5,
			bottomAligned: false,
			backgroundPaddingY: 0,
			strokePadding: 0,
			shadowOffsetY: 4,
			shadowBlur: 6,
		});
		expect(bounds.top).toBe(-17);
		expect(bounds.bottom).toBe(15);
	});
});
