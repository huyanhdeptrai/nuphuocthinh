import { describe, expect, test } from "bun:test";
import { transformProjectV8ToV9 } from "../transformers/v8-to-v9";
import { projectWithNoId, v8Project, v9Project } from "./fixtures";

describe("V8 to V9 Migration", () => {
	describe("transformProjectV8ToV9", () => {
		test("bumps version to 9", () => {
			const result = transformProjectV8ToV9({ project: v8Project });

			expect(result.skipped).toBe(false);
			expect(result.project.version).toBe(9);
		});

		test("preserves existing metadata fields", () => {
			const result = transformProjectV8ToV9({ project: v8Project });

			const metadata = result.project.metadata as Record<string, unknown>;
			expect(metadata.id).toBe(v8Project.metadata.id);
			expect(metadata.name).toBe(v8Project.metadata.name);
		});

		test("preserves settings object", () => {
			const result = transformProjectV8ToV9({ project: v8Project });

			expect(result.project.settings).toEqual(v8Project.settings);
		});

		test("preserves scenes array", () => {
			const result = transformProjectV8ToV9({ project: v8Project });

			expect(result.project.scenes).toEqual(v8Project.scenes);
		});

		test("skips project that is already v9", () => {
			const result = transformProjectV8ToV9({ project: v9Project });

			expect(result.skipped).toBe(true);
			expect(result.reason).toBe("already v9");
		});

		test("skips project with no id", () => {
			const result = transformProjectV8ToV9({ project: projectWithNoId });

			expect(result.skipped).toBe(true);
			expect(result.reason).toBe("no project id");
		});
	});
});
