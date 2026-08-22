import { afterEach, describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import { computeTextBounds } from "./selection-overlay";

const originalDocument = globalThis.document;

afterEach(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
});

describe("subtitle selection bounds", () => {
	test("measures font metrics with the renderer's bottom baseline", () => {
		const measureContext = {
			font: "",
			textBaseline: "alphabetic",
			measureText: (text: string) => ({
				width: text.length * 20,
				actualBoundingBoxAscent:
					measureContext.textBaseline === "bottom" ? 50 : 40,
				actualBoundingBoxDescent:
					measureContext.textBaseline === "bottom" ? 0 : 10,
			}),
		};
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				createElement: () => ({ getContext: () => measureContext }),
			},
		});

		const element = {
			id: "subtitle-1",
			type: "text",
			name: "Subtitle",
			content: "Để anh cho anh\nem xem nè,",
			startTime: 0,
			duration: 2,
			trimStart: 0,
			trimEnd: 0,
			// Design units: on a 1080x1920 canvas this scales to 48 px.
			fontSize: 4,
			fontFamily: "Arial",
			color: "#111111",
			backgroundColor: "#dfff35",
			backgroundPaddingY: 10,
			textAlign: "center",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			transform: {
				scale: 1,
				position: { x: 0, y: 100 },
				rotate: 0,
			},
			opacity: 1,
		} satisfies TextElement;

		const bounds = computeTextBounds({
			element,
			canvasWidth: 1080,
			canvasHeight: 1920,
			displayScale: 1,
		});

		expect(measureContext.textBaseline).toBe("bottom");
		expect(bounds.top).toBeCloseTo(937.6, 5);
		expect(bounds.height).toBeCloseTo(142, 5);
	});

	test("uses boxWidth for the editable frame even when text stays on one line", () => {
		const measureContext = {
			font: "",
			textBaseline: "alphabetic",
			measureText: () => ({
				width: 120,
				actualBoundingBoxAscent: 30,
				actualBoundingBoxDescent: 8,
			}),
		};
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				createElement: () => ({ getContext: () => measureContext }),
			},
		});

		const element = {
			id: "subtitle-width",
			type: "text",
			name: "Subtitle",
			content: "Một dòng",
			startTime: 0,
			duration: 2,
			trimStart: 0,
			trimEnd: 0,
			fontSize: 3,
			fontFamily: "Arial",
			color: "#111111",
			backgroundColor: "transparent",
			textAlign: "center",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			boxWidth: 42,
			transform: {
				scale: 0.5,
				position: { x: 0, y: 100 },
				rotate: 0,
			},
			opacity: 1,
		} satisfies TextElement;

		const narrow = computeTextBounds({
			element,
			canvasWidth: 1080,
			canvasHeight: 1920,
			displayScale: 1,
		});
		const wide = computeTextBounds({
			element: { ...element, boxWidth: 84 },
			canvasWidth: 1080,
			canvasHeight: 1920,
			displayScale: 1,
		});

		expect(narrow.width).toBe(252);
		expect(wide.width).toBe(504);
	});
});
