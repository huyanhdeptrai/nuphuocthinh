export type GpuRuntimeStatus = {
	gpuAvailable: boolean;
	gpuName: string | null;
	vramMb: number | null;
	sourceConfigured: boolean;
	manifest: { version: string; size: number; partCount: number } | null;
	localCuda: boolean;
	packInstalled: boolean;
	installedVersion: string | null;
	ready: boolean;
	job: {
		state: "idle" | "downloading" | "verifying" | "extracting" | "done" | "error";
		received: number;
		total: number;
		version?: string;
		error?: string;
	} | null;
};

async function readError(response: Response) {
	const payload: unknown = await response.json().catch(() => null);
	return typeof payload === "object" &&
		payload !== null &&
		"error" in payload &&
		typeof payload.error === "string"
		? payload.error
		: `GPU runtime HTTP ${response.status}`;
}

export async function fetchGpuRuntimeStatus(): Promise<GpuRuntimeStatus> {
	const response = await fetch("/api/runtime/gpu", { cache: "no-store" });
	if (!response.ok) throw new Error(await readError(response));
	return response.json();
}

export async function startGpuRuntimeInstall(): Promise<GpuRuntimeStatus> {
	const response = await fetch("/api/runtime/gpu", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ action: "install" }),
	});
	if (!response.ok) throw new Error(await readError(response));
	return response.json();
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
