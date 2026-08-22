import { NextResponse } from "next/server";
import { z } from "zod";
import {
	getGpuRuntimeStatus,
	startGpuRuntimeInstall,
} from "@/dubbing/server/gpu-runtime";

export const runtime = "nodejs";

const bodySchema = z.object({
	action: z.enum(["install"]).optional(),
});

export async function GET() {
	return NextResponse.json(await getGpuRuntimeStatus());
}

export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
	}
	if (parsed.data.action === "install") {
		try {
			return NextResponse.json(await startGpuRuntimeInstall());
		} catch (error) {
			return NextResponse.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Không thể tải gói GPU.",
				},
				{ status: 400 },
			);
		}
	}
	return NextResponse.json(await getGpuRuntimeStatus());
}
