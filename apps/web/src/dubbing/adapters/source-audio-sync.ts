import type { EditorCore } from "@/core";
import type { DubbingSettings } from "../types";
import { applyNarrationMixSettings } from "./narration-insert";
import {
	applyVoiceReductionToSourceClips,
	createDuckedSourceAudio,
	createMusicStemAudio,
	hasSourceAudioClips,
	restoreRawSourceClips,
} from "./source-audio";

export async function syncNarrationSourceAudio({
	editor,
	settings,
}: {
	editor: EditorCore;
	settings: Pick<
		DubbingSettings,
		| "voiceReductionEnabled"
		| "stemMusicVolume"
		| "stemVocalVolume"
		| "autoDucking"
		| "sourceVolume"
		| "ttsVolume"
	>;
}): Promise<{ extracted: number; monoWarned: boolean }> {
	const alreadyHasClips = hasSourceAudioClips({
		tracks: editor.timeline.getTracks(),
	});

	if (settings.voiceReductionEnabled) {
		if (alreadyHasClips) {
			await applyVoiceReductionToSourceClips({
				editor,
				musicGain: settings.stemMusicVolume ?? 1,
				vocalGain: settings.stemVocalVolume ?? 0,
			});
		} else {
			await createMusicStemAudio({
				editor,
				musicGain: settings.stemMusicVolume ?? 1,
				vocalGain: settings.stemVocalVolume ?? 0,
			});
		}
	} else if (settings.autoDucking) {
		await createDuckedSourceAudio({
			editor,
			settings: {
				...settings,
				autoDucking: true,
			} as DubbingSettings,
		});
	} else {
		await restoreRawSourceClips({ editor });
	}

	applyNarrationMixSettings({
		editor,
		sourceVolumeDb: settings.sourceVolume,
		ttsVolumeDb: settings.ttsVolume,
	});
	editor.audio.refreshScheduledClips();
	return { extracted: 0, monoWarned: false };
}

export function refreshNarrationDuck({
	editor,
	settings,
}: {
	editor: EditorCore;
	settings: Pick<DubbingSettings, "sourceVolume" | "ttsVolume">;
}): void {
	applyNarrationMixSettings({
		editor,
		sourceVolumeDb: settings.sourceVolume,
		ttsVolumeDb: settings.ttsVolume,
	});
	editor.audio.refreshScheduledClips();
}
