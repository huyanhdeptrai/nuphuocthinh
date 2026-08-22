import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack, VideoElement } from "@/types/timeline";
import { buildScene } from "./scene-builder";
import { ColorNode } from "./nodes/color-node";
import { VideoNode } from "./nodes/video-node";

const videoElement = {
	id: "video-element",
	type: "video",
	name: "Portrait clip",
	mediaId: "video-asset",
	startTime: 0,
	duration: 5,
	trimStart: 0,
	trimEnd: 5,
	transform: {
		position: { x: 0, y: 0 },
		scale: 1,
		rotate: 0,
		flipX: false,
		flipY: false,
	},
	opacity: 1,
} as VideoElement;

const mainTrack = {
	id: "main-track",
	type: "video",
	name: "Main",
	isMain: true,
	muted: false,
	hidden: false,
	elements: [videoElement],
} as TimelineTrack;

const mediaAsset = {
	id: "video-asset",
	type: "video",
	name: "portrait.mp4",
	file: new File([], "portrait.mp4", { type: "video/mp4" }),
	url: "blob:portrait-video",
} as MediaAsset;

describe("project video backgrounds", () => {
	test("places a solid or gradient background below timeline content", () => {
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: [],
			mediaAssets: [],
			duration: 5,
			background: {
				type: "gradient",
				css: "linear-gradient(90deg, #ff0000, #0000ff)",
				angle: 90,
				stops: ["FF0000", "0000FF"],
			},
		});

		expect(scene.children).toHaveLength(1);
		expect(scene.children[0]).toBeInstanceOf(ColorNode);
		expect((scene.children[0] as ColorNode).params.color).toContain("gradient");
	});

	test("duplicates only the main clip as a blurred cover layer", () => {
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: [mainTrack],
			mediaAssets: [mediaAsset],
			duration: 5,
			background: { type: "blur", blurIntensity: 36 },
		});

		expect(scene.children).toHaveLength(2);
		expect(scene.children[0]).toBeInstanceOf(VideoNode);
		expect(scene.children[1]).toBeInstanceOf(VideoNode);
		expect((scene.children[0] as VideoNode).params.isBackgroundCover).toBe(
			true,
		);
		expect((scene.children[0] as VideoNode).params.blurRadius).toBe(36);
		expect(
			(scene.children[1] as VideoNode).params.isBackgroundCover,
		).toBeUndefined();
	});

	test("uses the first visible video track when an imported project has no main flag", () => {
		const importedTrack = { ...mainTrack, isMain: false } as TimelineTrack;
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: [importedTrack],
			mediaAssets: [mediaAsset],
			duration: 5,
			background: { type: "blur", blurIntensity: 32 },
		});

		expect(scene.children).toHaveLength(2);
		expect((scene.children[0] as VideoNode).params.isBackgroundCover).toBe(
			true,
		);
	});
});
