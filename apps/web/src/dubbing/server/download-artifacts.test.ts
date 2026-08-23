import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeCompletedDownloadArtifacts } from "./download-artifacts";

describe("removeCompletedDownloadArtifacts", () => {
	test("removes completed parts and their empty downloads parent", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lemyloi-downloads-"));
		const downloadDir = path.join(root, "downloads", "1.0.0");
		fs.mkdirSync(downloadDir, { recursive: true });
		fs.writeFileSync(path.join(downloadDir, "runtime.zip"), "temporary payload");
		try {
			removeCompletedDownloadArtifacts(downloadDir);
			expect(fs.existsSync(downloadDir)).toBe(false);
			expect(fs.existsSync(path.join(root, "downloads"))).toBe(false);
			expect(fs.existsSync(root)).toBe(true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
