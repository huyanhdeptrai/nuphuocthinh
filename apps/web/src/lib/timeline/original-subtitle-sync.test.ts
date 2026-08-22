import { expect, test } from "bun:test";
import {
	getOriginalSubtitleVerticalPositionUpdates,
	getSubtitleVisualCenterOffset,
} from "./original-subtitle-sync";
import type { OriginalSubtitleCue } from "@/types/project";
import type { TextElement, TimelineTrack } from "@/types/timeline";

const subtitle: TextElement = {
	id: "subtitle-1", name: "Caption 1", type: "text", startTime: 1, duration: 2, trimStart: 0, trimEnd: 0,
	content: "Bản dịch dài hơn nhiều so với chữ gốc", fontSize: 48, fontFamily: "Arial",
	color: "#fff", backgroundColor: "transparent", textAlign: "center", fontWeight: "normal",
	fontStyle: "normal", textDecoration: "none", opacity: 1,
	transform: { position: { x: 123, y: 400 }, scale: 1.2, rotate: 0 }, boxWidth: 900,
};

test("original cue sync changes only the vertical center of a subtitle", () => {
	const tracks: TimelineTrack[] = [{ id: "text", name: "Subtitles", type: "text", hidden: false, elements: [subtitle] }];
	const cues: OriginalSubtitleCue[] = [{
		id: "original-1", mediaId: "video", videoElementId: "clip", startTime: 1.1, endTime: 2.8,
		bounds: { x: 0.35, y: 0.7, width: 0.3, height: 0.08 }, confidence: 0.9,
	}];
	const canvasWidth = 1920;
	const canvasHeight = 1080;
	const [update] = getOriginalSubtitleVerticalPositionUpdates({ tracks, originalSubtitleCues: cues, canvasWidth, canvasHeight });
	const visualCenterY = canvasHeight / 2 + (update?.updates.transform.position.y ?? 0) + getSubtitleVisualCenterOffset({ element: subtitle, canvasWidth, canvasHeight });
	expect(visualCenterY).toBeCloseTo((0.7 + 0.08 / 2) * canvasHeight);
	expect(update?.updates.transform.position.y).not.toBeCloseTo(259.2);
	expect(update?.updates.transform.position.x).toBe(123);
	expect(update?.updates.transform.scale).toBe(1.2);
	expect(subtitle.boxWidth).toBe(900);
});
