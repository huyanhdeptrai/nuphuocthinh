import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(root, "apps", "web");
const standaloneRoot = path.join(webRoot, ".next", "standalone");
const staticSource = path.join(webRoot, ".next", "static");
const publicSource = path.join(webRoot, "public");
const capcutPythonPackages = [
	"capcut_tts_api",
	"requests",
	"urllib3",
	"idna",
	"certifi",
	"charset_normalizer",
];
const appRoot = fs.existsSync(path.join(standaloneRoot, "apps", "web", "server.js"))
	? path.join(standaloneRoot, "apps", "web")
	: standaloneRoot;
const runtimeRoots = [...new Set([appRoot, standaloneRoot])];
const pythonSupport = [
	{ source: path.join(root, "vieneu_tts_worker.py"), destination: "vieneu_tts_worker.py" },
	{ source: path.join(root, "supertonic_tts_worker.py"), destination: "supertonic_tts_worker.py" },
	{ source: path.join(root, "omnivoice_tts_worker.py"), destination: "omnivoice_tts_worker.py" },
	{ source: path.join(root, "ocr_runner.py"), destination: "ocr_runner.py" },
	{
		source: path.join(root, "ocr_video_pipeline.py"),
		destination: "ocr_video_pipeline.py",
	},
	{
		source: path.join(root, "capcut_tts_runner.py"),
		destination: "capcut_tts_runner.py",
	},
	{
		source: path.join(root, ".local-services", "capcut-tts-api", "Voice.json"),
		destination: path.join("python", "Voice.json"),
	},
];

if (!fs.existsSync(path.join(appRoot, "server.js"))) {
	throw new Error("Next standalone server is missing. Run the web build first.");
}
if (!fs.existsSync(staticSource)) {
	throw new Error("Next static output is missing. Run the web build first.");
}

fs.cpSync(staticSource, path.join(appRoot, ".next", "static"), {
	recursive: true,
	force: true,
});
const desktopPublicRoot = path.join(appRoot, "public");
// `.next/standalone` is a generated staging directory. Clear its previous
// locale copy before copying so a rebuild cannot retain removed languages.
fs.rmSync(path.join(desktopPublicRoot, "locales"), {
	recursive: true,
	force: true,
});
fs.cpSync(publicSource, desktopPublicRoot, {
	recursive: true,
	force: true,
	// Source keeps all translations for development. The Windows installer only
	// ships Vietnamese, matching i18n.config.ts and avoiding unused locale data.
	filter: (source) => {
		const relative = path.relative(publicSource, source);
		if (!relative || relative.startsWith("..")) return true;
		const [topLevel, locale] = relative.split(path.sep);
		return topLevel !== "locales" || !locale || locale === "vi";
	},
});

for (const file of pythonSupport) {
	if (!fs.existsSync(file.source)) {
		throw new Error(`Desktop Python support file is missing: ${file.source}`);
	}
	for (const runtimeRoot of runtimeRoots) {
		const destination = path.join(runtimeRoot, file.destination);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.copyFileSync(file.source, destination);
	}
}

const capcutVenv = path.join(
	root,
	".local-services",
	"capcut-tts-api",
	".venv",
	"Lib",
	"site-packages",
);
for (const packageName of capcutPythonPackages) {
	const source =
		packageName === "capcut_tts_api"
			? path.join(root, ".local-services", "capcut-tts-api", packageName)
			: path.join(capcutVenv, packageName);
	if (!fs.existsSync(source)) {
		throw new Error(`CapCut Python dependency is missing: ${source}`);
	}
	for (const runtimeRoot of runtimeRoots) {
		fs.cpSync(source, path.join(runtimeRoot, "python", packageName), {
			recursive: true,
			force: true,
		});
	}
}
