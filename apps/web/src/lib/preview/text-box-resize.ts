import type { Transform } from "@/types/timeline";

export function resizeTextBoxFromSide({
	handle,
	deltaX,
	initialBoxWidth,
	pixelsPerBoxUnit,
	initialTransform,
}: {
	handle: "left" | "right";
	deltaX: number;
	initialBoxWidth: number;
	pixelsPerBoxUnit: number;
	initialTransform: Transform;
}): { boxWidth: number; transform: Transform } {
	const safePixelsPerUnit = Math.max(0.001, pixelsPerBoxUnit);
	const initialWidthPx = initialBoxWidth * safePixelsPerUnit;
	const directedDelta = handle === "right" ? deltaX : -deltaX;
	const newWidthPx = Math.max(20, initialWidthPx + directedDelta);

	return {
		boxWidth: newWidthPx / safePixelsPerUnit,
		// Text boxes resize symmetrically around their center. Moving an edge must
		// not translate the subtitle itself.
		transform: {
			...initialTransform,
			position: { ...initialTransform.position },
		},
	};
}
