// Keep a public Editkub release as the fallback so packaged desktop builds work
// without a development-only .env.local file.
const DEFAULT_GPU_MANIFEST_URL =
	"https://github.com/Lexombien/editkub-gpu-runtime/releases/download/gpu-2.8.0-cu126/manifest.json";

export function gpuManifestUrl(
	env: Readonly<Record<string, string | undefined>> = process.env,
) {
	const configured =
		env.EDITKUB_GPU_MANIFEST_URL?.trim() ||
		env.LEMYLOI_DICHVIDEO_GPU_MANIFEST_URL?.trim();
	if (configured) return configured;
	const r2 = env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
	if (r2) return `${r2}/components/manifest.json`;
	return DEFAULT_GPU_MANIFEST_URL;
}
