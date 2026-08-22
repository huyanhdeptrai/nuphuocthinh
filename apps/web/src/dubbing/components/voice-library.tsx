"use client";

import { useEffect, useMemo, useState } from "react";
import {
	Check,
	Play,
	Plus,
	Search,
	Settings2,
	Star,
	Trash2,
	Waves,
} from "lucide-react";
import { VoiceIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useMobileDrawerStore } from "@/components/editor/mobile/hooks/use-mobile-drawer";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { cn } from "@/utils/ui";
import { useDubbingStore } from "../dubbing-store";
import { useNarrationStore } from "../narration-store";
import type { TtsProvider, VoiceCatalogItem } from "../types";
import {
	fetchVoiceCatalog,
	deleteClonedVoice,
	playVoicePreview,
	stopVoicePreview,
} from "../services/tts";
import {
	filterAndSortVoices,
	type VoiceCatalogFilters,
} from "../services/voice-catalog";
import { CloneVoiceDialog } from "./clone-voice-dialog";
import { TtsProviderSettingsDialog } from "./tts-provider-settings-dialog";

type LibraryTab = "all" | "favorites" | TtsProvider;

const PROVIDERS: Array<{ id: LibraryTab; name: string }> = [
	{ id: "all", name: "Tất cả" },
	{ id: "favorites", name: "Yêu thích" },
	{ id: "edge-tts", name: "Edge TTS" },
	{ id: "capcut", name: "CapCut" },
	{ id: "vieneu", name: "VieNeu" },
	{ id: "supertonic", name: "Supertonic" },
	{ id: "omnivoice", name: "OmniVoice" },
	{ id: "elevenlabs", name: "ElevenLabs" },
	{ id: "gemini", name: "Gemini TTS" },
];

const GENDERS: Array<{
	id: VoiceCatalogFilters["gender"];
	name: string;
}> = [
	{ id: "all", name: "Mọi giới tính" },
	{ id: "female", name: "Nữ" },
	{ id: "male", name: "Nam" },
];

function providerLabel(provider: TtsProvider) {
	if (provider === "edge-tts") return "EDGE TTS";
	if (provider === "vieneu") return "VIENEU";
	if (provider === "supertonic") return "SUPERTONIC";
	if (provider === "omnivoice") return "OMNIVOICE";
	if (provider === "elevenlabs") return "ELEVENLABS";
	if (provider === "gemini") return "GEMINI";
	return "CAPCUT";
}

function genderLabel(gender: VoiceCatalogItem["gender"]) {
	if (gender === "female") return "NỮ";
	if (gender === "male") return "NAM";
	return "KHÁC";
}

function canDeleteClone(voice: VoiceCatalogItem) {
	return (
		voice.isCloned === true &&
		(voice.provider === "vieneu" ||
			voice.provider === "omnivoice" ||
			voice.provider === "gemini")
	);
}

export function VoiceLibrary() {
	const { setActiveTab: setAssetsPanelTab } = useAssetsPanelStore();
	const closeMobileDrawer = useMobileDrawerStore((state) => state.closeDrawer);
	const { settings, updateSettings, favoriteVoiceIds, toggleFavoriteVoice } =
		useDubbingStore();
	const setGlobalSpeed = useNarrationStore((state) => state.setGlobalSpeed);
	const setGlobalPitch = useNarrationStore((state) => state.setGlobalPitch);
	const [voices, setVoices] = useState<VoiceCatalogItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
	const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
	const [capcutConfigured, setCapcutConfigured] = useState(false);
	const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
	const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
	const [elevenlabsConfigured, setElevenlabsConfigured] = useState(false);
	const [geminiConfigured, setGeminiConfigured] = useState(false);
	const [omnivoiceConfigured, setOmnivoiceConfigured] = useState(false);
	const [activeTab, setActiveTab] = useState<LibraryTab>("all");
	const [filters, setFilters] = useState<VoiceCatalogFilters>({
		provider: "all",
		language: "vi-VN",
		gender: "all",
		query: "",
	});

	const applyCatalog = (result: Awaited<ReturnType<typeof fetchVoiceCatalog>>) => {
		setVoices(result.voices);
		setCapcutConfigured(result.capcutConfigured);
		setElevenlabsConfigured(result.elevenlabsConfigured);
		setGeminiConfigured(result.geminiConfigured);
		setOmnivoiceConfigured(result.omnivoiceConfigured);
	};

	const reloadVoices = async () => {
		applyCatalog(await fetchVoiceCatalog());
	};

	useEffect(() => {
		let cancelled = false;
		fetchVoiceCatalog()
			.then((result) => {
				if (!cancelled) applyCatalog(result);
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(
						error instanceof Error ? error.message : "Không thể tải kho giọng",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
			stopVoicePreview();
		};
	}, []);

	const languages = useMemo(
		() =>
			Array.from(new Set(voices.map((voice) => voice.lang)))
				.filter(Boolean)
				.sort((left, right) => left.localeCompare(right)),
		[voices],
	);

	const visibleVoices = useMemo(() => {
		const provider =
			activeTab !== "all" && activeTab !== "favorites" ? activeTab : "all";
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
	}, [activeTab, voices, favoriteVoiceIds, filters]);

	const selectedCatalogId = `${settings.voiceEngine}:${settings.selectedVoiceId}`;

	const handleSelect = (voice: VoiceCatalogItem) => {
		if (!voice.available) {
			toast.info(
				`Cần cấu hình ${providerLabel(voice.provider)} trước khi chọn giọng này.`,
			);
			return;
		}
		updateSettings({
			voiceEngine: voice.provider,
			selectedVoiceId: voice.voiceId,
		});
		if (voice.defaultRate !== undefined) {
			setGlobalSpeed(voice.defaultRate);
		}
		if (voice.defaultPitch !== undefined) {
			setGlobalPitch(voice.defaultPitch);
		}
		toast.success(
			voice.defaultRate !== undefined
				? `Đã chọn giọng ${voice.name} · ${voice.defaultRate.toFixed(2)}×`
				: `Đã chọn giọng ${voice.name}`,
		);
	};

	const handlePreview = async (voice: VoiceCatalogItem) => {
		if (!voice.available) {
			toast.info(
				`${providerLabel(voice.provider)} chưa được cấu hình nên chưa thể nghe thử.`,
			);
			return;
		}
		setPlayingVoiceId(voice.id);
		try {
			await playVoicePreview({
				text: voice.sampleText,
				options: {
					provider: voice.provider,
					voiceId: voice.voiceId,
					rate: voice.defaultRate,
					pitch: voice.defaultPitch,
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

	const handleDelete = async (voice: VoiceCatalogItem) => {
		if (voice.provider === "gemini" && voice.isCloned) {
			if (!window.confirm(`Delete Gemini TTS preset “${voice.name}”?`)) return;
			setDeletingVoiceId(voice.id);
			try {
				stopVoicePreview();
				const response = await fetch("/api/tts/gemini-presets", {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: voice.voiceId }),
				});
				if (!response.ok) throw new Error("Could not delete Gemini TTS preset.");
				if (favoriteVoiceIds.includes(voice.id)) toggleFavoriteVoice(voice.id);
				await reloadVoices();
				toast.success(`Deleted Gemini TTS preset ${voice.name}`);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Could not delete Gemini TTS preset.");
			} finally {
				setDeletingVoiceId(null);
			}
			return;
		}
		if (
			(voice.provider !== "vieneu" && voice.provider !== "omnivoice") ||
			!voice.isCloned
		) {
			return;
		}
		if (!window.confirm(`Xóa vĩnh viễn giọng clone “${voice.name}”?`)) return;
		setDeletingVoiceId(voice.id);
		try {
			stopVoicePreview();
			await deleteClonedVoice({
				provider: voice.provider,
				voiceId: voice.voiceId,
			});
			if (favoriteVoiceIds.includes(voice.id)) toggleFavoriteVoice(voice.id);
			if (selectedCatalogId === voice.id) {
				const fallback = voices.find(
					(candidate) => candidate.id !== voice.id && candidate.available && !candidate.isCloned,
				);
				if (fallback) {
					updateSettings({
						voiceEngine: fallback.provider,
						selectedVoiceId: fallback.voiceId,
					});
				}
			}
			await reloadVoices();
			toast.success(`Đã xóa giọng clone ${voice.name}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Không thể xóa giọng clone");
		} finally {
			setDeletingVoiceId(null);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (open) return;
				setAssetsPanelTab("media");
				closeMobileDrawer();
			}}
		>
			<DialogContent className="flex h-[82vh] max-w-5xl flex-col overflow-hidden p-0">
				<DialogTitle className="sr-only">Kho Mẫu Giọng</DialogTitle>
				<DialogDescription className="sr-only">
					Tìm kiếm, nghe thử và chọn giọng đọc cho phần thuyết minh.
				</DialogDescription>
				<div className="flex min-h-0 flex-1 flex-col bg-background">
					<div className="shrink-0 border-b px-3 py-3 pr-14">
						<div className="flex items-center gap-2">
							<div className="flex size-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
								<HugeiconsIcon icon={VoiceIcon} className="size-4" />
							</div>
							<div>
								<h2 className="text-sm font-semibold text-foreground">
									Kho Mẫu Giọng
								</h2>
								<p className="text-[10px] text-muted-foreground">
									Nghe thử, yêu thích và chọn giọng cho phần lồng tiếng.
								</p>
							</div>
							<Button
								variant="outline"
								size="icon"
								className="ml-auto size-7"
								aria-label="Cấu hình TTS"
								onClick={() => setSettingsDialogOpen(true)}
							>
								<Settings2 className="size-3" />
							</Button>
							<Button
								size="sm"
								className="h-7 bg-amber-500 px-2 text-[10px] text-black hover:bg-amber-400"
								onClick={() => setCloneDialogOpen(true)}
							>
								<Plus className="size-3" /> Thêm clone
							</Button>
						</div>
					</div>
					<CloneVoiceDialog
						open={cloneDialogOpen}
						onOpenChange={setCloneDialogOpen}
						onCreated={reloadVoices}
						elevenlabsConfigured={elevenlabsConfigured}
						geminiConfigured={geminiConfigured}
						omnivoiceConfigured={omnivoiceConfigured}
					/>
					<TtsProviderSettingsDialog
						open={settingsDialogOpen}
						onOpenChange={setSettingsDialogOpen}
						onChanged={reloadVoices}
					/>

					<div className="shrink-0 space-y-2 border-b p-4">
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
								className="h-9 pl-9 text-xs"
								placeholder="Tìm theo tên giọng, engine hoặc ngôn ngữ..."
							/>
						</div>

						<div>
							<p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
								Công nghệ
							</p>
							<div className="flex gap-1.5 overflow-x-auto pb-1">
								{PROVIDERS.map((provider) => (
									<Button
										key={provider.id}
										type="button"
										variant={
											activeTab === provider.id ? "secondary" : "outline"
										}
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

						<div className="grid grid-cols-2 gap-2">
							<select
								aria-label="Lọc ngôn ngữ"
								value={filters.language}
								onChange={(event) =>
									setFilters((current) => ({
										...current,
										language: event.target.value,
									}))
								}
								className="h-8 rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
							>
								<option value="all">Tất cả ngôn ngữ</option>
								{languages.map((language) => (
									<option key={language} value={language}>
										{language}
									</option>
								))}
							</select>
							<select
								aria-label="Lọc giới tính"
								value={filters.gender}
								onChange={(event) => {
									const value = event.target.value;
									const gender: VoiceCatalogFilters["gender"] =
										value === "female" ||
										value === "male" ||
										value === "unknown"
											? value
											: "all";
									setFilters((current) => ({ ...current, gender }));
								}}
								className="h-8 rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
							>
								{GENDERS.map((gender) => (
									<option key={gender.id} value={gender.id}>
										{gender.name}
									</option>
								))}
							</select>
						</div>

						<div className="flex items-center justify-between text-[9px] text-muted-foreground">
							<span>{visibleVoices.length} giọng</span>
							<span>{favoriteVoiceIds.length} yêu thích · luôn hiện đầu</span>
						</div>
					</div>

					{!capcutConfigured &&
						(activeTab === "all" || activeTab === "capcut") && (
							<div className="mx-3 mt-3 shrink-0 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-500">
								Edge TTS đã sẵn sàng. CapCut chưa nạp được Python SDK; hãy cài
								requirements-tts.txt để bật nghe thử.
							</div>
						)}
					{activeTab === "elevenlabs" && !elevenlabsConfigured && (
						<div className="mx-3 mt-3 shrink-0 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-500">
							Thêm ELEVENLABS_API_KEY vào .env.local để tải kho giọng, nghe thử
							và clone.
						</div>
					)}
					{activeTab === "gemini" && !geminiConfigured && (
						<div className="mx-3 mt-3 shrink-0 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-500">
							30 giọng Gemini đã có trong kho. Thêm GEMINI_API_KEY vào
							.env.local để nghe thử.
						</div>
					)}
					{activeTab === "omnivoice" && !omnivoiceConfigured && (
						<div className="mx-3 mt-3 shrink-0 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-500">
							Bật OmniVoice trong Cấu hình TTS. Cần NVIDIA GPU ≥ 4 GB và file
							mẫu 3–10 giây.
						</div>
					)}

					<div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto p-4">
						{isLoading ? (
							<div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
								<Spinner className="size-4" /> Đang tải kho giọng...
							</div>
						) : visibleVoices.length === 0 ? (
							<div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
								Không tìm thấy giọng phù hợp.
							</div>
						) : (
							<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
								{visibleVoices.map((voice) => {
									const isFavorite = favoriteVoiceIds.includes(voice.id);
									const isSelected = selectedCatalogId === voice.id;
									const isPlaying = playingVoiceId === voice.id;
									return (
										<div
											key={voice.id}
											className={cn(
												"min-w-0 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50",
												isSelected && "border-amber-500 bg-amber-500/5",
												!voice.available && "opacity-70",
											)}
										>
											<div className="flex items-start gap-2">
												<div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-amber-500">
													<Waves className="size-4" />
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-1">
														<p className="truncate text-xs font-semibold text-foreground">
															{voice.name}
														</p>
														{isSelected && (
															<Check className="size-3 shrink-0 text-amber-500" />
														)}
													</div>
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
												<span className="max-w-16 truncate rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground">
													{voice.lang}
												</span>
												<div className="ml-auto flex gap-1">
													{canDeleteClone(voice) && (
														<Button
															variant="ghost"
															size="icon"
															className="size-7 text-destructive hover:text-destructive"
															aria-label={`Xóa giọng clone ${voice.name}`}
															disabled={deletingVoiceId === voice.id}
															onClick={() => handleDelete(voice)}
														>
															{deletingVoiceId === voice.id ? (
																<Spinner className="size-3" />
															) : (
																<Trash2 className="size-3" />
															)}
														</Button>
													)}
													<Button
														variant="ghost"
														size="icon"
														className={cn(
															"size-7",
															isFavorite
																? "text-amber-500"
																: "text-muted-foreground",
														)}
														aria-label={
															isFavorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"
														}
														onClick={() => toggleFavoriteVoice(voice.id)}
													>
														<Star
															className={cn(
																"size-3",
																isFavorite && "fill-current",
															)}
														/>
													</Button>
													<Button
														variant="outline"
														size="icon"
														className="size-7"
														aria-label={`Nghe thử ${voice.name}`}
														disabled={isPlaying}
														onClick={() => handlePreview(voice)}
													>
														{isPlaying ? (
															<Spinner className="size-3" />
														) : (
															<Play className="size-3" />
														)}
													</Button>
													<Button
														variant={isSelected ? "secondary" : "outline"}
														className="h-7 px-2 text-[9px]"
														aria-label={`Chọn ${voice.name}`}
														onClick={() => handleSelect(voice)}
													>
														{isSelected ? "Đang dùng" : "Chọn"}
													</Button>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
