import { resolveTextAnimations } from "@/lib/timeline/text-animation-utils";
import type { TextElement, Transform } from "@/types/timeline";

/**
 * Mirror the renderer's frame-specific text translation and scale so the
 * selection outline encloses what is actually visible at the playhead.
 */
export function resolveAnimatedTextSelectionState({
	element,
	resolvedTransform,
	localTime,
}: {
	element: TextElement;
	resolvedTransform: Transform;
	localTime: number;
}): TextElement {
	const animation = resolveTextAnimations({
		animations: element.textAnimations,
		localTime,
		elementDuration: element.duration,
		fullText: element.content,
		baseScale: resolvedTransform.scale,
	});

	return {
		...element,
		content: animation.visibleText || element.content,
		transform: {
			...resolvedTransform,
			position: {
				x: resolvedTransform.position.x + animation.offsetX,
				y: resolvedTransform.position.y + animation.offsetY,
			},
			scale: resolvedTransform.scale * animation.scale,
		},
	};
}
