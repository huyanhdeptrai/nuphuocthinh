import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId } from "./utils";

/**
 * v8 → v9 migration.
 *
 * v9 adds optional `vocalsMediaId` and `instrumentalMediaId` on audio
 * elements so isolated stems persist across reloads. Both default to
 * undefined, so no scene rewrite is needed — only bump version.
 */
export function transformProjectV8ToV9({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	const projectId = getProjectId({ project });
	if (!projectId) {
		return { project, skipped: true, reason: "no project id" };
	}

	if (isV9Project({ project })) {
		return { project, skipped: true, reason: "already v9" };
	}

	const migratedProject = {
		...project,
		version: 9,
	};

	return { project: migratedProject, skipped: false };
}

function isV9Project({ project }: { project: ProjectRecord }): boolean {
	const versionValue = project.version;
	return typeof versionValue === "number" && versionValue >= 9;
}
