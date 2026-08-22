export const TICKS_PER_SECOND = 1;

export function mediaTimeFromSeconds({
	seconds,
}: {
	seconds: number;
}): number {
	return seconds;
}

export function subMediaTime({ a, b }: { a: number; b: number }): number {
	return a - b;
}
