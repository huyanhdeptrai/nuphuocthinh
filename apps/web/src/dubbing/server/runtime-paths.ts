import os from "node:os";
import path from "node:path";

const COMPONENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function appDataRoot() {
	const configured = process.env.LEMYLOI_DICHVIDEO_APP_DATA?.trim();
	if (configured) return path.resolve(configured);

	if (process.platform === "win32") {
		return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Lemyloi-dichvideo");
	}

	return path.join(os.homedir(), ".local", "share", "lemyloi-dichvideo");
}

export function componentsRoot({ developmentRoot }: { developmentRoot: string }) {
	const configured = process.env.LEMYLOI_DICHVIDEO_COMPONENTS_ROOT?.trim();
	if (configured) return path.resolve(configured);

	if (process.env.LEMYLOI_DICHVIDEO_DESKTOP === "1") {
		return path.join(appDataRoot(), "components");
	}

	return path.join(developmentRoot, ".local-services", "components");
}

export function componentRoot({
	developmentRoot,
	componentId,
}: {
	developmentRoot: string;
	componentId: string;
}) {
	if (!COMPONENT_ID.test(componentId)) {
		throw new Error(`Invalid component id: ${componentId}`);
	}
	return path.join(componentsRoot({ developmentRoot }), componentId);
}
