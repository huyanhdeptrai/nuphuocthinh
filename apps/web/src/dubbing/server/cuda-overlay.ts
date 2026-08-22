import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OVERLAY_NAMES = [
	"torch",
	"torch-2.8.0+cu126.dist-info",
	"torchaudio",
	"torchaudio-2.8.0+cu126.dist-info",
	"torchgen",
	"functorch",
	"torio",
	"torchcodec",
	"torchcodec-0.15.0.dist-info",
];

function overlaySites(workspaceRoot: string) {
	return [
		path.join(workspaceRoot, ".venv-diarization", "Lib", "site-packages"),
		path.join(path.dirname(workspaceRoot), ".venv-diarization", "Lib", "site-packages"),
		path.join(workspaceRoot, ".local-services", "omnivoice", ".venv", "Lib", "site-packages"),
	].filter((site, index, all) => fs.existsSync(site) && all.indexOf(site) === index);
}

// CUDA is a downloadable component. A voice runtime can be installed later,
// so the absence of site-packages must not make the component installation fail.
export function applyCudaOverlay(overlayRoot: string, workspaceRoot: string) {
	const sites = overlaySites(workspaceRoot);
	if (sites.length === 0) return false;

	for (const site of sites) {
		for (const name of OVERLAY_NAMES) {
			const src = path.join(overlayRoot, name);
			const dst = path.join(site, name);
			if (!fs.existsSync(src)) continue;
			if (fs.existsSync(dst)) {
				let isLink = false;
				try {
					isLink = fs.lstatSync(dst).isSymbolicLink();
				} catch {
					isLink = false;
				}
				const backup = `${dst}.cpu-backup`;
				if (!isLink && !fs.existsSync(backup)) fs.renameSync(dst, backup);
				else fs.rmSync(dst, { recursive: true, force: true });
			}
			execFileSync("cmd.exe", ["/c", `mklink /J "${dst}" "${src}"`], {
				windowsHide: true,
			});
		}
	}
	return true;
}
