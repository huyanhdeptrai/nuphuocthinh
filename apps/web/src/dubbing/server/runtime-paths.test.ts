import { expect, test } from "bun:test";
import { componentRoot } from "./runtime-paths";

test("component paths reject traversal and stay beneath the component root", () => {
	const original = process.env.LEMYLOI_DICHVIDEO_COMPONENTS_ROOT;
	process.env.LEMYLOI_DICHVIDEO_COMPONENTS_ROOT = "C:\\Lemyloi-dichvideo\\components";
	expect(
		componentRoot({ developmentRoot: "C:\\workspace", componentId: "tts-supertonic" }),
	).toBe("C:\\Lemyloi-dichvideo\\components\\tts-supertonic");
	expect(() =>
		componentRoot({ developmentRoot: "C:\\workspace", componentId: "../escape" }),
	).toThrow("Invalid component id");
	if (original === undefined) delete process.env.LEMYLOI_DICHVIDEO_COMPONENTS_ROOT;
	else process.env.LEMYLOI_DICHVIDEO_COMPONENTS_ROOT = original;
});
