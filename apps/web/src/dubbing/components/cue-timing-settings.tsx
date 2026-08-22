"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDubbingStore } from "../dubbing-store";
import {
	applyCueTimingOffsets,
	formatSignedSeconds,
	parseSignedSeconds,
} from "../services/cue-timing";

export function CueTimingSettingsButton({
	compact = false,
}: {
	compact?: boolean;
}) {
	const { settings, updateSettings } = useDubbingStore();
	const [open, setOpen] = useState(false);
	const [leadDraft, setLeadDraft] = useState("0");
	const [tailDraft, setTailDraft] = useState("0");
	const [error, setError] = useState("");

	const handleOpen = () => {
		setLeadDraft(formatSignedSeconds(settings.cueLeadSeconds));
		setTailDraft(formatSignedSeconds(settings.cueTailSeconds));
		setError("");
		setOpen(true);
	};

	const preview = useMemo(() => {
		const lead = parseSignedSeconds(leadDraft);
		const tail = parseSignedSeconds(tailDraft);
		if (lead === null || tail === null) return null;
		return applyCueTimingOffsets({
			startTime: 60,
			endTime: 120,
			cueLeadSeconds: lead,
			cueTailSeconds: tail,
		});
	}, [leadDraft, tailDraft]);

	const handleSave = () => {
		const cueLeadSeconds = parseSignedSeconds(leadDraft);
		const cueTailSeconds = parseSignedSeconds(tailDraft);
		if (cueLeadSeconds === null || cueTailSeconds === null) {
			setError("Giá trị không hợp lệ. Ví dụ đúng: +1,02 hoặc -3,03.");
			return;
		}
		updateSettings({ cueLeadSeconds, cueTailSeconds });
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={
					compact ? "h-6 gap-1 px-1.5 text-[9px]" : "h-7 gap-1.5 text-[10px]"
				}
				onClick={handleOpen}
			>
				<HugeiconsIcon icon={Settings01Icon} className="size-3" />
				Bù thời gian
			</Button>

			<DialogContent className="max-w-md">
				<DialogHeader className="p-4">
					<DialogTitle className="text-base">
						Bù thời gian phụ đề trên Timeline
					</DialogTitle>
				</DialogHeader>
				<DialogBody className="gap-3 p-4">
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						Điều chỉnh thời điểm hiển thị so với cue gốc. Nhập được dấu chấm
						hoặc dấu phẩy.
					</p>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label
								htmlFor="cue-lead-offset"
								className="text-xs font-semibold"
							>
								Trước cue (± giây)
							</Label>
							<Input
								id="cue-lead-offset"
								value={leadDraft}
								onChange={(event) => setLeadDraft(event.target.value)}
								placeholder="+1,02"
								inputMode="decimal"
								className="h-8 font-mono text-xs"
							/>
							<p className="text-[9px] leading-snug text-muted-foreground">
								Dương: xuất hiện sớm hơn. Âm: xuất hiện muộn hơn.
							</p>
						</div>
						<div className="space-y-1.5">
							<Label
								htmlFor="cue-tail-offset"
								className="text-xs font-semibold"
							>
								Sau cue (± giây)
							</Label>
							<Input
								id="cue-tail-offset"
								value={tailDraft}
								onChange={(event) => setTailDraft(event.target.value)}
								placeholder="-3,03"
								inputMode="decimal"
								className="h-8 font-mono text-xs"
							/>
							<p className="text-[9px] leading-snug text-muted-foreground">
								Dương: biến mất trễ hơn. Âm: biến mất sớm hơn.
							</p>
						</div>
					</div>
					<div className="rounded-md border bg-muted/30 p-2 text-[10px]">
						<span className="font-semibold">Xem trước:</span> cue 60,00s →
						120,00s sẽ thành{" "}
						{preview
							? `${preview.startTime.toFixed(2).replace(".", ",")}s → ${preview.endTime.toFixed(2).replace(".", ",")}s`
							: "giá trị không hợp lệ"}
					</div>
					{error && <p className="text-[10px] text-red-500">{error}</p>}
				</DialogBody>
				<DialogFooter className="flex-row justify-end p-3">
					<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Hủy
					</Button>
					<Button size="sm" onClick={handleSave}>
						Lưu thiết lập
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
