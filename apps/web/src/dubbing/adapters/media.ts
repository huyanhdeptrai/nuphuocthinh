import type { MediaAsset } from "@/types/assets";
import type {
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";

export interface ElementBounds {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
}

export interface ElementWithBounds {
	trackId: string;
	elementId: string;
	element: TimelineElement;
	bounds: ElementBounds;
}

function isVisibleAtTime({
	element,
	currentTime,
}: {
	element: TimelineElement;
	currentTime: number;
}): boolean {
	return (
		currentTime >= element.startTime &&
		currentTime < element.startTime + element.duration
	);
}

export function getVisibleElementsWithBounds({
	tracks,
	currentTime,
	canvasSize,
	mediaAssets,
}: {
	tracks: TimelineTrack[];
	currentTime: number;
	canvasSize: { width: number; height: number };
	mediaAssets: MediaAsset[];
}): ElementWithBounds[] {
	const visible: ElementWithBounds[] = [];

	for (const track of tracks) {
		if (track.type !== "video") continue;
		for (const element of track.elements) {
			if (element.type !== "video" && element.type !== "image") continue;
			if (!isVisibleAtTime({ element, currentTime })) continue;

			const asset = mediaAssets.find(
				(candidate) => candidate.id === element.mediaId,
			);
			const sourceWidth = asset?.width || canvasSize.width;
			const sourceHeight = asset?.height || canvasSize.height;
			if (sourceWidth <= 0 || sourceHeight <= 0) continue;

			const containScale = Math.min(
				canvasSize.width / sourceWidth,
				canvasSize.height / sourceHeight,
			);
			const scale = element.transform.scale || 1;
			visible.push({
				trackId: track.id,
				elementId: element.id,
				element,
				bounds: {
					cx: canvasSize.width / 2 + (element.transform.position.x || 0),
					cy: canvasSize.height / 2 + (element.transform.position.y || 0),
					width: sourceWidth * containScale * scale,
					height: sourceHeight * containScale * scale,
					rotation: element.transform.rotate || 0,
				},
			});
		}
	}

	return visible;
}

export function getSourceTimeAtClipTime({
	clipTime,
	retime,
	playbackRate,
}: {
	clipTime: number;
	retime?: { rate?: number } | null;
	playbackRate?: number;
}): number {
	const rate = retime?.rate || playbackRate || 1;
	return clipTime / (rate || 1);
}

export function getVideoSourceTimeSeconds({
	element,
	currentTime,
}: {
	element: VideoElement;
	currentTime: number;
}): number {
	const clipTime = Math.max(0, currentTime - element.startTime);
	return (
		element.trimStart +
		getSourceTimeAtClipTime({
			clipTime,
			playbackRate: element.playbackRate,
		})
	);
}
