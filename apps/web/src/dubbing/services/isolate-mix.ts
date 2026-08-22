function clampGain({ gain }: { gain: number }): number {
	if (!Number.isFinite(gain)) return 0;
	return Math.min(1, Math.max(0, gain));
}

export function mixIsolatedStems({
	vocals,
	instrumental,
	musicGain,
	vocalGain,
}: {
	vocals: { left: Float32Array; right: Float32Array | null };
	instrumental: { left: Float32Array; right: Float32Array | null };
	musicGain: number;
	vocalGain: number;
}): { left: Float32Array; right: Float32Array | null } {
	const keepMusic = clampGain({ gain: musicGain });
	const keepVocals = clampGain({ gain: vocalGain });
	const length = Math.min(vocals.left.length, instrumental.left.length);
	const left = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		left[i] = instrumental.left[i] * keepMusic + vocals.left[i] * keepVocals;
	}

	const hasRight = Boolean(vocals.right || instrumental.right);
	if (!hasRight) {
		return { left, right: null };
	}

	const vocalsRight = vocals.right ?? vocals.left;
	const instrumentalRight = instrumental.right ?? instrumental.left;
	const right = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		right[i] =
			instrumentalRight[i] * keepMusic + vocalsRight[i] * keepVocals;
	}
	return { left, right };
}
