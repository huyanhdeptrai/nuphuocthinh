import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
	pingVocalIsolation,
	separateVocals,
	vocalIsolationReady,
} from "@/dubbing/server/vocal-isolation-client";

export const runtime = "nodejs";
export const maxDuration = 3600;

const TEMP_DIR = path.join(os.tmpdir(), "lemyloi-dichvideo-vocal-isolation");
const MAX_WAV_BYTES = 400 * 1024 * 1024;

function isWavName({ fileName }: { fileName: string }): boolean {
	const ext = path.extname(fileName).toLowerCase();
	return ext === ".wav" || ext === ".wave";
}

function looksLikeVideo({
	fileName,
	header,
}: {
	fileName: string;
	header: Buffer;
}): boolean {
	const ext = path.extname(fileName).toLowerCase();
	if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext)) return true;
	if (header.length < 12) return false;
	const headStr = header.subarray(0, 16).toString("binary");
	const headHex = header.subarray(0, 16).toString("hex");
	if (headHex.startsWith("1a45dfa3")) return true;
	if (headStr.includes("ftyp")) return true;
	return false;
}

async function writeUploadToTemp({
	file,
}: {
	file: File;
}): Promise<string> {
	await fs.mkdir(TEMP_DIR, { recursive: true });
	const dest = path.join(
		TEMP_DIR,
		`source-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`,
	);
	const nodeStream = Readable.fromWeb(
		file.stream() as any,
	);
	const { createWriteStream } = await import("node:fs");
	await new Promise<void>((resolve, reject) => {
		const out = createWriteStream(dest);
		let written = 0;
		nodeStream.on("data", (chunk: Buffer) => {
			written += chunk.length;
			if (written > MAX_WAV_BYTES) {
				nodeStream.destroy();
				out.destroy();
				reject(new Error("File WAV quá lớn."));
			}
		});
		nodeStream.on("error", reject);
		out.on("error", reject);
		out.on("finish", resolve);
		nodeStream.pipe(out);
	});
	return dest;
}

async function readHeader({ filePath }: { filePath: string }): Promise<Buffer> {
	const handle = await fs.open(filePath, "r");
	try {
		const buffer = Buffer.alloc(16);
		const { bytesRead } = await handle.read(buffer, 0, 16, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

async function fileToResponsePart({
	filePath,
	field,
}: {
	filePath: string;
	field: string;
}): Promise<File> {
	const bytes = await fs.readFile(filePath);
	return new File([bytes], `${field}.wav`, { type: "audio/wav" });
}

export async function GET(req: Request) {
	const capability = new URL(req.url).searchParams.get("capability");
	if (capability !== "status") {
		return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
	}
	const installed = vocalIsolationReady();
	if (!installed.ready) {
		return NextResponse.json({
			success: false,
			ready: false,
			error: installed.error,
		});
	}
	const status = await pingVocalIsolation();
	return NextResponse.json({
		success: status.ready,
		ready: status.ready,
		device: status.device,
		error: status.error,
	});
}

export async function POST(req: Request) {
	const installed = vocalIsolationReady();
	if (!installed.ready) {
		return NextResponse.json(
			{ error: installed.error },
			{ status: 503 },
		);
	}

	let sourcePath: string | null = null;
	let vocalsPath: string | null = null;
	let instrumentalPath: string | null = null;
	try {
		const form = await req.formData();
		const uploaded = form.get("file");
		if (!(uploaded instanceof File)) {
			return NextResponse.json(
				{ error: "Thiếu file WAV đã trích xuất." },
				{ status: 400 },
			);
		}
		if (!isWavName({ fileName: uploaded.name })) {
			return NextResponse.json(
				{ error: "Chỉ nhận WAV đã trích xuất, không nhận video." },
				{ status: 400 },
			);
		}

		sourcePath = await writeUploadToTemp({ file: uploaded });
		const header = await readHeader({ filePath: sourcePath });
		if (looksLikeVideo({ fileName: uploaded.name, header })) {
			return NextResponse.json(
				{ error: "Chỉ nhận WAV đã trích xuất, không nhận video." },
				{ status: 400 },
			);
		}
		if (header.length < 12 || header.subarray(0, 4).toString("ascii") !== "RIFF") {
			return NextResponse.json(
				{ error: "File không phải WAV hợp lệ." },
				{ status: 400 },
			);
		}

		const separated = await separateVocals({ audioPath: sourcePath });
		vocalsPath = separated.vocalsPath;
		instrumentalPath = separated.instrumentalPath;

		const formOut = new FormData();
		formOut.append(
			"vocals",
			await fileToResponsePart({ filePath: vocalsPath, field: "vocals" }),
		);
		formOut.append(
			"instrumental",
			await fileToResponsePart({
				filePath: instrumentalPath,
				field: "instrumental",
			}),
		);
		if (separated.device) formOut.append("device", separated.device);
		if (separated.model) formOut.append("model", separated.model);
		if (typeof separated.inferenceMs === "number") {
			formOut.append("inferenceMs", String(separated.inferenceMs));
		}

		return new NextResponse(formOut, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Không tách được giọng khỏi nhạc.",
			},
			{ status: 500 },
		);
	} finally {
		await Promise.all(
			[sourcePath, vocalsPath, instrumentalPath]
				.filter((item): item is string => Boolean(item))
				.map((item) => fs.rm(item, { force: true })),
		);
	}
}
