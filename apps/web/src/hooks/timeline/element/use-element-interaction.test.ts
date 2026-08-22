import { describe, expect, test } from "bun:test";
import { getElementClickPlayheadTime } from "./use-element-interaction";

describe("getElementClickPlayheadTime", () => {
	test("seeks to the point clicked within an element instead of its start", () => {
		expect(
			getElementClickPlayheadTime({
				elementStartTime: 12,
				elementDuration: 20,
				clickOffsetTime: 7.5,
			}),
		).toBe(19.5);
	});

	test("does not seek outside the clicked element", () => {
		expect(
			getElementClickPlayheadTime({
				elementStartTime: 12,
				elementDuration: 20,
				clickOffsetTime: -1,
			}),
		).toBe(12);
		expect(
			getElementClickPlayheadTime({
				elementStartTime: 12,
				elementDuration: 20,
				clickOffsetTime: 24,
			}),
		).toBe(32);
	});
});
