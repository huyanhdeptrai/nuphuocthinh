/** Keeps generated preview audio stable while the voice library remains open. */
export class VoicePreviewCache {
	private readonly previews = new Map<string, Blob>();
	private readonly pending = new Map<string, Promise<Blob>>();

	async getOrCreate({
		key,
		load,
	}: {
		key: string;
		load: () => Promise<Blob>;
	}): Promise<Blob> {
		const cached = this.previews.get(key);
		if (cached) return cached;

		const existing = this.pending.get(key);
		if (existing) return existing;

		const request = load()
			.then((preview) => {
				this.previews.set(key, preview);
				return preview;
			})
			.finally(() => this.pending.delete(key));
		this.pending.set(key, request);
		return request;
	}
}

