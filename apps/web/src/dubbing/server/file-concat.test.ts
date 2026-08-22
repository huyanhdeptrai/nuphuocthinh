import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { concatFiles } from "./file-concat";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test("concatenates GPU download parts and creates the target ZIP", async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "editkub-gpu-concat-"));
	tempDirectories.push(directory);
	const first = path.join(directory, "runtime.zip.001");
	const second = path.join(directory, "runtime.zip.002");
	const zip = path.join(directory, "runtime.zip");
	fs.writeFileSync(first, "first-part");
	fs.writeFileSync(second, "second-part");

	await concatFiles([first, second], zip);

	expect(fs.existsSync(zip)).toBe(true);
	expect(fs.readFileSync(zip, "utf8")).toBe("first-partsecond-part");
});
