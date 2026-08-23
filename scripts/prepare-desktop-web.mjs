import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
const webRequire = createRequire(path.join(webRoot, "package.json"));
const swcHelpersEntry = webRequire.resolve(
	"@swc/helpers/_/_interop_require_default",
);
const swcHelpersRoot = path.resolve(swcHelpersEntry, "..", "..");
const swcHelpersBunPackage = path.basename(
	path.resolve(swcHelpersRoot, "..", "..", ".."),
);

function materializeStandaloneNodeModuleLinks(root) {
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(entryPath);
				continue;
			}
			if (!entry.isSymbolicLink()) continue;
			const source = path.resolve(directory, fs.readlinkSync(entryPath));
			if (!source.startsWith(root + path.sep) || !fs.existsSync(source)) {
				throw new Error(`Standalone dependency link is invalid: ${entryPath}`);
			}
			fs.rmSync(entryPath, { recursive: true, force: true });
			fs.cpSync(source, entryPath, { recursive: true, force: true });
			if (fs.statSync(entryPath).isDirectory()) pending.push(entryPath);
		}
	}
}
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

// Bun's hoisted node_modules layout can omit this transitive Next.js runtime
// dependency from the standalone trace. Copy it explicitly so Electron's
// bundled Node runtime can start the local Next server.
for (const runtimeRoot of runtimeRoots) {
	fs.cpSync(
		swcHelpersRoot,
		path.join(runtimeRoot, "node_modules", "@swc", "helpers"),
		{ recursive: true, force: true },
	);
}
// Next itself is resolved from Bun's `.bun/next@...` directory. Its helper
// symlink points at the matching `.bun/@swc+helpers@...` package, so retain
// that target too instead of shipping a dangling symlink.
fs.cpSync(
	swcHelpersRoot,
	path.join(
		standaloneRoot,
		"node_modules",
		".bun",
		swcHelpersBunPackage,
		"node_modules",
		"@swc",
		"helpers",
	),
	{ recursive: true, force: true },
);
// Node in Electron cannot reliably resolve Bun's Windows symlinks from inside
// an installed ASAR resource. Materialise their in-bundle targets instead.
materializeStandaloneNodeModuleLinks(path.join(standaloneRoot, "node_modules"));

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
