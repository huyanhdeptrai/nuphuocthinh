import { strFromU8, strToU8, unzip, zip } from "fflate";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";

const PACKAGE_FORMAT = "lemyloi-dichvideo-project";
const PACKAGE_VERSION = 1;
const MANIFEST_PATH = "project.json";

type PortableMediaAsset = {
	id: string;
	name: string;
	type: MediaAsset["type"];
	width?: number;
	height?: number;
	duration?: number;
	fps?: number;
	ephemeral?: boolean;
	thumbnailUrl?: string;
	lastModified: number;
	mimeType: string;
	path: string;
};

type PackageManifest = {
	format: typeof PACKAGE_FORMAT;
	version: typeof PACKAGE_VERSION;
	project: TProject;
	media: PortableMediaAsset[];
};

export type ImportedProjectPackage = {
	project: TProject;
	mediaAssets: MediaAsset[];
};

function archive({ entries }: { entries: Record<string, Uint8Array> }) {
	return new Promise<Uint8Array>((resolve, reject) => {
		zip(entries, { level: 0 }, (error, data) => {
			if (error) reject(error);
			else resolve(data);
		});
	});
}

function unarchive({ data }: { data: Uint8Array }) {
	return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
		unzip(data, (error, entries) => {
			if (error) reject(error);
			else resolve(entries);
		});
	});
}

function assertManifest(value: unknown): asserts value is PackageManifest {
	if (
		typeof value !== "object" ||
		value === null ||
		(value as Partial<PackageManifest>).format !== PACKAGE_FORMAT ||
		(value as Partial<PackageManifest>).version !== PACKAGE_VERSION ||
		!Array.isArray((value as Partial<PackageManifest>).media) ||
		typeof (value as Partial<PackageManifest>).project !== "object" ||
		(value as Partial<PackageManifest>).project === null
	) {
		throw new Error("Tệp không phải dự án Lemyloi-dichvideo hợp lệ.");
	}
}

function restoreProjectDates(project: TProject): TProject {
	return {
		...project,
		metadata: {
			...project.metadata,
			createdAt: new Date(project.metadata.createdAt),
			updatedAt: new Date(project.metadata.updatedAt),
		},
		scenes: project.scenes.map((scene) => ({
			...scene,
			createdAt: new Date(scene.createdAt),
			updatedAt: new Date(scene.updatedAt),
		})),
	};
}

export async function createProjectPackage({
	project,
	mediaAssets,
}: {
	project: TProject;
	mediaAssets: MediaAsset[];
}): Promise<Blob> {
	const media = mediaAssets.map<PortableMediaAsset>((asset) => ({
		id: asset.id,
		name: asset.name,
		type: asset.type,
		width: asset.width,
		height: asset.height,
		duration: asset.duration,
		fps: asset.fps,
		ephemeral: asset.ephemeral,
		thumbnailUrl: asset.thumbnailUrl,
		lastModified: asset.file.lastModified,
		mimeType: asset.file.type,
		path: `media/${asset.id}`,
	}));
	const entries: Record<string, Uint8Array> = {
		[MANIFEST_PATH]: strToU8(
			JSON.stringify({ format: PACKAGE_FORMAT, version: PACKAGE_VERSION, project, media }),
		),
	};

	for (const asset of mediaAssets) {
		entries[`media/${asset.id}`] = new Uint8Array(await asset.file.arrayBuffer());
	}

	return new Blob([await archive({ entries })], {
		type: "application/vnd.lemyloi-dichvideo.project+zip",
	});
}

export async function readProjectPackage({ file }: { file: File }): Promise<ImportedProjectPackage> {
	const entries = await unarchive({ data: new Uint8Array(await file.arrayBuffer()) });
	const manifestData = entries[MANIFEST_PATH];
	if (!manifestData) throw new Error("Gói dự án thiếu project.json.");

	let manifest: unknown;
	try {
		manifest = JSON.parse(strFromU8(manifestData));
	} catch {
		throw new Error("Không đọc được project.json trong gói dự án.");
	}
	assertManifest(manifest);

	const mediaAssets = manifest.media.map<MediaAsset>((asset) => {
		if (!asset || typeof asset.id !== "string" || typeof asset.path !== "string") {
			throw new Error("Gói dự án có metadata media không hợp lệ.");
		}
		const data = entries[asset.path];
		if (!data) throw new Error(`Gói dự án thiếu media: ${asset.name || asset.id}.`);
		return {
			id: asset.id,
			name: asset.name,
			type: asset.type,
			width: asset.width,
			height: asset.height,
			duration: asset.duration,
			fps: asset.fps,
			ephemeral: asset.ephemeral,
			thumbnailUrl: asset.thumbnailUrl,
			file: new File([data], asset.name, {
				type: asset.mimeType,
				lastModified: asset.lastModified,
			}),
		};
	});

	return { project: restoreProjectDates(manifest.project), mediaAssets };
}

export function projectPackageFilename(name: string): string {
	const safeName = name.trim().replace(/[\\/:*?"<>|]/g, "-") || "du-an";
	return `${safeName}.ldvproj`;
}
