import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import {
	decodeMediaAudioStereo,
	stereoPcmToWavFile,
} from "@/lib/media/mediabunny";

export interface IsolatedStemPcm {
	left: Float32Array;
	right: Float32Array | null;
	sampleRate: number;
}

export interface IsolatedStems {
	vocals: IsolatedStemPcm;
	instrumental: IsolatedStemPcm;
	model: string;
}

export const VOCAL_ISOLATION_MODEL_ID = "spleeter-2stems";

const MISSING_VENV =
	"Chưa cài tách giọng. Chạy scripts/setup-vocal-isolation.ps1.";

async function decodeStemFile({
	file,
}: {
	file: File;
}): Promise<IsolatedStemPcm> {
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	const duration = await input.computeDuration();
	const decoded = await decodeMediaAudioStereo({
		file,
		trimStart: 0,
		duration: Number.isFinite(duration) && duration > 0 ? duration : 0.1,
	});
	return {
		left: decoded.left,
		right: decoded.right,
		sampleRate: decoded.sampleRate,
	};
}

export async function fetchVocalIsolationStatus(): Promise<{
	ready: boolean;
	error?: string;
}> {
	const response = await fetch("/api/vocal-isolation?capability=status");
	const payload = (await response.json()) as {
		ready?: boolean;
		error?: string;
	};
	if (!response.ok || payload.ready !== true) {
		return {
			ready: false,
			error: payload.error || MISSING_VENV,
		};
	}
	return { ready: true };
}

export async function isolateSourceWav({
	file,
}: {
	file: File;
}): Promise<IsolatedStems> {
	const body = new FormData();
	body.append("file", file, file.name || "source.wav");
	const response = await fetch("/api/vocal-isolation", {
		method: "POST",
		body,
	});
	if (!response.ok) {
		let message = MISSING_VENV;
		const contentType = response.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const payload = (await response.json()) as { error?: string };
			if (payload.error) message = payload.error;
		}
		throw new Error(message);
	}

	const form = await response.formData();
	const vocalsFile = form.get("vocals");
	const instrumentalFile = form.get("instrumental");
	if (!(vocalsFile instanceof File) || !(instrumentalFile instanceof File)) {
		throw new Error("Máy chủ không trả đủ 2 stem tách giọng.");
	}

	const [vocals, instrumental] = await Promise.all([
		decodeStemFile({ file: vocalsFile }),
		decodeStemFile({ file: instrumentalFile }),
	]);
	const modelField = form.get("model");
	const model =
		typeof modelField === "string" && modelField.trim()
			? modelField.trim()
			: VOCAL_ISOLATION_MODEL_ID;
	return { vocals, instrumental, model };
}

export function stemPcmToWavFile({
	pcm,
	fileName,
}: {
	pcm: IsolatedStemPcm;
	fileName: string;
}): File {
	return stereoPcmToWavFile({
		left: pcm.left,
		right: pcm.right,
		sampleRate: pcm.sampleRate,
		fileName,
	});
}
