export const PREVIEW_MAX_EDGE = 1280;

export function getPreviewRenderSize({
	nativeWidth,
	nativeHeight,
	displayWidth,
	displayHeight,
}: {
	nativeWidth: number;
	nativeHeight: number;
	displayWidth: number;
	displayHeight: number;
}): { width: number; height: number } {
	if (!nativeWidth || !nativeHeight) {
		return { width: 1, height: 1 };
	}

	const displayLong = Math.max(displayWidth, displayHeight, 1);
	const nativeLong = Math.max(nativeWidth, nativeHeight);
	const targetLong = Math.min(
		nativeLong,
		Math.max(displayLong, 320),
		PREVIEW_MAX_EDGE,
	);
	const scale = targetLong / nativeLong;

	return {
		width: Math.max(1, Math.round(nativeWidth * scale)),
		height: Math.max(1, Math.round(nativeHeight * scale)),
	};
}

export function bucketPreviewEdge(edge: number): number {
	if (edge <= 640) return 640;
	if (edge <= 960) return 960;
	return PREVIEW_MAX_EDGE;
}
