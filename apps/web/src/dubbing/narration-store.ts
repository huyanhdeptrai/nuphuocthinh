import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TtsProvider } from "./types";

export type NarrationMode = "single" | "roles";
export type NarrationPerformance = "light" | "standard" | "maximum";

export interface NarrationVoiceSettings {
	provider: TtsProvider;
	voiceId: string;
	speed: number;
	pitch: number;
}

export interface NarrationCueResult {
	cueId: string;
	rawDuration: number;
	targetDuration: number;
	playbackRate: number;
	status: "matched" | "warning" | "error";
	message?: string;
}

interface NarrationState {
	mode: NarrationMode;
	autoMatchDuration: boolean;
	reviewAfterGeneration: boolean;
	performance: NarrationPerformance;
	globalSpeed: number;
	globalPitch: number;
	assignments: Record<string, NarrationVoiceSettings>;
	results: NarrationCueResult[];
	setMode: (mode: NarrationMode) => void;
	setAutoMatchDuration: (value: boolean) => void;
	setReviewAfterGeneration: (value: boolean) => void;
	setPerformance: (value: NarrationPerformance) => void;
	setGlobalSpeed: (value: number) => void;
	setGlobalPitch: (value: number) => void;
	setAssignment: (input: { speakerId: string; value: NarrationVoiceSettings }) => void;
	setSpeakerVoice: (input: { speakerId: string; assignment: NarrationVoiceSettings }) => void;
	setResults: (results: NarrationCueResult[]) => void;
}

export const useNarrationStore = create<NarrationState>()(
	persist(
		(set) => ({
			mode: "roles",
			// Fast creation is the safe default for a fresh desktop profile. Users can
			// opt into duration matching when exact cue timing matters.
			autoMatchDuration: false,
			reviewAfterGeneration: true,
			performance: "maximum",
			globalSpeed: 1,
			globalPitch: 0,
			assignments: {},
			results: [],
			setMode: (mode) => set({ mode }),
			setAutoMatchDuration: (autoMatchDuration) => set({ autoMatchDuration }),
			setReviewAfterGeneration: (reviewAfterGeneration) => set({ reviewAfterGeneration }),
			setPerformance: (performance) => set({ performance }),
			setGlobalSpeed: (globalSpeed) => set({ globalSpeed }),
			setGlobalPitch: (globalPitch) => set({ globalPitch }),
			setAssignment: ({ speakerId, value }) =>
				set((state) => ({ assignments: { ...state.assignments, [speakerId]: value } })),
			setSpeakerVoice: ({ speakerId, assignment }) =>
				set((state) => ({ assignments: { ...state.assignments, [speakerId]: assignment } })),
			setResults: (results) => set({ results }),
		}),
		{
			name: "narration-store",
			partialize: (state) => ({
				mode: state.mode,
				autoMatchDuration: state.autoMatchDuration,
				reviewAfterGeneration: state.reviewAfterGeneration,
				performance: state.performance,
				globalSpeed: state.globalSpeed,
				globalPitch: state.globalPitch,
				assignments: state.assignments,
			}),
		},
	),
);
