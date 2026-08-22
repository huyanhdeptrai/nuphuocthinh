"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
	VolumeHighIcon,
	VolumeLowIcon,
	VolumeOffIcon,
	VolumeUpIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { canElementHaveAudio } from "@/lib/timeline/element-utils";
import { canTracktHaveAudio } from "@/lib/timeline/track-utils";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";

export function getElementVolume({ element }: { element: TimelineElement }) {
	if ("volume" in element && typeof element.volume === "number") {
		return element.volume;
	}
	return 1;
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
	if (muted || volume <= 0) {
		return <HugeiconsIcon icon={VolumeOffIcon} className="size-3.5 text-white" />;
	}
	if (volume > 1) {
		return <HugeiconsIcon icon={VolumeUpIcon} className="size-3.5 text-white" />;
	}
	if (volume < 1) {
		return <HugeiconsIcon icon={VolumeLowIcon} className="size-3.5 text-white" />;
	}
	return <HugeiconsIcon icon={VolumeHighIcon} className="size-3.5 text-white" />;
}

export function VolumeControl({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const initialVolumeRef = useRef<number | null>(null);

	if (!canElementHaveAudio(element)) return null;

	const volume = getElementVolume({ element });
	const muted = element.muted === true;
	const volumePercent = Math.round(volume * 100);

	const applyVolume = ({ value, pushHistory }: { value: number; pushHistory: boolean }) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { volume: value },
				},
			],
			pushHistory,
		});
	};

	const commitVolume = ({ value }: { value: number }) => {
		if (initialVolumeRef.current !== null) {
			applyVolume({ value: initialVolumeRef.current, pushHistory: false });
			applyVolume({ value, pushHistory: true });
			initialVolumeRef.current = null;
		}
	};

	const resetVolume = () => {
		initialVolumeRef.current = volume;
		applyVolume({ value: 1, pushHistory: true });
		initialVolumeRef.current = null;
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pointer-events-auto absolute right-1 top-1 z-40 hidden size-5 items-center justify-center rounded bg-black/60 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100"
					onMouseDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
					title={t("Volume")}
				>
					<VolumeIcon volume={volume} muted={muted} />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				side="top"
				className="w-56 p-3"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2">
					<VolumeIcon volume={volume} muted={muted} />
					<span className="text-muted-foreground flex-1 text-xs">
						{t("Volume")}
					</span>
					<span className="text-muted-foreground font-mono text-xs">
						{volumePercent}%
					</span>
				</div>
				<div className="mt-2">
					<Slider
						value={[volumePercent]}
						min={0}
						max={200}
						step={1}
						onValueChange={([value]) => {
							if (initialVolumeRef.current === null) {
								initialVolumeRef.current = volume;
							}
							applyVolume({ value: value / 100, pushHistory: false });
						}}
						onValueCommit={([value]) => {
							commitVolume({ value: value / 100 });
						}}
					/>
				</div>
				<button
					type="button"
					className="bg-accent hover:bg-accent/80 mt-2 w-full rounded-sm px-2 py-1 text-xs transition-colors"
					onClick={resetVolume}
				>
					{t("Reset to 100%")}
				</button>
			</PopoverContent>
		</Popover>
	);
}

function TrackVolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
	if (muted || volume <= 0) {
		return <HugeiconsIcon icon={VolumeOffIcon} className="size-4 text-destructive cursor-pointer transition-colors" />;
	}
	if (volume > 1) {
		return <HugeiconsIcon icon={VolumeUpIcon} className="size-4 text-primary cursor-pointer transition-colors" />;
	}
	if (volume < 0.5) {
		return <HugeiconsIcon icon={VolumeLowIcon} className="size-4 text-muted-foreground cursor-pointer transition-colors" />;
	}
	return <HugeiconsIcon icon={VolumeHighIcon} className="size-4 text-muted-foreground cursor-pointer transition-colors" />;
}

export function TrackVolumeControl({ track }: { track: TimelineTrack }) {
	const { t } = useTranslation();
	const editor = useEditor();
	const initialVolumeRef = useRef<number | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	if (!canTracktHaveAudio(track)) return null;

	const audioElements = track.elements.filter(canElementHaveAudio);
	let currentVolume = 1;
	if (audioElements.length > 0) {
		const sum = audioElements.reduce((acc, el) => {
			const vol = "volume" in el && typeof el.volume === "number" ? el.volume : 1;
			return acc + vol;
		}, 0);
		currentVolume = sum / audioElements.length;
	}

	const isMuted = track.muted;
	const volumePercent = Math.round(currentVolume * 100);

	const applyTrackVolume = ({
		value,
		pushHistory = false,
	}: {
		value: number;
		pushHistory?: boolean;
	}) => {
		const updates = audioElements.map((el) => ({
			trackId: track.id,
			elementId: el.id,
			updates: { volume: value },
		}));

		if (updates.length > 0) {
			editor.timeline.updateElements({ updates, pushHistory });
		}

		if (value > 0 && track.muted) {
			editor.timeline.toggleTrackMute({ trackId: track.id });
		} else if (value === 0 && !track.muted) {
			editor.timeline.toggleTrackMute({ trackId: track.id });
		}
	};

	const commitTrackVolume = ({ value }: { value: number }) => {
		if (initialVolumeRef.current !== null) {
			applyTrackVolume({ value: initialVolumeRef.current, pushHistory: false });
			applyTrackVolume({ value, pushHistory: true });
			initialVolumeRef.current = null;
		}
	};

	const resetToDefault = () => {
		initialVolumeRef.current = currentVolume;
		applyTrackVolume({ value: 1, pushHistory: true });
		if (track.muted) {
			editor.timeline.toggleTrackMute({ trackId: track.id });
		}
		initialVolumeRef.current = null;
	};

	const toggleMute = () => {
		editor.timeline.toggleTrackMute({ trackId: track.id });
	};

	return (
		<HoverCard openDelay={100} closeDelay={200} open={isOpen} onOpenChange={setIsOpen}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onClick={toggleMute}
					className="focus:outline-none flex size-4.5 items-center justify-center rounded hover:bg-accent/80 transition-colors"
					title={isMuted ? "Bật âm thanh (Đang tắt)" : "Tắt/Bật âm (Rê chuột để chỉnh âm lượng track)"}
				>
					<TrackVolumeIcon volume={currentVolume} muted={isMuted} />
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="center"
				sideOffset={8}
				className="w-56 p-2.5 shadow-xl border bg-popover/95 backdrop-blur-md z-50 pointer-events-auto select-none"
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between gap-1.5 mb-2">
					<div className="flex items-center gap-1.5">
						<TrackVolumeIcon volume={currentVolume} muted={isMuted} />
						<span className="text-xs font-semibold">Âm lượng track</span>
					</div>
					<span className="font-mono text-xs font-bold text-primary">
						{isMuted ? "Tắt âm" : `${volumePercent}%`}
					</span>
				</div>

				<div className="my-2 px-0.5">
					<Slider
						value={[isMuted ? 0 : volumePercent]}
						min={0}
						max={200}
						step={1}
						onValueChange={([val]) => {
							if (initialVolumeRef.current === null) {
								initialVolumeRef.current = currentVolume;
							}
							applyTrackVolume({ value: val / 100, pushHistory: false });
						}}
						onValueCommit={([val]) => {
							commitTrackVolume({ value: val / 100 });
						}}
					/>
				</div>

				<div className="flex items-center gap-1.5 mt-2.5 pt-1.5 border-t">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={resetToDefault}
						className="h-6 flex-1 text-[10px] font-medium cursor-pointer"
						title="Đặt âm lượng về 100% chuẩn"
					>
						Mặc định (100%)
					</Button>
					<Button
						type="button"
						variant={isMuted ? "default" : "secondary"}
						size="sm"
						onClick={toggleMute}
						className="h-6 px-2 text-[10px] font-medium cursor-pointer"
					>
						{isMuted ? "Bật âm" : "Tắt âm"}
					</Button>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
