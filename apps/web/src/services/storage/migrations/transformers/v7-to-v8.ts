import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId } from "./utils";

/**
 * v7 → v8 migration.
 *
 * v8 adds optional `audioRole` (`"narration" | "source"`) and
 * `originalMediaId` on audio elements. Both default to undefined at the
 * application layer, so no scene rewrite is needed — only bump version.
 */
export function transformProjectV7ToV8({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	const projectId = getProjectId({ project });
	if (!projectId) {
		return { project, skipped: true, reason: "no project id" };
	}

	if (isV8Project({ project })) {
		return { project, skipped: true, reason: "already v8" };
	}

	const migratedProject = {
		...project,
		version: 8,
	};

	return { project: migratedProject, skipped: false };
}

function isV8Project({ project }: { project: ProjectRecord }): boolean {
	const versionValue = project.version;
	return typeof versionValue === "number" && versionValue >= 8;
}
