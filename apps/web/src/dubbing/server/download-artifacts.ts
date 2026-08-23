import fs from "node:fs";
import path from "node:path";

/** Removes resumable files only after a runtime has been activated successfully. */
export function removeCompletedDownloadArtifacts(downloadDir: string): void {
	fs.rmSync(downloadDir, { recursive: true, force: true });

	const downloadsRoot = path.dirname(downloadDir);
	try {
		if (fs.readdirSync(downloadsRoot).length === 0) {
			fs.rmdirSync(downloadsRoot);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}
