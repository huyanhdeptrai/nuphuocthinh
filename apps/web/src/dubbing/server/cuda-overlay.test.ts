import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { applyCudaOverlay } from "./cuda-overlay";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test("installs the CUDA component even when OmniVoice is not installed", () => {
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "editkub-gpu-workspace-"));
	const overlay = fs.mkdtempSync(path.join(os.tmpdir(), "editkub-gpu-overlay-"));
	tempDirectories.push(workspace, overlay);

	expect(applyCudaOverlay(overlay, workspace)).toBe(false);
});
