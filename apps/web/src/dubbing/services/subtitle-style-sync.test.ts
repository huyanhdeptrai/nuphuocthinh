import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { TextElement, TextTrack } from "@/types/timeline";
import { syncSubtitleStyles } from "./subtitle-style-sync";

function makeSubtitle({
	id,
	name,
	speakerId,
	scale,
	x,
	y,
	rotate = 0,
}: {
	id: string;
	name: string;
	speakerId: string;
	scale: number;
	x: number;
	y: number;
	rotate?: number;
}): TextElement {
	return {
		id,
		type: "text",
		name,
		content: id,
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 6,
		fontFamily: "Arial",
		color: "#111111",
		backgroundColor: "#e2fd53",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		boxWidth: 70,
		transform: {
			scale,
			position: { x, y },
			rotate,
		},
		opacity: 1,
		subtitleSpeaker: { id: speakerId, name: speakerId, color: "#00ff00" },
	};
}

function makeEditor(elements: TextElement[]) {
	const track: TextTrack = {
		id: "text-track",
		type: "text",
		name: "Subtitles",
		elements,
		hidden: false,
	};
	let capturedUpdates: Array<{
		trackId: string;
		elementId: string;
		updates: Partial<TextElement>;
	}> = [];
	const editor = {
		timeline: {
			getTracks: () => [track],
			updateElements: ({ updates }: { updates: typeof capturedUpdates }) => {
				capturedUpdates = updates;
			},
		},
	} as unknown as EditorCore;
	return { editor, getUpdates: () => capturedUpdates };
}

describe("subtitle style sync layout", () => {
	const source = makeSubtitle({
		id: "source",
		name: "[N1] Caption 1",
		speakerId: "N1",
		scale: 0.55,
		x: 12,
		y: 310,
	});
	const sameSpeakerTarget = makeSubtitle({
		id: "same-speaker",
		name: "[N1] Caption 2",
		speakerId: "N1",
		scale: 1.25,
		x: 420,
		y: 100,
		rotate: 7,
	});
	const otherSpeakerTarget = makeSubtitle({
		id: "other-speaker",
		name: "[N2] Caption 3",
		speakerId: "N2",
		scale: 1.1,
		x: -350,
		y: 80,
	});

	test("sync all copies the source scale and text-box center", () => {
		const harness = makeEditor([source, sameSpeakerTarget, otherSpeakerTarget]);
		syncSubtitleStyles({
			editor: harness.editor,
			sourceElement: source,
			scope: "all",
		});

		const target = harness
			.getUpdates()
			.find((update) => update.elementId === sameSpeakerTarget.id);
		expect(target?.updates.transform).toEqual({
			...sameSpeakerTarget.transform,
			scale: source.transform.scale,
			position: { ...source.transform.position },
		});
	});

	test("speaker sync copies layout only to matching speaker cues", () => {
		const harness = makeEditor([source, sameSpeakerTarget, otherSpeakerTarget]);
		syncSubtitleStyles({
			editor: harness.editor,
			sourceElement: source,
			scope: "speaker",
			targetSpeakerId: "N1",
		});

		const updates = harness.getUpdates();
		expect(updates.some((update) => update.elementId === otherSpeakerTarget.id)).toBe(
			false,
		);
		const target = updates.find(
			(update) => update.elementId === sameSpeakerTarget.id,
		);
		expect(target?.updates.transform).toEqual({
			...sameSpeakerTarget.transform,
			scale: source.transform.scale,
			position: { ...source.transform.position },
		});
	});
});
