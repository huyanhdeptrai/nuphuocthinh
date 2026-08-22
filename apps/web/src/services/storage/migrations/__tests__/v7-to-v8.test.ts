import { describe, expect, test } from "bun:test";
import { transformProjectV7ToV8 } from "../transformers/v7-to-v8";
import { projectWithNoId, v7Project, v8Project } from "./fixtures";

describe("V7 to V8 Migration", () => {
	describe("transformProjectV7ToV8", () => {
		test("bumps version to 8", () => {
			const result = transformProjectV7ToV8({ project: v7Project });

			expect(result.skipped).toBe(false);
			expect(result.project.version).toBe(8);
		});

		test("preserves existing metadata fields", () => {
			const result = transformProjectV7ToV8({ project: v7Project });

			const metadata = result.project.metadata as Record<string, unknown>;
			expect(metadata.id).toBe(v7Project.metadata.id);
			expect(metadata.name).toBe(v7Project.metadata.name);
		});

		test("preserves settings object", () => {
			const result = transformProjectV7ToV8({ project: v7Project });

			expect(result.project.settings).toEqual(v7Project.settings);
		});

		test("preserves scenes array", () => {
			const result = transformProjectV7ToV8({ project: v7Project });

			expect(result.project.scenes).toEqual(v7Project.scenes);
		});

		test("skips project that is already v8", () => {
			const result = transformProjectV7ToV8({ project: v8Project });

			expect(result.skipped).toBe(true);
			expect(result.reason).toBe("already v8");
		});

		test("skips project with no id", () => {
			const result = transformProjectV7ToV8({ project: projectWithNoId });

			expect(result.skipped).toBe(true);
			expect(result.reason).toBe("no project id");
		});
	});
});
