import type { TScene } from "./timeline";
import type { AgentMessage } from "@/lib/ai/agent/types";

export type TBackground =
	| {
			type: "color";
			color: string;
	  }
	| {
			type: "blur";
			blurIntensity: number;
	  }
	| {
			type: "gradient";
			/** CSS gradient string, e.g. "linear-gradient(135deg, #ff0000, #0000ff)". */
			css: string;
			/** Angle in degrees for linear gradients (0-360). */
			angle: number;
			/** Stop colors (hex without #). */
			stops: [string, string];
	  };

export interface TCanvasSize {
	width: number;
	height: number;
}

/** A burned-in subtitle event detected directly from the source video. */
export interface OriginalSubtitleCue {
	id: string;
	mediaId: string;
	videoElementId: string;
	startTime: number;
	endTime: number;
	/** Normalized bounds on the editor canvas at scan time. */
	bounds: { x: number; y: number; width: number; height: number };
	confidence: number;
	roiId?: string;
}

export interface TProjectMetadata {
	id: string;
	name: string;
	thumbnail?: string;
	duration: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface TProjectSettings {
	fps: number;
	canvasSize: TCanvasSize;
	originalCanvasSize?: TCanvasSize | null;
	background: TBackground;
	/** Detector-only scan results for subtitles burned into the source video. */
	originalSubtitleCues?: OriginalSubtitleCue[];
}

export interface TTimelineViewState {
	zoomLevel: number;
	scrollLeft: number;
	playheadTime: number;
}

export type TEditorLayoutMode = "landscape" | "vertical";

export interface TProject {
	metadata: TProjectMetadata;
	scenes: TScene[];
	currentSceneId: string;
	settings: TProjectSettings;
	version: number;
	timelineViewState?: TTimelineViewState;
	layoutMode?: TEditorLayoutMode;
	agentMessages?: AgentMessage[];
}

export type TProjectSortKey = "createdAt" | "updatedAt" | "name" | "duration";
export type TSortOrder = "asc" | "desc";
export type TProjectSortOption = `${TProjectSortKey}-${TSortOrder}`;
