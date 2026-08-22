import type { EditorCore } from "@/core";
import type { AudioClipSource } from "@/lib/media/audio";
import { createAudioContext, collectAudioClips } from "@/lib/media/audio";
import { resolveDuckMix } from "@/dubbing/adapters/duck-mix";
import {
	DUCK_ATTACK_MS,
	DUCK_RELEASE_MS,
	gainAtTime,
	isDuckingCandidateRole,
	type DuckWindow,
} from "@/dubbing/services/duck-envelope";

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private clips: AudioClipSource[] = [];
	private decodedBuffers = new Map<string, AudioBuffer>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	private playbackSessionId = 0;
	private lastIsPlaying = false;
	private lastVolume = 1;
	private unsubscribers: Array<() => void> = [];
	private timelineChangeTimer: number | null = null;

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleTimelineChange),
		);
		if (typeof window !== "undefined") {
			window.addEventListener("playback-seek", this.handleSeek);
			window.addEventListener("playback-rate-change", this.handleRateChange);
		}
	}

	dispose(): void {
		this.stopPlayback();
		if (this.timelineChangeTimer !== null) {
			window.clearTimeout(this.timelineChangeTimer);
			this.timelineChangeTimer = null;
		}
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		if (typeof window !== "undefined") {
			window.removeEventListener("playback-seek", this.handleSeek);
			window.removeEventListener("playback-rate-change", this.handleRateChange);
		}
		this.decodedBuffers.clear();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	refreshScheduledClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;
		void this.startPlayback({
			time: this.editor.playback.getCurrentTime(),
		});
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime(),
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (event: Event): void => {
		const detail = (event as CustomEvent<{ time: number }>).detail;
		if (!detail) return;

		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: detail.time });
			return;
		}

		this.stopPlayback();
	};

	private handleRateChange = (): void => {
		if (!this.editor.playback.getIsPlaying()) return;
		void this.startPlayback({
			time: this.editor.playback.getCurrentTime(),
		});
	};

	private handleTimelineChange = (): void => {
		if (this.timelineChangeTimer !== null) {
			window.clearTimeout(this.timelineChangeTimer);
		}

		this.timelineChangeTimer = window.setTimeout(() => {
			this.timelineChangeTimer = null;
			this.decodedBuffers.clear();

			if (!this.editor.playback.getIsPlaying()) return;

			void this.startPlayback({
				time: this.editor.playback.getCurrentTime(),
			});
		}, 300);
	};

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		this.masterGain = this.audioContext.createGain();
		this.masterGain.gain.value = this.lastVolume;
		this.masterGain.connect(this.audioContext.destination);
		return this.audioContext;
	}

	private updateGain(): void {
		if (!this.masterGain) return;
		this.masterGain.gain.value = this.lastVolume;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		this.playbackSessionId++;
		const sessionId = this.playbackSessionId;

		const tracks = this.editor.timeline.getTracks();
		const mediaAssets = this.editor.media.getAssets();
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		this.clips = await collectAudioClips({ tracks, mediaAssets });
		if (!this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		await this.scheduleAllClips({ time, sessionId });
	}

	private async scheduleAllClips({
		time,
		sessionId,
	}: {
		time: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.audioContext;
		if (!audioContext) return;

		for (const clip of this.clips) {
			if (clip.muted) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= time) continue;
			if (sessionId !== this.playbackSessionId) return;

			try {
				const buffer = await this.getDecodedBuffer({ clip });
				if (!buffer) continue;
				if (sessionId !== this.playbackSessionId) return;
				if (!this.editor.playback.getIsPlaying()) return;

				this.scheduleClipNode({ clip, buffer, time });
			} catch (error) {
				console.warn("Failed to schedule audio clip:", clip.id, error);
			}
		}
	}

	private scheduleClipNode({
		clip,
		buffer,
		time,
	}: {
		clip: AudioClipSource;
		buffer: AudioBuffer;
		time: number;
	}): void {
		const audioContext = this.audioContext;
		if (!audioContext || !this.masterGain) return;

		const playbackSpeed =
			typeof this.editor.playback.getPlaybackRate === "function"
				? this.editor.playback.getPlaybackRate()
				: 1;
		const effectiveRate = clip.playbackRate * playbackSpeed;
		const elapsed = Math.max(0, time - clip.startTime);
		const sourceOffset = clip.trimStart + elapsed * clip.playbackRate;
		const remainingBufferSec = clip.duration - elapsed;

		if (remainingBufferSec <= 0) return;

		const timelineStart = Math.max(clip.startTime, time);
		const scheduleTime =
			this.playbackStartContextTime +
			(timelineStart - this.playbackStartTime) / playbackSpeed;

		const node = audioContext.createBufferSource();
		node.buffer = buffer;
		node.playbackRate.value = effectiveRate;

		const clipGain = audioContext.createGain();
		this.applyClipGainEnvelope({
			clipGain,
			clip,
			fromTime: timelineStart,
		});
		node.connect(clipGain);
		clipGain.connect(this.masterGain);

		if (scheduleTime >= audioContext.currentTime) {
			node.start(scheduleTime, sourceOffset, remainingBufferSec);
		} else {
			const lateContextSec = audioContext.currentTime - scheduleTime;
			const lateBufferSec = lateContextSec * effectiveRate;
			const adjustedOffset = sourceOffset + lateBufferSec;
			const adjustedBufferSec = remainingBufferSec - lateBufferSec;
			if (adjustedBufferSec > 0) {
				node.start(audioContext.currentTime, adjustedOffset, adjustedBufferSec);
			} else {
				return;
			}
		}

		this.queuedSources.add(node);
		node.addEventListener("ended", () => {
			node.disconnect();
			this.queuedSources.delete(node);
		});
	}

	private applyClipGainEnvelope({
		clipGain,
		clip,
		fromTime,
	}: {
		clipGain: GainNode;
		clip: AudioClipSource;
		fromTime: number;
	}): void {
		const audioContext = this.audioContext;
		if (!audioContext) return;

		const duck = resolveDuckMix({
			tracks: this.editor.timeline.getTracks(),
		});
		const shouldDuck = duck.enabled && isDuckingCandidateRole(clip.audioRole);
		if (!shouldDuck || duck.windows.length === 0) {
			clipGain.gain.value = clip.volume;
			return;
		}

		const clipEnd = clip.startTime + clip.duration;
		const points = collectDuckAutomationPoints({
			windows: duck.windows,
			fromTime,
			toTime: clipEnd,
			baseVolume: clip.volume,
			duckVolume: duck.duckVolume,
			attackMs: duck.attackMs ?? DUCK_ATTACK_MS,
			releaseMs: duck.releaseMs ?? DUCK_RELEASE_MS,
		});

		if (points.length === 0) {
			clipGain.gain.value = clip.volume;
			return;
		}

		const playbackSpeed =
			typeof this.editor.playback.getPlaybackRate === "function"
				? this.editor.playback.getPlaybackRate()
				: 1;
		const now = audioContext.currentTime;
		try {
			clipGain.gain.cancelScheduledValues(now);
		} catch {}

		let lastTime = Math.max(
			this.playbackStartContextTime +
				(points[0].t - this.playbackStartTime) / playbackSpeed,
			now,
		);

		try {
			clipGain.gain.setValueAtTime(points[0].value, lastTime);
		} catch {
			clipGain.gain.value = points[0].value;
		}

		for (let i = 1; i < points.length; i++) {
			const targetTime =
				this.playbackStartContextTime +
				(points[i].t - this.playbackStartTime) / playbackSpeed;
			if (targetTime <= lastTime + 0.001) continue;

			try {
				clipGain.gain.linearRampToValueAtTime(points[i].value, targetTime);
				lastTime = targetTime;
			} catch {
				try {
					clipGain.gain.setValueAtTime(points[i].value, targetTime);
					lastTime = targetTime;
				} catch {}
			}
		}
	}

	private async getDecodedBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const cached = this.decodedBuffers.get(clip.sourceKey);
		if (cached) return cached;

		const audioContext = this.audioContext;
		if (!audioContext) return null;

		try {
			const arrayBuffer = await clip.file.arrayBuffer();
			// .slice(0) avoids the detached-buffer error on repeated decodes
			const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
			this.decodedBuffers.set(clip.sourceKey, buffer);
			return buffer;
		} catch (error) {
			console.warn("Failed to decode audio:", clip.sourceKey, error);
			return null;
		}
	}

	private stopPlayback(): void {
		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {}
			source.disconnect();
		}
		this.queuedSources.clear();
	}
}

function collectDuckAutomationPoints({
	windows,
	fromTime,
	toTime,
	baseVolume,
	duckVolume,
	attackMs,
	releaseMs,
}: {
	windows: DuckWindow[];
	fromTime: number;
	toTime: number;
	baseVolume: number;
	duckVolume: number;
	attackMs: number;
	releaseMs: number;
}): Array<{ t: number; value: number }> {
	const attackSeconds = Math.max(0.01, attackMs / 1000);
	const releaseSeconds = Math.max(0.01, releaseMs / 1000);
	const times = new Set<number>([fromTime]);

	for (const window of windows) {
		const wStart = window.start;
		const wStartPost = window.start + attackSeconds;
		const wEnd = window.end;
		const wEndPost = window.end + releaseSeconds;

		if (wStart > fromTime && wStart < toTime) times.add(wStart);
		if (wStartPost > fromTime && wStartPost < toTime) times.add(wStartPost);
		if (wEnd > fromTime && wEnd < toTime) times.add(wEnd);
		if (wEndPost > fromTime && wEndPost < toTime) times.add(wEndPost);
	}

	return [...times]
		.sort((a, b) => a - b)
		.map((t) => ({
			t,
			value: gainAtTime({
				t,
				duckWindows: windows,
				baseVolume,
				duckVolume,
				attackMs,
				releaseMs,
			}),
		}));
}
