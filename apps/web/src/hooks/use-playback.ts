"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorCore } from "@/core";

export type PlaybackFlags = {
	isPlaying: boolean;
	isScrubbing: boolean;
	volume: number;
	playbackRate: number;
	muted: boolean;
};

function readFlags(editor: EditorCore): PlaybackFlags {
	return {
		isPlaying: editor.playback.getIsPlaying(),
		isScrubbing: editor.playback.getIsScrubbing(),
		volume: editor.playback.getVolume(),
		playbackRate:
			typeof editor.playback.getPlaybackRate === "function"
				? editor.playback.getPlaybackRate()
				: 1,
		muted: editor.playback.isMuted(),
	};
}

function flagsEqual(a: PlaybackFlags, b: PlaybackFlags): boolean {
	return (
		a.isPlaying === b.isPlaying &&
		a.isScrubbing === b.isScrubbing &&
		a.volume === b.volume &&
		a.playbackRate === b.playbackRate &&
		a.muted === b.muted
	);
}

export function usePlaybackFlags(): PlaybackFlags {
	const editor = useMemo(() => EditorCore.getInstance(), []);
	const [flags, setFlags] = useState(() => readFlags(editor));

	useEffect(() => {
		return editor.playback.subscribe(() => {
			const next = readFlags(editor);
			setFlags((prev) => (flagsEqual(prev, next) ? prev : next));
		});
	}, [editor]);

	return flags;
}

export function usePlaybackTime({
	throttleMs = 80,
	enabled = true,
}: {
	throttleMs?: number;
	enabled?: boolean;
} = {}): number {
	const editor = useMemo(() => EditorCore.getInstance(), []);
	const [time, setTime] = useState(() => editor.playback.getCurrentTime());
	const { isPlaying } = usePlaybackFlags();

	useEffect(() => {
		if (!enabled) return;

		const sync = () => {
			setTime(editor.playback.getCurrentTime());
		};

		sync();
		const unsubscribe = editor.playback.subscribe(sync);

		if (!isPlaying) {
			return unsubscribe;
		}

		let frame = 0;
		let lastEmit = 0;
		const tick = (now: number) => {
			if (now - lastEmit >= throttleMs) {
				lastEmit = now;
				sync();
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => {
			unsubscribe();
			cancelAnimationFrame(frame);
		};
	}, [editor, enabled, isPlaying, throttleMs]);

	return time;
}

export function useEditorInstance(): EditorCore {
	return useMemo(() => EditorCore.getInstance(), []);
}
