import { describe, expect, test } from "bun:test";
import { gpuManifestUrl } from "./gpu-manifest-url";

const DEFAULT_MANIFEST_URL =
	"https://github.com/Lexombien/editkub-gpu-runtime/releases/download/gpu-2.8.0-cu126/manifest.json";

describe("gpuManifestUrl", () => {
	test("uses the Editkub variable configured by the desktop app", () => {
		expect(
			gpuManifestUrl({
				EDITKUB_GPU_MANIFEST_URL: "https://example.com/editkub-manifest.json",
			}),
		).toBe("https://example.com/editkub-manifest.json");
	});

	test("keeps legacy configuration compatible", () => {
		expect(
			gpuManifestUrl({
				LEMYLOI_DICHVIDEO_GPU_MANIFEST_URL:
					"https://example.com/legacy-manifest.json",
			}),
		).toBe("https://example.com/legacy-manifest.json");
	});

	test("uses the public Editkub release when no override is configured", () => {
		expect(gpuManifestUrl({})).toBe(DEFAULT_MANIFEST_URL);
	});
});
