const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadCachedImage(url: string): Promise<HTMLImageElement> {
	const existing = imageCache.get(url);
	if (existing) return existing;

	const promise = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () => {
			imageCache.delete(url);
			reject(new Error("Image load failed"));
		};
		image.src = url;
	});

	imageCache.set(url, promise);
	return promise;
}

export function clearCachedImage(url: string): void {
	imageCache.delete(url);
}
