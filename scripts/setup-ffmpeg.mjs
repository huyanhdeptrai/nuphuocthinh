import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegPackage = [
	path.join(root, "apps", "web", "node_modules", "@ffmpeg"),
	path.join(root, "node_modules", "@ffmpeg"),
].find((candidate) => fs.existsSync(candidate));
const destination = path.join(root, "apps", "web", "public", "ffmpeg");
const files = [
	["core/dist/esm/ffmpeg-core.js", "ffmpeg-core.js"],
	["core/dist/esm/ffmpeg-core.wasm", "ffmpeg-core.wasm"],
	["ffmpeg/dist/esm/worker.js", "ffmpeg-worker.js"],
	["ffmpeg/dist/esm/const.js", "const.js"],
	["ffmpeg/dist/esm/errors.js", "errors.js"],
];

if (!ffmpegPackage) {
	throw new Error("Could not find the @ffmpeg packages after installation.");
}

fs.mkdirSync(destination, { recursive: true });
for (const [sourceRelative, destinationName] of files) {
	const source = path.join(ffmpegPackage, sourceRelative);
	if (!fs.existsSync(source)) throw new Error(`Missing FFmpeg build asset: ${source}`);
	fs.copyFileSync(source, path.join(destination, destinationName));
}
