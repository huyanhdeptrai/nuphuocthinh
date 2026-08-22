"use client";

import React, { useMemo } from "react";
import { Check, ChevronDown, Plus, User, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDubbingStore } from "../dubbing-store";
import type { RecognitionCue, SpeakerProfile } from "../types";
import type { EditorCore } from "@/core";
import { mediaTimeFromSeconds } from "../adapters/time";
import { findRecognitionCueElementRef } from "../services/cue-timeline-selection";
import { cn } from "@/utils/ui";

export function syncCueSpeakerToTimeline({
	editor,
	cue,
	cueIndex,
	profile,
	preferredTrackId,
}: {
	editor: EditorCore;
	cue: RecognitionCue;
	cueIndex?: number;
	profile: SpeakerProfile | null;
	preferredTrackId?: string;
}): void {
	try {
		const tracks = editor.timeline.getTracks();
		const cueStartTime = mediaTimeFromSeconds({ seconds: cue.startTime });
		const resolvedIndex = cueIndex ?? 0;

		const ref = findRecognitionCueElementRef({
			tracks,
			cue,
			cueIndex: resolvedIndex,
			cueStartTime,
			preferredTrackId: preferredTrackId ?? null,
		});

		if (!ref || !ref.trackId || !ref.elementId) return;

		editor.timeline.updateElements({
			updates: [
				{
					trackId: ref.trackId,
					elementId: ref.elementId,
					updates: {
						name: profile
							? `[${profile.name}] Caption ${resolvedIndex + 1}`
							: `Caption ${resolvedIndex + 1}`,
						subtitleSpeaker: profile
							? {
									id: profile.id,
									name: profile.name,
									color: profile.color,
								}
							: undefined,
					},
				},
			],
			pushHistory: false,
		});
	} catch (error) {
		console.warn("syncCueSpeakerToTimeline error:", error);
	}
}

interface SpeakerSelectDropdownProps {
	cue: RecognitionCue;
	cueIndex?: number;
	editor?: EditorCore | null;
	preferredTrackId?: string | null;
	size?: "xs" | "sm";
	className?: string;
}

export function SpeakerSelectDropdown({
	cue,
	cueIndex,
	editor,
	preferredTrackId,
	size = "xs",
	className,
}: SpeakerSelectDropdownProps) {
	const {
		speakerProfiles,
		extractedCues,
		assignCueSpeaker,
		addSpeakerProfile,
		setSpeakerProfiles,
	} = useDubbingStore();

	// Ensure all profiles from existing cues are included
	const allProfiles = useMemo(() => {
		const map = new Map<string, SpeakerProfile>();
		for (const p of speakerProfiles) {
			map.set(p.id, p);
		}
		for (const c of extractedCues) {
			if (c.speakerId && !map.has(c.speakerId)) {
				map.set(c.speakerId, {
					id: c.speakerId,
					name: c.speakerName || c.speaker || "Người nói",
					color: c.speakerColor || "#3b82f6",
				});
			}
		}
		return Array.from(map.values());
	}, [speakerProfiles, extractedCues]);

	const currentSpeakerKey = cue.speakerId ?? cue.speakerName ?? cue.speaker;
	const currentProfile = allProfiles.find(
		(p) =>
			p.id === cue.speakerId ||
			p.name === cue.speakerName ||
			p.name === cue.speaker,
	);
	const displayName =
		currentProfile?.name ?? cue.speakerName ?? cue.speaker ?? null;
	const displayColor = currentProfile?.color ?? cue.speakerColor ?? "#3b82f6";

	const handleSelectSpeaker = (profile: SpeakerProfile) => {
		// Sync missing profile to store if needed
		if (!speakerProfiles.some((p) => p.id === profile.id)) {
			setSpeakerProfiles([...speakerProfiles, profile]);
		}

		assignCueSpeaker({ cueId: cue.id, speakerId: profile.id });

		if (editor) {
			syncCueSpeakerToTimeline({
				editor,
				cue,
				cueIndex,
				profile,
				preferredTrackId: preferredTrackId ?? undefined,
			});
		}

		toast.success(
			`Đã đổi phân vai câu ${cueIndex !== undefined ? `#${cueIndex + 1}` : ""} sang "${profile.name}"`,
		);
	};

	const handleCreateAndAssignSpeaker = () => {
		const newProfile = addSpeakerProfile();
		assignCueSpeaker({ cueId: cue.id, speakerId: newProfile.id });

		if (editor) {
			syncCueSpeakerToTimeline({
				editor,
				cue,
				cueIndex,
				profile: newProfile,
				preferredTrackId: preferredTrackId ?? undefined,
			});
		}

		toast.success(
			`Đã tạo phân vai mới "${newProfile.name}" và gán cho câu ${cueIndex !== undefined ? `#${cueIndex + 1}` : ""}`,
		);
	};

	const handleClearSpeaker = () => {
		assignCueSpeaker({ cueId: cue.id, speakerId: null });

		if (editor) {
			syncCueSpeakerToTimeline({
				editor,
				cue,
				cueIndex,
				profile: null,
				preferredTrackId: preferredTrackId ?? undefined,
			});
		}

		toast.info(
			`Đã bỏ phân vai cho câu ${cueIndex !== undefined ? `#${cueIndex + 1}` : ""}`,
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					className={cn(
						"inline-flex items-center gap-1 rounded font-mono font-bold transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
						size === "xs"
							? "h-4.5 px-1 text-[8.5px] leading-none"
							: "h-5.5 px-1.5 text-[9.5px]",
						displayName
							? "border hover:brightness-110"
							: "border border-dashed border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
						className,
					)}
					style={
						displayName
							? {
									color: displayColor,
									borderColor: `${displayColor}70`,
									backgroundColor: `${displayColor}18`,
								}
							: undefined
					}
					title="Bấm để đổi phân vai người nói cho câu này"
				>
					{displayName ? (
						<>
							<span
								className="size-1.5 shrink-0 rounded-full"
								style={{ backgroundColor: displayColor }}
							/>
							<span className="max-w-[50px] truncate">{displayName}</span>
							<ChevronDown className="size-2.5 opacity-60" />
						</>
					) : (
						<>
							<User className="size-2.5 opacity-70" />
							<span>+ Gán vai</span>
							<ChevronDown className="size-2.5 opacity-60" />
						</>
					)}
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="start"
				className="min-w-[170px] p-1 shadow-lg"
				onClick={(e) => e.stopPropagation()}
			>
				<DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					{cueIndex !== undefined
						? `Phân vai câu #${cueIndex + 1}`
						: "Chọn người nói"}
				</DropdownMenuLabel>
				<DropdownMenuSeparator className="my-1" />

				<DropdownMenuGroup>
					{allProfiles.length === 0 ? (
						<div className="px-2 py-1.5 text-[11px] text-muted-foreground">
							Chưa có danh sách người nói.
						</div>
					) : (
						allProfiles.map((profile) => {
							const isCurrent =
								profile.id === cue.speakerId ||
								profile.name === cue.speakerName ||
								profile.name === cue.speaker;

							return (
								<DropdownMenuItem
									key={profile.id}
									onClick={() => handleSelectSpeaker(profile)}
									className={cn(
										"flex cursor-pointer items-center justify-between gap-2 px-2 py-1 text-xs",
										isCurrent && "bg-primary/10 font-bold",
									)}
								>
									<div className="flex items-center gap-2">
										<span
											className="size-2.5 shrink-0 rounded-full shadow-2xs"
											style={{ backgroundColor: profile.color }}
										/>
										<span className="truncate">{profile.name}</span>
										{profile.selfPronoun && (
											<span className="text-[10px] text-muted-foreground">
												({profile.selfPronoun}/{profile.addressPronoun || "?"})
											</span>
										)}
									</div>
									{isCurrent && (
										<Check className="size-3.5 shrink-0 text-primary" />
									)}
								</DropdownMenuItem>
							);
						})
					)}
				</DropdownMenuGroup>

				<DropdownMenuSeparator className="my-1" />

				<DropdownMenuItem
					onClick={handleCreateAndAssignSpeaker}
					className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs text-primary focus:bg-primary/10 focus:text-primary"
				>
					<Plus className="size-3.5" />
					<span>Thêm người nói mới (N{allProfiles.length + 1})</span>
				</DropdownMenuItem>

				{displayName && (
					<DropdownMenuItem
						onClick={handleClearSpeaker}
						className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
					>
						<UserMinus className="size-3.5" />
						<span>Bỏ gán người nói</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
