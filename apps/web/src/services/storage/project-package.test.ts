import { describe, expect, test } from "bun:test";
import type { TProject } from "@/types/project";
import {
	createProjectPackage,
	projectPackageFilename,
	readProjectPackage,
} from "./project-package";

describe("portable project package", () => {
	test("round-trips the project and its original media file", async () => {
		const project = {
			metadata: {
				id: "source-project",
				name: "Video chia sẻ",
				duration: 4,
				createdAt: new Date("2026-08-23T00:00:00.000Z"),
				updatedAt: new Date("2026-08-23T01:00:00.000Z"),
			},
			scenes: [],
			currentSceneId: "",
			settings: {},
			version: 1,
		} as unknown as TProject;
		const source = new File(["portable media"], "clip.mp4", {
			type: "video/mp4",
			lastModified: 123,
		});

		const packageFile = new File(
			[await createProjectPackage({
				project,
				mediaAssets: [{ id: "media-1", name: source.name, type: "video", file: source }],
			})],
			"video.ldvproj",
		);
		const imported = await readProjectPackage({ file: packageFile });

		expect(imported.project.metadata.name).toBe("Video chia sẻ");
		expect(imported.project.metadata.createdAt).toBeInstanceOf(Date);
		expect(imported.mediaAssets).toHaveLength(1);
		expect(await imported.mediaAssets[0]?.file.text()).toBe("portable media");
		expect(projectPackageFilename("a/b:c")).toBe("a-b-c.ldvproj");
	});
});
