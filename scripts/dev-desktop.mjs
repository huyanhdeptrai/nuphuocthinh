import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bun = process.platform === "win32" ? "bun.exe" : "bun";
const electron = path.join(
	root,
	"node_modules",
	".bin",
	process.platform === "win32" ? "electron.cmd" : "electron",
);
const web = spawn(bun, ["run", "dev:web"], {
	cwd: root,
	stdio: "inherit",
	windowsHide: false,
});
let desktop;

function stop(child) {
	if (child && !child.killed) child.kill();
}

async function waitForWeb() {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch("http://127.0.0.1:4000");
			if (response.status < 500) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("The web development server did not start on port 4000.");
}

try {
	await waitForWeb();
	desktop = spawn(electron, ["apps/desktop/main.cjs"], {
		cwd: root,
		stdio: "inherit",
		env: { ...process.env, LEMYLOI_DICHVIDEO_DEV_SERVER_URL: "http://127.0.0.1:4000" },
		windowsHide: false,
	});
	desktop.once("exit", (code) => {
		stop(web);
		process.exitCode = code || 0;
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	process.on("exit", () => stop(web));
	process.on("SIGINT", () => {
		stop(desktop);
		stop(web);
		process.exit();
	});
}
