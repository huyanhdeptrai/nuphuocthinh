import type { TimelineTrack } from "@/types/timeline";
import { useDubbingStore } from "../dubbing-store";
import {
	type DuckWindow,
	DUCK_ATTACK_MS,
	DUCK_RELEASE_MS,
	collectNarrationDuckWindows,
	isDuckedSourceElement,
} from "../services/duck-envelope";

export interface ResolvedDuckMix {
	enabled: boolean;
	duckVolume: number;
	attackMs: number;
	releaseMs: number;
	windows: DuckWindow[];
}

export function resolveDuckMix({
	tracks,
}: {
	tracks: TimelineTrack[];
}): ResolvedDuckMix {
	const state = useDubbingStore.getState();
	const settings = state.settings;
	const hasDuckedSourceTrack = tracks.some((t) =>
		t.elements.some((el) => isDuckedSourceElement({ element: el })),
	);
	const enabled = Boolean(settings.autoDucking || hasDuckedSourceTrack);
	if (!enabled) {
		return {
			enabled: false,
			duckVolume: 1,
			attackMs: DUCK_ATTACK_MS,
			releaseMs: DUCK_RELEASE_MS,
			windows: [],
		};
	}
	return {
		enabled: true,
		duckVolume: settings.duckingVolume ?? 0.15,
		attackMs: settings.duckAttackMs ?? DUCK_ATTACK_MS,
		releaseMs: settings.duckReleaseMs ?? DUCK_RELEASE_MS,
		windows: collectNarrationDuckWindows({
			tracks,
			duckOverrides: state.duckOverrides,
		}),
	};
}
