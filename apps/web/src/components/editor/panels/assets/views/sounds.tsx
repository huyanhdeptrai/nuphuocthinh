"use client";

import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSoundSearch } from "@/hooks/use-sound-search";
import { useSoundsStore } from "@/stores/sounds-store";
import type { SavedSound, SoundEffect } from "@/types/sounds";
import { cn } from "@/utils/ui";
import {
	FavouriteIcon,
	FilterMailIcon,
	Key01Icon,
	PauseIcon,
	PlayIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

// Global audio preview singleton to ensure only ONE audio plays at any time
let globalAudio: HTMLAudioElement | null = null;
let globalPlayingIdListener: ((id: number | null) => void) | null = null;

function stopGlobalAudio() {
	if (globalAudio) {
		globalAudio.pause();
		globalAudio.currentTime = 0;
		globalAudio = null;
	}
	if (globalPlayingIdListener) {
		globalPlayingIdListener(null);
	}
}

function playGlobalAudio(
	sound: SoundEffect,
	currentPlayingId: number | null,
	setPlayingId: (id: number | null) => void,
) {
	// If currently playing the same sound, pause it
	if (currentPlayingId === sound.id) {
		stopGlobalAudio();
		return;
	}

	// Stop any previously playing audio immediately
	stopGlobalAudio();

	if (!sound.previewUrl) return;

	const audio = new Audio(sound.previewUrl);
	globalAudio = audio;
	globalPlayingIdListener = setPlayingId;
	setPlayingId(sound.id);

	audio.addEventListener("ended", () => {
		if (globalAudio === audio) {
			globalAudio = null;
			setPlayingId(null);
		}
	});

	audio.addEventListener("error", () => {
		if (globalAudio === audio) {
			globalAudio = null;
			setPlayingId(null);
		}
	});

	audio.play().catch((err: DOMException) => {
		if (err.name === "AbortError") return;
		console.error("Failed to play sound:", err);
		if (globalAudio === audio) {
			globalAudio = null;
			setPlayingId(null);
		}
	});
}

const TIENGDONG_CATEGORIES = [
	{ id: "all", label: "Tất cả" },
	{ id: "am-thanh-meme", label: "Meme VN" },
	{ id: "cau-noi-viral", label: "Câu nói Viral" },
	{ id: "tieng-cuoi", label: "Tiếng cười" },
	{ id: "tieng-con-nguoi", label: "Con người" },
	{ id: "am-thanh-anime", label: "Anime" },
	{ id: "danh-nhau-vu-khi", label: "Vũ khí / Đánh nhau" },
	{ id: "tieng-thien-nhien", label: "Thiên nhiên" },
	{ id: "tieng-dong-vat", label: "Động vật" },
	{ id: "am-thanh-hung-du-ghe-so", label: "Kinh dị / Ghê sợ" },
	{ id: "tieng-do-cong-nghe", label: "Công nghệ" },
	{ id: "nhac-nen", label: "Nhạc nền" },
];

export function SoundsView() {
	const { t } = useTranslation();
	const [activeSourceTab, setActiveSourceTab] = useState<"all" | "tiengdong" | "freesound" | "saved">("all");
	const [globalSearchQuery, setGlobalSearchQuery] = useState("");
	const [playingId, setPlayingId] = useState<number | null>(null);

	// Stop audio when switching tabs
	const handleTabChange = (val: string) => {
		stopGlobalAudio();
		setActiveSourceTab(val as "all" | "tiengdong" | "freesound" | "saved");
	};

	useEffect(() => {
		return () => {
			stopGlobalAudio();
		};
	}, []);

	return (
		<div className="flex h-full flex-col">
			{/* Unified Header with Search Bar */}
			<div className="px-3 pt-3 pb-2 space-y-2 border-b">
				<div className="relative">
					<Input
						placeholder="Tìm kiếm âm thanh (Tiếng Động VN + Freesound)..."
						value={globalSearchQuery}
						onChange={(e) => setGlobalSearchQuery(e.target.value)}
						className="bg-accent h-8 text-xs pr-8"
					/>
					{globalSearchQuery && (
						<button
							type="button"
							onClick={() => setGlobalSearchQuery("")}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
						>
							✕
						</button>
					)}
				</div>

				<Tabs value={activeSourceTab} onValueChange={handleTabChange} className="w-full">
					<TabsList className="grid w-full grid-cols-4 h-7 p-0.5">
						<TabsTrigger value="all" className="text-[11px] px-1 py-1 font-medium">
							Tất cả
						</TabsTrigger>
						<TabsTrigger value="tiengdong" className="text-[11px] px-1 py-1 font-medium">
							Tiếng Động
						</TabsTrigger>
						<TabsTrigger value="freesound" className="text-[11px] px-1 py-1 font-medium">
							Freesound
						</TabsTrigger>
						<TabsTrigger value="saved" className="text-[11px] px-1 py-1 font-medium">
							{t("Saved")}
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{/* Tab Contents */}
			<div className="min-h-0 flex-1 p-3 pt-2">
				{activeSourceTab === "all" && (
					<CombinedSoundsView
						searchQuery={globalSearchQuery}
						playingId={playingId}
						setPlayingId={setPlayingId}
					/>
				)}
				{activeSourceTab === "tiengdong" && (
					<TiengDongOnlyView
						searchQuery={globalSearchQuery}
						playingId={playingId}
						setPlayingId={setPlayingId}
					/>
				)}
				{activeSourceTab === "freesound" && (
					<FreesoundOnlyView
						searchQuery={globalSearchQuery}
						playingId={playingId}
						setPlayingId={setPlayingId}
					/>
				)}
				{activeSourceTab === "saved" && (
					<SavedSoundsView
						searchQuery={globalSearchQuery}
						playingId={playingId}
						setPlayingId={setPlayingId}
					/>
				)}
			</div>
		</div>
	);
}

/** 1. Combined View (Tiếng Động + Freesound unified search) */
function CombinedSoundsView({
	searchQuery,
	playingId,
	setPlayingId,
}: {
	searchQuery: string;
	playingId: number | null;
	setPlayingId: (id: number | null) => void;
}) {
	const [tiengDongSounds, setTiengDongSounds] = useState<SoundEffect[]>([]);
	const [freesoundSounds, setFreesoundSounds] = useState<SoundEffect[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const freesoundApiKey = useSoundsStore((state) => state.freesoundApiKey);

	const fetchAll = useCallback(
		async (q: string) => {
			setIsLoading(true);
			try {
				const promises: Promise<any>[] = [];

				// 1. Fetch Tiếng Động
				const tdParams = new URLSearchParams({ page: "1" });
				if (q.trim()) tdParams.set("q", q.trim());
				promises.push(
					fetch(`/api/sounds/tiengdong?${tdParams.toString()}`)
						.then((r) => r.json())
						.then((d) => d.results || [])
						.catch(() => []),
				);

				// 2. Fetch Freesound
				const fsHeaders: Record<string, string> = {};
				if (freesoundApiKey) fsHeaders["x-freesound-api-key"] = freesoundApiKey;
				const fsUrl = q.trim()
					? `/api/sounds/search?q=${encodeURIComponent(q.trim())}&type=effects&page=1`
					: `/api/sounds/search?page_size=25&sort=downloads`;

				promises.push(
					fetch(fsUrl, { headers: fsHeaders })
						.then((r) => r.json())
						.then((d) => (d.soundsEnabled === false ? [] : d.results || []))
						.catch(() => []),
				);

				const [tdResults, fsResults] = await Promise.all(promises);
				setTiengDongSounds(tdResults);
				setFreesoundSounds(fsResults);
			} catch (err) {
				console.error("Combined search failed:", err);
			} finally {
				setIsLoading(false);
			}
		},
		[freesoundApiKey],
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			void fetchAll(searchQuery);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery, fetchAll]);

	const allSounds = [...tiengDongSounds, ...freesoundSounds];

	return (
		<div className="relative h-full overflow-hidden">
			<ScrollArea className="h-full">
				<div className="flex flex-col gap-2 pr-2">
					{isLoading && (
						<div className="py-8 text-center text-xs text-muted-foreground">
							Đang tìm kiếm trên TiếngĐộng.com và Freesound...
						</div>
					)}

					{!isLoading &&
						allSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingId === sound.id}
								onPlay={() => playGlobalAudio(sound, playingId, setPlayingId)}
							/>
						))}

					{!isLoading && allSounds.length === 0 && (
						<div className="py-8 text-center text-xs text-muted-foreground">
							{searchQuery
								? "Không tìm thấy âm thanh phù hợp."
								: "Chưa có âm thanh hiển thị."}
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

/** 2. Tiếng Động VN Only View */
function TiengDongOnlyView({
	searchQuery,
	playingId,
	setPlayingId,
}: {
	searchQuery: string;
	playingId: number | null;
	setPlayingId: (id: number | null) => void;
}) {
	const [selectedCategory, setSelectedCategory] = useState("all");
	const [sounds, setSounds] = useState<SoundEffect[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [page, setPage] = useState(1);
	const [hasNext, setHasNext] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	const fetchTiengDong = useCallback(
		async (q: string, cat: string, p: number, append = false) => {
			if (p === 1) setIsLoading(true);
			else setIsLoadingMore(true);

			try {
				const params = new URLSearchParams({ page: String(p) });
				if (q.trim()) params.set("q", q.trim());
				else if (cat && cat !== "all") params.set("category", cat);

				const res = await fetch(`/api/sounds/tiengdong?${params.toString()}`);
				if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
				const data = await res.json();

				if (append) {
					setSounds((prev) => [...prev, ...(data.results || [])]);
				} else {
					setSounds(data.results || []);
				}
				setHasNext(Boolean(data.hasNext));
			} catch (err) {
				console.error("Failed to fetch tiengdong sounds:", err);
				if (!append) setSounds([]);
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[],
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			setPage(1);
			void fetchTiengDong(searchQuery, selectedCategory, 1, false);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery, selectedCategory, fetchTiengDong]);

	const loadMore = () => {
		if (isLoadingMore || !hasNext) return;
		const nextPage = page + 1;
		setPage(nextPage);
		void fetchTiengDong(searchQuery, selectedCategory, nextPage, true);
	};

	return (
		<div className="flex h-full flex-col gap-2">
			{/* Category Chips */}
			{!searchQuery && (
				<div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hidden">
					{TIENGDONG_CATEGORIES.map((cat) => (
						<button
							key={cat.id}
							type="button"
							onClick={() => setSelectedCategory(cat.id)}
							className={cn(
								"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
								selectedCategory === cat.id
									? "bg-primary text-primary-foreground font-semibold shadow-xs"
									: "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{cat.label}
						</button>
					))}
				</div>
			)}

			{/* List */}
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="flex flex-col gap-2 pr-2">
						{isLoading && (
							<div className="py-8 text-center text-xs text-muted-foreground">
								Đang tải âm thanh từ TiếngĐộng.com...
							</div>
						)}

						{!isLoading &&
							sounds.map((sound) => (
								<AudioItem
									key={sound.id}
									sound={sound}
									isPlaying={playingId === sound.id}
									onPlay={() => playGlobalAudio(sound, playingId, setPlayingId)}
								/>
							))}

						{!isLoading && sounds.length === 0 && (
							<div className="py-8 text-center text-xs text-muted-foreground">
								Không tìm thấy âm thanh phù hợp trên TiếngĐộng.com.
							</div>
						)}

						{hasNext && !isLoading && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="mt-2 h-7 w-full text-xs"
								onClick={loadMore}
								disabled={isLoadingMore}
							>
								{isLoadingMore ? "Đang tải thêm..." : "Tải thêm âm thanh"}
							</Button>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

/** 3. Freesound Only View */
function FreesoundOnlyView({
	searchQuery,
	playingId,
	setPlayingId,
}: {
	searchQuery: string;
	playingId: number | null;
	setPlayingId: (id: number | null) => void;
}) {
	const { t } = useTranslation();
	const {
		freesoundApiKey,
		setFreesoundApiKey,
		topSoundEffects,
		isLoading,
		showCommercialOnly,
		toggleCommercialFilter,
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	} = useSoundsStore();

	const [soundsEnabled, setSoundsEnabled] = useState<boolean>(true);
	const [tempApiKey, setTempApiKey] = useState(freesoundApiKey);
	const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);

	const handleSaveKey = (key: string) => {
		const trimmed = key.trim();
		setFreesoundApiKey(trimmed);
		setTempApiKey(trimmed);
		setHasLoaded({ loaded: false });
		setSoundsEnabled(true);
		setIsKeyDialogOpen(false);
		toast.success("Đã lưu Freesound API Key");
	};

	const {
		results: searchResults,
		isLoading: isSearching,
		loadMore,
		hasNextPage,
		isLoadingMore,
	} = useSoundSearch({
		query: searchQuery,
		commercialOnly: showCommercialOnly,
		enabled: soundsEnabled,
	});

	useEffect(() => {
		if (hasLoaded) return;
		let shouldIgnore = false;

		const fetchTopSounds = async () => {
			try {
				if (!shouldIgnore) {
					setLoading({ loading: true });
					setError({ error: null });
				}

				const headers: Record<string, string> = {};
				if (freesoundApiKey) headers["x-freesound-api-key"] = freesoundApiKey;

				const response = await fetch(
					"/api/sounds/search?page_size=50&sort=downloads",
					{ headers },
				);

				if (!shouldIgnore) {
					const data = await response.json();
					if (!response.ok) {
						throw new Error(data.error || `Failed to fetch: ${response.status}`);
					}

					if (data.soundsEnabled === false) {
						setSoundsEnabled(false);
						setHasLoaded({ loaded: true });
						setTopSoundEffects({ sounds: [] });
						setHasNextPage({ hasNext: false });
						setTotalCount({ count: 0 });
						return;
					}

					setSoundsEnabled(true);
					setTopSoundEffects({ sounds: data.results });
					setHasLoaded({ loaded: true });
					setCurrentPage({ page: 1 });
					setHasNextPage({ hasNext: !!data.next });
					setTotalCount({ count: data.count });
				}
			} catch (error) {
				if (!shouldIgnore) {
					console.error("Failed to fetch top sounds:", error);
					setError({
						error: error instanceof Error ? error.message : "Failed to load sounds",
					});
				}
			} finally {
				if (!shouldIgnore) setLoading({ loading: false });
			}
		};

		const timeoutId = setTimeout(fetchTopSounds, 100);
		return () => {
			shouldIgnore = true;
			clearTimeout(timeoutId);
		};
	}, [
		hasLoaded,
		freesoundApiKey,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	]);

	const displayedSounds = searchQuery ? searchResults : topSoundEffects;

	return (
		<div className="flex h-full flex-col gap-2">
			{/* Controls */}
			<div className="flex items-center justify-between gap-2">
				<div className="text-[11px] text-muted-foreground">
					{displayedSounds.length} hiệu ứng từ Freesound.org
				</div>
				<div className="flex items-center gap-1">
					<Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
						<DialogTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn("h-7 px-2 text-[11px] gap-1", freesoundApiKey && "text-emerald-500")}
							>
								<HugeiconsIcon icon={Key01Icon} className="size-3" />
								<span>{freesoundApiKey ? "Đã có Key" : "Nhập Key"}</span>
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Cài đặt Freesound API Key</DialogTitle>
								<DialogDescription>
									Nhập API Key từ freesound.org để tải và sử dụng kho hiệu ứng âm thanh quốc tế.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3 py-2">
								<Input
									type="password"
									placeholder="Dán Freesound API Key..."
									value={tempApiKey}
									onChange={(e) => setTempApiKey(e.target.value)}
								/>
								<div className="text-xs text-muted-foreground">
									Chưa có API key?{" "}
									<a
										href="https://freesound.org/apiv2/apply/"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										Đăng ký miễn phí tại freesound.org →
									</a>
								</div>
							</div>
							<DialogFooter>
								<Button onClick={() => handleSaveKey(tempApiKey)}>Lưu API Key</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn("h-7 px-2 text-[11px] gap-1", showCommercialOnly && "text-primary")}
							>
								<HugeiconsIcon icon={FilterMailIcon} className="size-3" />
								<span>Lọc</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuCheckboxItem
								checked={showCommercialOnly}
								onCheckedChange={() => toggleCommercialFilter()}
							>
								{t("Show only commercially licensed")}
							</DropdownMenuCheckboxItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* List */}
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="flex flex-col gap-2 pr-2">
						{isLoading && !searchQuery && (
							<div className="py-8 text-center text-xs text-muted-foreground">
								{t("Loading sounds...")}
							</div>
						)}
						{isSearching && searchQuery && (
							<div className="py-8 text-center text-xs text-muted-foreground">
								{t("Searching...")}
							</div>
						)}
						{displayedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingId === sound.id}
								onPlay={() => playGlobalAudio(sound, playingId, setPlayingId)}
							/>
						))}

						{!isLoading && !soundsEnabled && displayedSounds.length === 0 && (
							<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2.5">
								<div className="flex items-center gap-2">
									<HugeiconsIcon icon={Key01Icon} className="size-4 text-amber-500" />
									<span className="text-xs font-semibold text-foreground">
										Cấu hình Freesound API Key
									</span>
								</div>
								<p className="text-[11px] text-muted-foreground leading-relaxed">
									Kho âm thanh Freesound cần API Key. Bạn có thể nhập API Key trực tiếp vào bên dưới:
								</p>
								<div className="flex items-center gap-1.5">
									<Input
										type="password"
										placeholder="Dán API Key từ freesound.org..."
										value={tempApiKey}
										onChange={(e) => setTempApiKey(e.target.value)}
										className="h-8 text-xs bg-background"
									/>
									<Button
										type="button"
										size="sm"
										className="h-8 shrink-0 text-xs"
										onClick={() => handleSaveKey(tempApiKey)}
									>
										Lưu & Tải
									</Button>
								</div>
								<a
									href="https://freesound.org/apiv2/apply/"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-block text-[11px] text-primary hover:underline"
								>
									👉 Đăng ký lấy API Key miễn phí tại freesound.org →
								</a>
							</div>
						)}

						{!isLoading && !isSearching && soundsEnabled && displayedSounds.length === 0 && (
							<div className="py-8 text-center text-xs text-muted-foreground">
								{searchQuery ? t("No sounds found") : t("No sounds available")}
							</div>
						)}

						{hasNextPage && !isLoading && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="mt-2 h-7 w-full text-xs"
								onClick={loadMore}
								disabled={isLoadingMore}
							>
								{isLoadingMore ? "Đang tải thêm..." : "Tải thêm âm thanh"}
							</Button>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

/** 4. Saved Sounds View */
function SavedSoundsView({
	searchQuery,
	playingId,
	setPlayingId,
}: {
	searchQuery: string;
	playingId: number | null;
	setPlayingId: (id: number | null) => void;
}) {
	const { t } = useTranslation();
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		clearSavedSounds,
	} = useSoundsStore();
	const [showClearDialog, setShowClearDialog] = useState(false);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	const convertToSoundEffect = (savedSound: SavedSound): SoundEffect => ({
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	});

	if (isLoadingSavedSounds) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-xs">{t("Loading saved sounds...")}</div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-destructive text-xs">
					{t("Error: {{message}}", { message: savedSoundsError })}
				</div>
			</div>
		);
	}

	const filteredSaved = searchQuery
		? savedSounds.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
		: savedSounds;

	if (filteredSaved.length === 0) {
		return (
			<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
				<HugeiconsIcon icon={FavouriteIcon} className="text-muted-foreground size-8" />
				<div className="flex flex-col gap-1 text-center">
					<p className="text-sm font-medium">{t("No saved sounds")}</p>
					<p className="text-muted-foreground text-xs text-balance">
						{t("Click the heart icon on any sound to save it here")}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-2">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-xs">
					{t("{{num}} saved {{noun}}", {
						num: filteredSaved.length,
						noun: filteredSaved.length === 1 ? t("sound") : t("sounds"),
					})}
				</p>
				<Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
					<DialogTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="text-muted-foreground hover:text-destructive h-auto !opacity-100 text-xs"
						>
							{t("Clear all")}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t("Clear all saved sounds?")}</DialogTitle>
							<DialogDescription>
								{t(
									"This will permanently remove all {{num}} saved sounds from your collection. This action cannot be undone.",
									{ num: savedSounds.length },
								)}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="text" onClick={() => setShowClearDialog(false)}>
								{t("Cancel")}
							</Button>
							<Button
								variant="destructive"
								onClick={async (e) => {
									e.stopPropagation();
									await clearSavedSounds();
									setShowClearDialog(false);
								}}
							>
								{t("Clear all sounds")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<div className="flex flex-col gap-2 pr-2">
						{filteredSaved.map((savedSound) => {
							const sound = convertToSoundEffect(savedSound);
							return (
								<AudioItem
									key={savedSound.id}
									sound={sound}
									isPlaying={playingId === sound.id}
									onPlay={() => playGlobalAudio(sound, playingId, setPlayingId)}
								/>
							);
						})}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

interface AudioItemProps {
	sound: SoundEffect;
	isPlaying: boolean;
	onPlay: () => void;
}

function AudioItem({ sound, isPlaying, onPlay }: AudioItemProps) {
	const { addSoundToTimeline, isSoundSaved, toggleSavedSound } = useSoundsStore();
	const isSaved = isSoundSaved({ soundId: sound.id });
	const isTiengDong = sound.username === "TiếngĐộng.com" || sound.tags?.includes("tiengdong");

	const handleSaveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		toggleSavedSound({ soundEffect: sound });
	};

	const handleAddToTimeline = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		const success = await addSoundToTimeline({ sound });
		if (success) {
			toast.success(`Đã thêm "${sound.name}" vào Timeline`);
		}
	};

	return (
		<div className="group flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 p-2 transition-all hover:border-border hover:bg-card">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
				onClick={onPlay}
			>
				<div className={cn(
					"relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md transition-colors",
					isPlaying
						? "bg-primary text-primary-foreground shadow-xs"
						: "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
				)}>
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-4" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-4" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-xs font-medium text-foreground">{sound.name}</p>
					<div className="flex items-center gap-1.5 mt-0.5">
						<span className={cn(
							"inline-block rounded px-1 py-0.2 text-[9px] font-semibold",
							isTiengDong
								? "bg-red-500/15 text-red-500 border border-red-500/30"
								: "bg-blue-500/15 text-blue-500 border border-blue-500/30",
						)}>
							{isTiengDong ? "Tiếng Động VN" : "Freesound"}
						</span>
						<span className="text-muted-foreground truncate text-[10px]">
							{sound.username}
						</span>
					</div>
				</div>
			</button>

			<div className="flex items-center gap-1 shrink-0">
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-muted-foreground hover:text-foreground"
					onClick={handleAddToTimeline}
					title="Thêm vào Timeline"
				>
					<HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className={cn(
						"size-7",
						isSaved ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground",
					)}
					onClick={handleSaveClick}
					title={isSaved ? "Bỏ lưu" : "Lưu yêu thích"}
				>
					<HugeiconsIcon
						icon={FavouriteIcon}
						className={cn("size-3.5", isSaved && "fill-current")}
					/>
				</Button>
			</div>
		</div>
	);
}
