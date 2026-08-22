export type TextVerticalBounds = {
	top: number;
	bottom: number;
	height: number;
};

export function getTextVerticalBounds({
	lineCount,
	lineHeight,
	ascent,
	descent,
	bottomAligned,
	backgroundPaddingY,
	strokePadding,
	shadowOffsetY = 0,
	shadowBlur = 0,
}: {
	lineCount: number;
	lineHeight: number;
	ascent: number;
	descent: number;
	bottomAligned: boolean;
	backgroundPaddingY: number;
	strokePadding: number;
	shadowOffsetY?: number;
	shadowBlur?: number;
}): TextVerticalBounds {
	const safeLineCount = Math.max(1, lineCount);
	const firstBaseline = bottomAligned
		? -(safeLineCount - 1) * lineHeight
		: -(safeLineCount * lineHeight) / 2 + lineHeight / 2;
	const lastBaseline = firstBaseline + (safeLineCount - 1) * lineHeight;

	let top = firstBaseline - ascent - backgroundPaddingY - strokePadding;
	let bottom = lastBaseline + descent + backgroundPaddingY + strokePadding;

	if (shadowBlur > 0 || shadowOffsetY !== 0) {
		const glyphTop = firstBaseline - ascent - strokePadding;
		const glyphBottom = lastBaseline + descent + strokePadding;
		top = Math.min(top, glyphTop + shadowOffsetY - shadowBlur);
		bottom = Math.max(bottom, glyphBottom + shadowOffsetY + shadowBlur);
	}

	return { top, bottom, height: bottom - top };
}
