import { describe, expect, test } from "bun:test";
import type { TimelineTrack } from "@/types/timeline";
import { planCueTimelineTextUpdate } from "./timeline-caption-sync";

describe("planCueTimelineTextUpdate", () => {
	test("preserves explicit subtitle line breaks", () => {
		const tracks = [
			{
				id: "captions",
				type: "text",
				name: "Captions",
				hidden: false,
				elements: [
					{
						id: "caption-1",
						name: "Caption 1",
						type: "text",
						startTime: 0,
						content: "old",
					},
				],
			},
		] as unknown as TimelineTrack[];

		const update = planCueTimelineTextUpdate({
			tracks,
			cue: { id: "cue-1", startTime: 0, endTime: 1, text: "old" },
			cueIndex: 0,
			preferredTrackId: "captions",
			text: "dòng một\ndòng hai",
			cueStartTime: 0,
		});

		expect(update?.content).toBe("dòng một\ndòng hai");
	});

	test("returns null when preferredTrackId is null to prevent overwriting other tracks", () => {
		const tracks = [
			{
				id: "source-captions",
				type: "text",
				name: "Source Captions",
				hidden: false,
				elements: [
					{
						id: "caption-1",
						name: "Caption 1",
						type: "text",
						startTime: 0,
						content: "chinese text",
					},
				],
			},
		] as unknown as TimelineTrack[];

		const update = planCueTimelineTextUpdate({
			tracks,
			cue: { id: "cue-1", startTime: 0, endTime: 1, text: "chinese text" },
			cueIndex: 0,
			preferredTrackId: null,
			text: "vietnamese translation",
			cueStartTime: 0,
		});

		expect(update).toBeNull();
	});
});
