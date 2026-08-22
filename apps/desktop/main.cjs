const { app, BrowserWindow, dialog, shell, utilityProcess } = require("electron");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;
let nextServer;
const DEFAULT_SERVER_PORT = 47836;

function localAppDataPath() {
	return path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Lemyloi-dichvideo");
}

function migrateLatestLegacyProjectStore() {
	const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
	const currentIndexedDb = path.join(localAppDataPath(), "IndexedDB");
	const destination = path.join(
		currentIndexedDb,
		`http_127.0.0.1_${DEFAULT_SERVER_PORT}.indexeddb.leveldb`,
	);
	const source = [
		path.join(localAppData, "EditKub", "IndexedDB"),
		currentIndexedDb,
	]
		.flatMap((indexedDbRoot) => {
			if (!fs.existsSync(indexedDbRoot)) return [];
			return fs
				.readdirSync(indexedDbRoot, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() &&
						/^http_127\.0\.0\.1_\d+\.indexeddb\.leveldb$/u.test(entry.name),
				)
				.map((entry) => {
					const fullPath = path.join(indexedDbRoot, entry.name);
					const stats = fs.statSync(fullPath);
					return {
						fullPath,
						mtimeMs: stats.mtimeMs,
						bytes: fs
							.readdirSync(fullPath)
							.reduce((total, name) => total + fs.statSync(path.join(fullPath, name)).size, 0),
					};
				});
		})
		.filter((candidate) => path.resolve(candidate.fullPath) !== path.resolve(destination))
		.sort((left, right) => right.bytes - left.bytes || right.mtimeMs - left.mtimeMs)[0];
	if (!source) return;
	if (fs.existsSync(destination)) {
		const destinationBytes = fs
			.readdirSync(destination)
			.reduce((total, name) => total + fs.statSync(path.join(destination, name)).size, 0);
		// Do not overwrite a real project store. A fresh Chromium profile is only
		// a few KB; preserve it under a timestamped name before migration.
		if (destinationBytes >= 256 * 1024 || destinationBytes >= source.bytes) return;
		fs.renameSync(destination, `${destination}.before-migration-${Date.now()}`);
	}

	fs.mkdirSync(currentIndexedDb, { recursive: true });
	fs.cpSync(source.fullPath, destination, { recursive: true, force: false });
	logDesktop(`Migrated legacy project store from ${path.basename(source.fullPath)}.`);
}

function logDesktop(message) {
	const logPath = path.join(localAppDataPath(), "logs", "desktop.log");
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
}

function assertPortAvailable(port) {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.on("error", reject);
		probe.listen(port, "127.0.0.1", () => {
			probe.close((error) => (error ? reject(error) : resolve()));
		});
	});
}

function findServerScript() {
	const candidates = [
		path.join(process.resourcesPath, "server", "apps", "web", "server.js"),
		path.join(process.resourcesPath, "server", "server.js"),
	];
	const serverScript = candidates.find((candidate) => fs.existsSync(candidate));
	if (!serverScript) {
		throw new Error("Lemyloi-dichvideo server bundle was not found in this installation.");
	}
	return serverScript;
}

async function waitForServer(url) {
	const deadline = Date.now() + 30_000;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { redirect: "manual" });
			if (response.status < 500) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(
		`Lemyloi-dichvideo local server did not start.${lastError ? ` ${lastError.message}` : ""}`,
	);
}

async function startProductionServer() {
	const port = Number(process.env.LEMYLOI_DICHVIDEO_SERVER_PORT || DEFAULT_SERVER_PORT);
	if (!Number.isInteger(port) || port < 1024 || port > 65535) {
		throw new Error("Lemyloi-dichvideo server port is invalid.");
	}
	try {
		await assertPortAvailable(port);
	} catch {
		throw new Error(
			`Cổng nội bộ ${port} đang được sử dụng. Hãy đóng Lemyloi-dichvideo đang chạy rồi mở lại.`,
		);
	}
	const serverScript = findServerScript();
	const userData = localAppDataPath();
	fs.mkdirSync(userData, { recursive: true });
	migrateLatestLegacyProjectStore();
	nextServer = utilityProcess.fork(serverScript, [], {
		env: {
			...process.env,
			LEMYLOI_DICHVIDEO_DESKTOP: "1",
			LEMYLOI_DICHVIDEO_APP_DATA: userData,
			LEMYLOI_DICHVIDEO_COMPONENTS_ROOT: path.join(userData, "components"),
			HOSTNAME: "127.0.0.1",
			PORT: String(port),
		},
		stdio: "pipe",
		serviceName: "lemyloi-dichvideo-next-server",
	});
	nextServer.stderr.on("data", (chunk) => {
		logDesktop(`[next:stderr] ${chunk}`.trimEnd());
	});
	nextServer.stdout.on("data", (chunk) => {
		logDesktop(`[next:stdout] ${chunk}`.trimEnd());
	});
	nextServer.once("exit", (code) => {
		logDesktop(`Next server exited with code ${code ?? "unknown"}.`);
		if (code && mainWindow && !mainWindow.isDestroyed()) {
			dialog.showErrorBox(
				"Lemyloi-dichvideo server stopped",
				`The local app server stopped unexpectedly (code ${code}).`,
			);
		}
	});
	const url = `http://127.0.0.1:${port}`;
	await waitForServer(url);
	return url;
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1024,
		minHeight: 720,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	mainWindow.once("ready-to-show", () => mainWindow.show());
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith("http://127.0.0.1:")) {
			event.preventDefault();
			void shell.openExternal(url);
		}
	});
	return mainWindow;
}

app.setAppUserModelId("com.lemyloi-dichvideo.desktop");
app.setPath("userData", localAppDataPath());

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
}

app.whenReady().then(async () => {
	try {
		const window = createWindow();
		const url = process.env.LEMYLOI_DICHVIDEO_DEV_SERVER_URL || (await startProductionServer());
		await window.loadURL(url);
	} catch (error) {
		logDesktop(
			`Startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
		);
		dialog.showErrorBox(
			"Lemyloi-dichvideo could not start",
			error instanceof Error ? error.stack || error.message : String(error),
		);
		app.quit();
	}

	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			const window = createWindow();
			await window.loadURL(process.env.LEMYLOI_DICHVIDEO_DEV_SERVER_URL || (await startProductionServer()));
		}
	});
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
	if (nextServer && !nextServer.killed) nextServer.kill();
});
