"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";

/** Shown on each app launch/page reload; closing it lasts until this layout unmounts. */
export function WelcomeDialog() {
	const [open, setOpen] = useState(true);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto p-5 sm:p-6">
				<DialogTitle className="pr-8 text-xl leading-snug font-semibold">
					Chào mừng bạn đến với trình chỉnh sửa video nuphuocthinh
				</DialogTitle>
				<Image
					src="/brand/nuphuocthinh/introduction.webp"
					alt="Ảnh giới thiệu tool dịch videos nuphuocthinh"
					width={620}
					height={536}
					loading="eager"
					unoptimized
					className="my-4 max-h-[55dvh] w-full rounded-lg object-contain"
				/>
				<DialogDescription className="text-center text-sm">
					sản phẩm vừa lọ vừa đè tem của iemhanh
				</DialogDescription>
				<Button className="mt-5 w-full" onClick={() => setOpen(false)}>
					Bắt đầu dịch videos
				</Button>
			</DialogContent>
		</Dialog>
	);
}
