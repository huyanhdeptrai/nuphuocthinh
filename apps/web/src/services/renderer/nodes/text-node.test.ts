import { describe, expect, test } from "bun:test";
import { getMultilineStartY } from "./text-node";

describe("multiline text baseline", () => {
	test("keeps the last subtitle line at the element origin", () => {
		expect(
			getMultilineStartY({
				lineCount: 2,
				lineHeight: 20,
				textBaseline: "bottom",
			}),
		).toBe(-20);
	});

	test("keeps regular multiline text centered", () => {
		expect(
			getMultilineStartY({
				lineCount: 2,
				lineHeight: 20,
				textBaseline: "middle",
			}),
		).toBe(-10);
	});
});
