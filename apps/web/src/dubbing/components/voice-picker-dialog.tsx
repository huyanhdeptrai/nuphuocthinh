"use client";

import { useMemo, useState } from "react";
import { Check, Play, Search, Star, Users, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/ui";
import { useDubbingStore } from "../dubbing-store";
import {
	filterAndSortVoices,
	type VoiceCatalogFilters,
} from "../services/voice-catalog";
import { playVoicePreview, stopVoicePreview } from "../services/tts";
import type { TtsProvider, VoiceCatalogItem } from "../types";
import type { SynthesizeOptions } from "../services/tts";

type PickerTab = "all" | "favorites" | TtsProvider;

const PROVIDERS: Array<{ id: PickerTab; name: string }> = [
	{ id: "all", name: "Tất cả" },
	{ id: "favorites", name: "Yêu thích" },
	{ id: "capcut", name: "CapCut" },
	{ id: "edge-tts", name: "Edge TTS" },
	{ id: "vieneu", name: "VieNeu" },
	{ id: "supertonic", name: "Supertonic" },
	{ id: "omnivoice", name: "OmniVoice" },
	{ id: "elevenlabs", name: "ElevenLabs" },
	{ id: "gemini", name: "Gemini" },
];

function providerLabel(provider: TtsProvider) {
	return PROVIDERS.find((item) => item.id === provider)?.name ?? provider;
}

function genderLabel(gender: VoiceCatalogItem["gender"]) {
	if (gender === "female") return "Nữ";
	if (gender === "male") return "Nam";
	return "Khác";
}

export function VoicePickerDialog({
	open,
	onOpenChange,
	speakerName,
	voices,
	selectedVoiceId,
	previewAdjustments,
	onSelect,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	speakerName: string;
	voices: VoiceCatalogItem[];
	selectedVoiceId?: string;
	previewAdjustments?: Pick<SynthesizeOptions, "rate" | "pitch">;
	onSelect: (voice: VoiceCatalogItem) => void;
}) {
	const { favoriteVoiceIds, toggleFavoriteVoice } = useDubbingStore();
	const [activeTab, setActiveTab] = useState<PickerTab>("all");
	const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
	const [filters, setFilters] = useState<VoiceCatalogFilters>({
		provider: "all",
		language: "vi-VN",
		gender: "all",
		query: "",
	});

	const languages = useMemo(
		() =>
			Array.from(new Set(voices.map((voice) => voice.lang)))
				.filter(Boolean)
				.sort((left, right) => left.localeCompare(right)),
		[voices],
	);

	const visibleVoices = useMemo(() => {
		const provider =
			activeTab === "all" || activeTab === "favorites" ? "all" : activeTab;
		const result = filterAndSortVoices({
			voices,
			favoriteVoiceIds,
			filters: { ...filters, provider },
		});
		const tabVoices =
			activeTab === "favorites"
				? result.filter((voice) => favoriteVoiceIds.includes(voice.id))
				: result;
		return Array.from(
			new Map(tabVoices.map((voice) => [voice.id, voice])).values(),
		);
	}, [activeTab, favoriteVoiceIds, filters, voices]);

	const handlePreview = async (voice: VoiceCatalogItem) => {
		setPlayingVoiceId(voice.id);
		try {
			await playVoicePreview({
				text: voice.sampleText,
				options: {
					provider: voice.provider,
					voiceId: voice.voiceId,
					rate: previewAdjustments?.rate ?? voice.defaultRate,
					pitch: previewAdjustments?.pitch ?? voice.defaultPitch,
					volumeGain: voice.defaultVolumeGain,
				},
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể nghe thử giọng",
			);
		} finally {
			setPlayingVoiceId(null);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) stopVoicePreview();
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="flex h-[82vh] max-w-5xl flex-col overflow-hidden p-0">
				<DialogHeader className="shrink-0 border-b p-4">
					<DialogTitle className="flex items-center gap-2 text-base">
						<Users className="size-4 text-amber-500" />
						Chọn giọng đọc
						<span className="font-normal text-muted-foreground">
							· {speakerName}
						</span>
					</DialogTitle>
					<DialogDescription className="sr-only">
						Tìm kiếm, nghe thử và chọn giọng đọc cho {speakerName}.
					</DialogDescription>
				</DialogHeader>

				<div className="shrink-0 space-y-2 border-b p-4">
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_150px]">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={filters.query}
								onChange={(event) =>
									setFilters((current) => ({
										...current,
										query: event.target.value,
									}))
								}
								placeholder="Tìm theo tên, ngôn ngữ, vùng miền..."
								className="h-9 pl-9 text-xs"
							/>
						</div>
						<select
							aria-label="Lọc ngôn ngữ trong popup chọn giọng"
							value={filters.language}
							onChange={(event) =>
								setFilters((current) => ({
									...current,
									language: event.target.value,
								}))
							}
							className="h-9 rounded-md border bg-background px-2 text-xs"
						>
							<option value="all">Tất cả ngôn ngữ</option>
							{languages.map((language) => (
								<option key={language} value={language}>
									{language}
								</option>
							))}
						</select>
						<select
							aria-label="Lọc giới tính trong popup chọn giọng"
							value={filters.gender}
							onChange={(event) => {
								const value = event.target.value;
								setFilters((current) => ({
									...current,
									gender:
										value === "female" || value === "male" ? value : "all",
								}));
							}}
							className="h-9 rounded-md border bg-background px-2 text-xs"
						>
							<option value="all">Mọi giới tính</option>
							<option value="female">Nữ</option>
							<option value="male">Nam</option>
						</select>
					</div>

					<div className="flex gap-1.5 overflow-x-auto pb-1">
						{PROVIDERS.map((provider) => (
							<Button
								key={provider.id}
								type="button"
								variant={activeTab === provider.id ? "secondary" : "outline"}
								className={cn(
									"h-7 shrink-0 rounded-full px-3 text-[10px]",
									activeTab === provider.id &&
										"border-amber-500/50 bg-amber-500/10 text-amber-500",
								)}
								onClick={() => setActiveTab(provider.id)}
							>
								{provider.id === "favorites" && <Star className="size-3" />}
								{provider.name}
							</Button>
						))}
					</div>
				</div>

				<DialogBody className="min-h-0 flex-1 overflow-y-auto p-4">
					{visibleVoices.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Không tìm thấy giọng phù hợp.
						</div>
					) : (
						<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
							{visibleVoices.map((voice) => {
								const selected = voice.id === selectedVoiceId;
								const favorite = favoriteVoiceIds.includes(voice.id);
								const playing = playingVoiceId === voice.id;
								return (
									<div
										key={voice.id}
										className={cn(
											"rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40",
											selected && "border-amber-500 bg-amber-500/5",
										)}
									>
										<div className="flex items-start gap-2">
											<div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-amber-500">
												<Waves className="size-4" />
											</div>
											<div className="min-w-0 flex-1">
												<p className="flex items-center gap-1 truncate text-xs font-semibold">
													{voice.name}
													{selected && (
														<Check className="size-3 text-amber-500" />
													)}
												</p>
												<p className="truncate text-[9px] text-muted-foreground">
													{voice.region || voice.lang}
												</p>
											</div>
											<span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-500">
												{providerLabel(voice.provider)}
											</span>
										</div>

										<div className="mt-3 flex items-center gap-1">
											<span className="rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground">
												{genderLabel(voice.gender)}
											</span>
											<span className="rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground">
												{voice.lang}
											</span>
											<div className="ml-auto flex gap-1">
												<Button
													variant="ghost"
													size="icon"
													className={cn("size-7", favorite && "text-amber-500")}
													aria-label={
														favorite
															? `Bỏ yêu thích ${voice.name}`
															: `Yêu thích ${voice.name}`
													}
													onClick={() => toggleFavoriteVoice(voice.id)}
												>
													<Star
														className={cn("size-3", favorite && "fill-current")}
													/>
												</Button>
												<Button
													variant="outline"
													size="icon"
													className="size-7"
													aria-label={`Nghe thử ${voice.name}`}
													disabled={playing}
													onClick={() => void handlePreview(voice)}
												>
													{playing ? (
														<Spinner className="size-3" />
													) : (
														<Play className="size-3" />
													)}
												</Button>
												<Button
													variant={selected ? "secondary" : "outline"}
													className="h-7 px-2 text-[9px]"
													onClick={() => {
														onSelect(voice);
														onOpenChange(false);
													}}
												>
													{selected ? "Đang dùng" : "Chọn"}
												</Button>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
