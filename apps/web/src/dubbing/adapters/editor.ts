import type { EditorCore } from "@/core";
import type { TScene, TimelineTrack } from "@/types/timeline";
import type { TProject } from "@/types/project";

export function getActiveSceneOrNull({
	editor,
}: {
	editor: EditorCore;
}): TScene | null {
	try {
		return editor.scenes.getActiveScene();
	} catch {
		return null;
	}
}

export function getActiveProjectOrNull({
	editor,
}: {
	editor: EditorCore;
}): TProject | null {
	return editor.project.getActiveOrNull();
}

export function getActiveTracks({
	editor,
}: {
	editor: EditorCore;
}): TimelineTrack[] {
	return getActiveSceneOrNull({ editor })?.tracks ?? [];
}
