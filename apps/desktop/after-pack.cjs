const fs = require("node:fs");
const path = require("node:path");

exports.default = async function copyStandaloneNodeModules(context) {
	const source = path.resolve(
		__dirname,
		"..",
		"web",
		".next",
		"standalone",
		"node_modules",
	);
	const destination = path.join(
		context.appOutDir,
		"resources",
		"server",
		"node_modules",
	);
	if (!fs.existsSync(source)) {
		throw new Error("Next standalone node_modules is missing. Build the web app first.");
	}
	// `extraResources` already copies the complete standalone bundle. Avoid a
	// second recursive copy, which can race against Electron Builder while it
	// traverses Next's large dependency tree on Windows.
	if (fs.existsSync(path.join(destination, "next", "dist", "build"))) return;
	fs.cpSync(source, destination, { recursive: true, force: true });
};
