"use client";

import { useRef } from "react";
import { FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDubbingStore } from "../dubbing-store";
import { parseSrtRecognitionCues } from "../services/srt";
import { useTranslationStore } from "../translation-store";

export function SrtImportButton({
	className = "h-6 gap-1 px-1.5 text-[9px]",
	mode = "source",
}: {
	className?: string;
	mode?: "source" | "translation";
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const setExtractedCues = useDubbingStore((state) => state.setExtractedCues);
	const setSpeakerProfiles = useDubbingStore(
		(state) => state.setSpeakerProfiles,
	);
	const clearTranslations = useTranslationStore(
		(state) => state.clearTranslations,
	);
	const setTranslations = useTranslationStore((state) => state.setTranslations);

	const handleFile = async (file?: File) => {
		if (!file) return;
		try {
			const cues = parseSrtRecognitionCues(await file.text());
			setExtractedCues(cues);
			setSpeakerProfiles([]);
			if (mode === "translation") {
				setTranslations(cues.map((cue) => ({ id: cue.id, text: cue.text })));
			} else {
				clearTranslations();
			}
			toast.success(`Đã nhập ${cues.length} câu từ ${file.name}.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể đọc file SRT.",
			);
		} finally {
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept=".srt,application/x-subrip,text/plain"
				className="hidden"
				onChange={(event) => void handleFile(event.target.files?.[0])}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={className}
				onClick={() => inputRef.current?.click()}
			>
				<HugeiconsIcon icon={FileUploadIcon} className="size-3" />
				Nhập .SRT
			</Button>
		</>
	);
}
