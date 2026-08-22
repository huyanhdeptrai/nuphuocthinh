"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/hooks/use-editor";
import { mediaTimeFromSeconds } from "@/dubbing/adapters/time";
import { findRecognitionCueElementRef } from "@/dubbing/services/cue-timeline-selection";
import { syncCueTextToTimeline } from "@/dubbing/services/timeline-caption-sync";
import {
	buildSourceTimelineCaptions,
	buildTranslatedTimelineCaptions,
	hasCompleteTranslations,
} from "@/dubbing/services/translated-timeline-captions";
import {
	insertCaptionChunksAsTextTrack,
	removeGeneratedCjkCaptionTracks,
} from "@/dubbing/adapters/captions";
import { parseSrtRecognitionCues } from "@/dubbing/services/srt";
import { applyCueTimingOffsets } from "@/dubbing/services/cue-timing";
import { useDubbingStore } from "@/dubbing/dubbing-store";
import { useTranslationStore } from "@/dubbing/translation-store";
import {
	translateSingleCue,
	generateSingleCueTts,
} from "@/dubbing/services/single-cue-actions";
import { narrationCueIdFromElementName } from "@/dubbing/services/narration-timing";
import { SpeakerSelectDropdown } from "@/dubbing/components/speaker-select-dropdown";
import type { TextTrack } from "@/types/timeline";
import type { RecognitionCue } from "@/dubbing/types";
import { cn } from "@/utils/ui";
import {
	ClosedCaptionIcon,
	Delete01Icon,
	Download01Icon,
	FileUploadIcon,
	SparklesIcon,
	TranslateIcon,
	VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
	{ code: "auto", label: "Tự động" },
	{ code: "en", label: "English" },
	{ code: "vi", label: "Tiếng Việt" },
	{ code: "zh", label: "中文" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
	{ code: "es", label: "Español" },
	{ code: "fr", label: "Français" },
	{ code: "de", label: "Deutsch" },
] as const;

function formatTime(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const secs = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function downloadSrt({
	cues,
	getText,
	name,
}: {
	cues: ReturnType<typeof useDubbingStore.getState>["extractedCues"];
	getText: (id: string, fallback: string) => string;
	name: string;
}) {
	const content = cues
		.map(
			(cue, index) =>
				`${index + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${getText(cue.id, cue.text)}\n`,
		)
		.join("\n");
	const url = URL.createObjectURL(
		new Blob([content], { type: "text/plain;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	URL.revokeObjectURL(url);
}

type TimelineCueSnapshot = {
	startTime: number;
	endTime: number;
	content: string;
};

function getTrackCueSnapshots({
	tracks,
	trackId,
}: {
	tracks: ReturnType<ReturnType<typeof useEditor>["timeline"]["getTracks"]>;
	trackId: string | null;
}): TimelineCueSnapshot[] {
	if (!trackId) return [];
	const track = tracks.find((candidate) => candidate.id === trackId);
	if (track?.type !== "text") return [];
	return track.elements.map((element) => ({
		startTime: element.startTime,
		endTime: element.startTime + element.duration,
		content: element.content,
	}));
}

function SpeakerNameInput({
	speakerKey,
	name,
	color,
	onCommit,
}: {
	speakerKey: string;
	name: string;
	color?: string;
	onCommit: (input: { speakerKey: string; name: string }) => void;
}) {
	const [draft, setDraft] = useState(name);

	useEffect(() => setDraft(name), [name]);

	const commit = () => {
		const nextName = draft.trim();
		if (nextName && nextName !== name) {
			onCommit({ speakerKey, name: nextName });
		} else {
			setDraft(name);
		}
	};

	return (
		<input
			value={draft}
			onClick={(event) => event.stopPropagation()}
			onChange={(event) => setDraft(event.target.value)}
			onFocus={(event) => event.target.select()}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					setDraft(name);
					event.currentTarget.blur();
				}
			}}
			className="h-4.5 w-6 min-w-[22px] max-w-[36px] shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-0.5 text-center font-mono text-[8px] font-bold leading-none transition-colors hover:border-emerald-500/80 focus:bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
			style={
				color
					? {
							color,
							borderColor: `${color}80`,
							backgroundColor: `${color}15`,
						}
					: undefined
			}
			title="Nhấp để sửa tên phân vai"
			aria-label={`Sửa tên phân vai ${name}`}
		/>
	);
}

function CueTimeInput({
	value,
	onChange,
	label,
}: {
	value: number;
	onChange: (value: number) => void;
	label: string;
}) {
	const [draft, setDraft] = useState(value.toFixed(2));

	useEffect(() => setDraft(value.toFixed(2)), [value]);

	const commit = (nextValue: number) => {
		const safeValue = Math.max(0, Math.round(nextValue * 100) / 100);
		onChange(safeValue);
		setDraft(safeValue.toFixed(2));
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={draft}
			onClick={(event) => event.stopPropagation()}
			onChange={(event) => setDraft(event.target.value)}
			onFocus={(event) => event.target.select()}
			onBlur={() => {
				const parsed = Number(draft.replace(",", "."));
				if (Number.isFinite(parsed)) commit(parsed);
				else setDraft(value.toFixed(2));
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "ArrowUp") {
					event.preventDefault();
					commit(value + 0.05);
				}
				if (event.key === "ArrowDown") {
					event.preventDefault();
					commit(value - 0.05);
				}
			}}
			onWheel={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (event.deltaY < 0) {
					commit(value + 0.05);
				} else {
					commit(value - 0.05);
				}
			}}
			className="h-4.5 w-[35px] shrink-0 rounded border border-border/80 bg-background px-0.5 text-center font-mono text-[9.5px] font-bold text-foreground shadow-2xs transition-colors hover:border-primary/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			title={`${label} (Bấm để gõ, cuộn chuột hoặc bấm phím Lên/Xuống để tăng giảm)`}
			aria-label={label}
		/>
	);
}

export function SubtitlePanel() {
	const editor = useEditor();
	const inputRef = useRef<HTMLInputElement>(null);
	const [sourceTrackId, setSourceTrackId] = useState<string | null>(null);
	const [translatedTrackId, setTranslatedTrackId] = useState<string | null>(
		null,
	);
	const [timelineRevision, setTimelineRevision] = useState(0);
	const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
	const [translatingCueIds, setTranslatingCueIds] = useState<
		Record<string, boolean>
	>({});
	const [generatingTtsCueIds, setGeneratingTtsCueIds] = useState<
		Record<string, boolean>
	>({});

	const cueCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const isSelectingFromPanelRef = useRef(false);
	const isUpdatingFromPanelRef = useRef(false);
	const timelineSnapshotRef = useRef<{
		source: TimelineCueSnapshot[];
		translated: TimelineCueSnapshot[];
	} | null>(null);
	const {
		extractedCues,
		extractedLanguage,
		setExtractedLanguage,
		setExtractedCues,
		updateExtractedCue,
		speakerProfiles,
		setSpeakerProfiles,
		renameSpeaker,
		settings,
	} = useDubbingStore();
	const {
		targetLanguage,
		updateConfig,
		translations,
		setTranslations,
		setTranslation,
		clearTranslations,
	} = useTranslationStore();

	const canApplyTranslation = hasCompleteTranslations({
		cues: extractedCues,
		translations,
	});
	const speakerNames = useMemo(
		() => new Map(speakerProfiles.map((profile) => [profile.id, profile.name])),
		[speakerProfiles],
	);

	useEffect(() => {
		const notify = () => setTimelineRevision((revision) => revision + 1);
		const unsubscribeTimeline = editor.timeline.subscribe(notify);
		const unsubscribeScenes = editor.scenes.subscribe(notify);
		return () => {
			unsubscribeTimeline();
			unsubscribeScenes();
		};
	}, [editor]);

	// Danh sách các cueId đã có audio clip thuyết minh trên timeline
	const ttsCueIds = useMemo(() => {
		if (!editor) return new Set<string>();
		const tracks = editor.timeline.getTracks();
		const ids = new Set<string>();
		for (const track of tracks) {
			if (track.type === "audio") {
				for (const element of track.elements) {
					const cueId = narrationCueIdFromElementName(element.name);
					if (cueId) {
						ids.add(cueId);
					}
				}
			}
		}
		return ids;
	}, [editor, timelineRevision]);

	// Sync selection from Timeline -> Subtitles Panel: Highlight and scroll into center
	useEffect(() => {
		const handleSelectionChange = () => {
			if (!editor || isSelectingFromPanelRef.current) return;
			const selected = editor.selection.getSelectedElements();
			if (selected.length === 0) return;
			const firstSelected = selected[0];
			const tracks = editor.timeline.getTracks();
			const track = tracks.find((t) => t.id === firstSelected.trackId);
			const element = track?.elements.find(
				(el) => el.id === firstSelected.elementId,
			);
			if (element && track?.type === "text") {
				const cueIndex = extractedCues.findIndex(
					(cue) => Math.abs(cue.startTime - element.startTime) < 0.05,
				);
				if (cueIndex >= 0) {
					const matchedCue = extractedCues[cueIndex];
					setSelectedCueId(matchedCue.id);
					const cardEl = cueCardRefs.current[matchedCue.id];
					if (cardEl) {
						cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
					}
				}
			}
		};

		const unsubscribeSelection = editor.selection.subscribe(
			handleSelectionChange,
		);
		return () => {
			unsubscribeSelection();
		};
	}, [editor, extractedCues]);

	useEffect(() => {
		if (isUpdatingFromPanelRef.current) return;
		const tracks = editor.timeline.getTracks();
		const validSourceTrack = sourceTrackId
			? tracks.find((t) => t.id === sourceTrackId && t.type === "text")
			: null;
		const validTranslatedTrack =
			translatedTrackId && translatedTrackId !== sourceTrackId
				? tracks.find((t) => t.id === translatedTrackId && t.type === "text")
				: null;

		if (!validSourceTrack && !validTranslatedTrack) {
			timelineSnapshotRef.current = null;
			return;
		}

		const current = {
			source: validSourceTrack
				? getTrackCueSnapshots({ tracks, trackId: validSourceTrack.id })
				: [],
			translated: validTranslatedTrack
				? getTrackCueSnapshots({ tracks, trackId: validTranslatedTrack.id })
				: [],
		};
		const previous = timelineSnapshotRef.current;
		timelineSnapshotRef.current = current;
		if (!previous) return;

		// 1. Sync changes from SOURCE track on timeline -> extractedCues (timing & text)
		if (validSourceTrack && previous.source.length === current.source.length) {
			let cuesModified = false;
			const nextCues = extractedCues.map((cue, index) => {
				const curr = current.source[index];
				const prev = previous.source[index];
				if (!curr || !prev) return cue;

				const timeChanged =
					curr.startTime !== prev.startTime || curr.endTime !== prev.endTime;
				const contentChanged = curr.content !== prev.content;

				if (timeChanged || contentChanged) {
					cuesModified = true;
					return {
						...cue,
						startTime: curr.startTime,
						endTime: curr.endTime,
						text: contentChanged ? curr.content : cue.text,
					};
				}
				return cue;
			});

			if (cuesModified) {
				setExtractedCues(nextCues);
			}
		}

		// 2. Sync changes from TRANSLATED track on timeline -> translations store
		if (
			validTranslatedTrack &&
			previous.translated.length === current.translated.length
		) {
			current.translated.forEach((curr, index) => {
				const prev = previous.translated[index];
				const cue = extractedCues[index];
				if (!curr || !prev || !cue) return;

				// ONLY update translation if this specific element changed on the timeline
				if (curr.content !== prev.content) {
					setTranslation({ id: cue.id, text: curr.content });
				}
			});

			// If source track is not on timeline, sync timing from translated track
			if (!validSourceTrack) {
				let timingModified = false;
				const nextCues = extractedCues.map((cue, index) => {
					const curr = current.translated[index];
					const prev = previous.translated[index];
					if (!curr || !prev) return cue;

					if (
						curr.startTime !== prev.startTime ||
						curr.endTime !== prev.endTime
					) {
						timingModified = true;
						return {
							...cue,
							startTime: curr.startTime,
							endTime: curr.endTime,
						};
					}
					return cue;
				});
				if (timingModified) {
					setExtractedCues(nextCues);
				}
			}
		}
	}, [
		editor,
		extractedCues,
		setExtractedCues,
		setTranslation,
		sourceTrackId,
		timelineRevision,
		translatedTrackId,
	]);

	const selectCue = (index: number) => {
		const cue = extractedCues[index];
		if (!cue || !editor) return;
		setSelectedCueId(cue.id);
		const cardEl = cueCardRefs.current[cue.id];
		if (cardEl) {
			cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
		}

		isSelectingFromPanelRef.current = true;
		const cueStartTime = mediaTimeFromSeconds({ seconds: cue.startTime });
		const ref = findRecognitionCueElementRef({
			tracks: editor.timeline.getTracks(),
			cue,
			cueIndex: index,
			cueStartTime,
			preferredTrackId: sourceTrackId ?? translatedTrackId,
		});
		editor.playback.seek({ time: cueStartTime });
		if (ref) editor.selection.setSelectedElements({ elements: [ref] });
		setTimeout(() => {
			isSelectingFromPanelRef.current = false;
		}, 100);
	};

	const applySource = () => {
		if (!editor || extractedCues.length === 0) return;
		const trackId = insertCaptionChunksAsTextTrack({
			editor,
			captions: buildSourceTimelineCaptions({
				cues: extractedCues,
				timingOffsets: {
					cueLeadSeconds: settings.cueLeadSeconds,
					cueTailSeconds: settings.cueTailSeconds,
				},
				profiles: speakerProfiles,
			}),
		});
		setSourceTrackId(trackId);
		toast.success("Đã đưa phụ đề gốc vào Timeline.");
	};

	const applyTranslation = () => {
		if (!editor || !canApplyTranslation) return;
		removeGeneratedCjkCaptionTracks({ editor });
		// A translation is an alternative to the source captions, not an
		// additional subtitle layer. Remove only tracks this panel created.
		if (sourceTrackId) {
			editor.timeline.removeTrack({ trackId: sourceTrackId });
			setSourceTrackId(null);
		}
		if (translatedTrackId) {
			editor.timeline.removeTrack({ trackId: translatedTrackId });
		}
		const trackId = insertCaptionChunksAsTextTrack({
			editor,
			captions: buildTranslatedTimelineCaptions({
				cues: extractedCues,
				translations,
				timingOffsets: {
					cueLeadSeconds: settings.cueLeadSeconds,
					cueTailSeconds: settings.cueTailSeconds,
				},
				profiles: speakerProfiles,
			}),
		});
		setTranslatedTrackId(trackId);
		toast.success("Đã đưa phụ đề dịch vào Timeline.");
	};

	const updateCueTiming = ({
		index,
		field,
		value,
	}: {
		index: number;
		field: "startTime" | "endTime";
		value: number;
	}) => {
		const cue = extractedCues[index];
		if (!cue || !Number.isFinite(value)) return;
		const startTime =
			field === "startTime" ? Math.max(0, value) : cue.startTime;
		const endTime =
			field === "endTime" ? Math.max(startTime + 0.01, value) : cue.endTime;

		isUpdatingFromPanelRef.current = true;
		setExtractedCues(
			extractedCues.map((item, cueIndex) =>
				cueIndex === index ? { ...item, startTime, endTime } : item,
			),
		);

		if (!editor) {
			isUpdatingFromPanelRef.current = false;
			return;
		}

		const adjustedTiming = applyCueTimingOffsets({
			startTime,
			endTime,
			cueLeadSeconds: settings.cueLeadSeconds,
			cueTailSeconds: settings.cueTailSeconds,
		});
		const adjustedStart = adjustedTiming.startTime;
		const adjustedDuration = Math.max(
			0.05,
			adjustedTiming.endTime - adjustedTiming.startTime,
		);

		const allTracks = editor.timeline.getTracks();
		const textTracks = allTracks.filter(
			(t): t is TextTrack => t.type === "text",
		);
		const expectedSuffix = `Caption ${index + 1}`;
		const updates: Array<{
			trackId: string;
			elementId: string;
			updates: { startTime: number; duration: number };
		}> = [];

		for (const track of textTracks) {
			const isKnownTrack =
				track.id === sourceTrackId || track.id === translatedTrackId;

			// 1. Tìm theo tên caption (ví dụ "[N1] Caption 3" hoặc "Caption 3")
			let element = track.elements.find(
				(el) =>
					el.name === expectedSuffix ||
					el.name.endsWith(` ${expectedSuffix}`) ||
					el.name.endsWith(`] ${expectedSuffix}`) ||
					el.name.includes(`Caption ${index + 1}`),
			);

			// 2. Nếu không có theo tên, kiểm tra theo index trong track phụ đề đã biết
			if (!element && isKnownTrack && track.elements[index]) {
				element = track.elements[index];
			}

			// 3. Fallback: tìm theo vị trí thời gian gần với cue ban đầu
			if (!element) {
				element = track.elements.find(
					(el) =>
						Math.abs(el.startTime - cue.startTime) < 0.25 ||
						Math.abs(
							el.startTime - (cue.startTime - (settings.cueLeadSeconds ?? 0)),
						) < 0.25,
				);
			}

			if (element) {
				updates.push({
					trackId: track.id,
					elementId: element.id,
					updates: {
						startTime: adjustedStart,
						duration: adjustedDuration,
					},
				});
			}
		}

		if (updates.length > 0) {
			editor.timeline.updateElements({ updates, pushHistory: false });
		}

		setTimeout(() => {
			isUpdatingFromPanelRef.current = false;
		}, 50);
	};

	const clearAllCues = () => {
		setExtractedCues([]);
		clearTranslations();
		setSpeakerProfiles([]);
		setSourceTrackId(null);
		setTranslatedTrackId(null);
		setSelectedCueId(null);
		toast.success("Đã xóa tất cả phụ đề.");
	};

	const commitSpeakerName = ({
		speakerKey,
		name,
	}: {
		speakerKey: string;
		name: string;
	}) => {
		renameSpeaker({ speakerId: speakerKey, name });
		if (!editor) return;

		const allTracks = editor.timeline.getTracks();
		const textTracks = allTracks.filter(
			(t): t is TextTrack => t.type === "text",
		);
		const updates: Array<{
			trackId: string;
			elementId: string;
			updates: {
				name?: string;
				subtitleSpeaker?: { id: string; name: string; color: string };
			};
		}> = [];

		for (const track of textTracks) {
			for (const [cueIdx, cueItem] of extractedCues.entries()) {
				const cueSpeakerKey =
					cueItem.speakerId ?? cueItem.speakerName ?? cueItem.speaker;
				if (cueSpeakerKey !== speakerKey) continue;
				const expectedSuffix = `Caption ${cueIdx + 1}`;
				const element =
					track.elements.find(
						(el) =>
							el.name === expectedSuffix ||
							el.name.endsWith(` ${expectedSuffix}`) ||
							el.name.endsWith(`] ${expectedSuffix}`) ||
							el.name.includes(`Caption ${cueIdx + 1}`),
					) ?? track.elements[cueIdx];

				if (element) {
					updates.push({
						trackId: track.id,
						elementId: element.id,
						updates: {
							name: `[${name}] Caption ${cueIdx + 1}`,
							subtitleSpeaker: {
								id: cueItem.speakerId ?? speakerKey,
								name,
								color: cueItem.speakerColor ?? "#60a5fa",
							},
						},
					});
				}
			}
		}

		if (updates.length > 0) {
			editor.timeline.updateElements({ updates, pushHistory: false });
		}
	};

	const importSrt = async (file?: File) => {
		if (!file) return;
		try {
			const imported = parseSrtRecognitionCues(await file.text());
			const matchesSource =
				extractedCues.length === imported.length &&
				extractedCues.every(
					(cue, index) =>
						Math.abs(cue.startTime - imported[index].startTime) < 0.05 &&
						Math.abs(cue.endTime - imported[index].endTime) < 0.05,
				);

			const fileLanguage = LANGUAGES.find(
				(language) =>
					language.code !== "auto" &&
					file.name.toLowerCase().includes(language.code),
			)?.code;
			const isSameSource =
				matchesSource &&
				extractedCues.every(
					(cue, index) => cue.text.trim() === imported[index].text.trim(),
				);
			const isSourceFile = fileLanguage === extractedLanguage;
			const isTranslationFile = fileLanguage === targetLanguage;
			const importAsTranslation =
				(isSameSource === false && matchesSource && !isSourceFile) ||
				(isTranslationFile && extractedCues.length > 0);
			if (importAsTranslation) {
				setTranslatedTrackId(null);
				setTranslations(
					imported.map((cue, index) => ({
						id: extractedCues[index]?.id ?? cue.id,
						text: cue.text,
					})),
				);
				if (fileLanguage) updateConfig({ targetLanguage: fileLanguage });
				toast.success(`Đã nhận ${imported.length} câu là bản dịch.`);
			} else {
				setSourceTrackId(null);
				setTranslatedTrackId(null);
				setExtractedCues(imported);
				setSpeakerProfiles([]);
				clearTranslations();
				if (fileLanguage) setExtractedLanguage(fileLanguage);
				toast.success(`Đã nhận ${imported.length} câu là ngôn ngữ gốc.`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể đọc file SRT.",
			);
		} finally {
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	const handleTranslateSingleCue = async (
		cue: RecognitionCue,
		index: number,
	) => {
		setTranslatingCueIds((prev) => ({ ...prev, [cue.id]: true }));
		try {
			const translated = await translateSingleCue({
				cue,
				cueIndex: index,
				editor,
				preferredTrackId: translatedTrackId,
			});
			toast.success(
				`Đã dịch câu #${index + 1}: "${translated.slice(0, 25)}${translated.length > 25 ? "..." : ""}"`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : `Lỗi dịch câu #${index + 1}`,
			);
		} finally {
			setTranslatingCueIds((prev) => {
				const next = { ...prev };
				delete next[cue.id];
				return next;
			});
		}
	};

	const handleGenerateTtsSingleCue = async (
		cue: RecognitionCue,
		index: number,
	) => {
		if (!editor) return;
		setGeneratingTtsCueIds((prev) => ({ ...prev, [cue.id]: true }));
		try {
			await generateSingleCueTts({
				cue,
				cueIndex: index,
				editor,
			});
			toast.success(`Đã tạo TTS câu #${index + 1} và đưa vào timeline.`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: `Lỗi tạo TTS câu #${index + 1}`,
			);
		} finally {
			setGeneratingTtsCueIds((prev) => {
				const next = { ...prev };
				delete next[cue.id];
				return next;
			});
		}
	};

	const seekCueTts = (cue: RecognitionCue, index: number) => {
		if (!editor) return;
		setSelectedCueId(cue.id);
		const cueStartTime = mediaTimeFromSeconds({ seconds: cue.startTime });
		editor.playback.seek({ time: cueStartTime });

		const tracks = editor.timeline.getTracks();
		for (const track of tracks) {
			if (track.type === "audio") {
				const el = track.elements.find(
					(element) => narrationCueIdFromElementName(element.name) === cue.id,
				);
				if (el) {
					editor.selection.setSelectedElements({
						elements: [{ trackId: track.id, elementId: el.id }],
					});
					toast.info(
						`Đã chọn đoạn âm thanh TTS câu #${index + 1} trên timeline`,
					);
					return;
				}
			}
		}
	};

	return (
		<div className="panel bg-background @container flex h-full min-w-0 flex-col overflow-hidden rounded-sm border">
			<div className="flex shrink-0 items-center justify-between border-b bg-card/50 px-2 py-1.5">
				<div className="flex min-w-0 items-center gap-2">
					<HugeiconsIcon
						icon={ClosedCaptionIcon}
						className="size-4 text-blue-500"
					/>
					<span className="truncate text-sm font-semibold">Phụ đề</span>
					<Badge variant="outline" className="shrink-0 text-[9px]">
						{extractedCues.length} câu
					</Badge>
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
					<input
						ref={inputRef}
						type="file"
						accept=".srt,application/x-subrip,text/plain"
						className="hidden"
						onChange={(event) => void importSrt(event.target.files?.[0])}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-1.5 text-[9px]"
						onClick={() => inputRef.current?.click()}
						title="Nhập SRT"
					>
						<HugeiconsIcon icon={FileUploadIcon} className="size-3" /> Nhập
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-1.5 text-[9px]"
						onClick={() =>
							downloadSrt({
								cues: extractedCues,
								getText: (_id, text) => text,
								name: "subtitles-source.srt",
							})
						}
						disabled={!extractedCues.length}
						title="Xuất phụ đề gốc"
					>
						<HugeiconsIcon icon={Download01Icon} className="size-3" /> Gốc
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-1.5 text-[9px]"
						onClick={() =>
							downloadSrt({
								cues: extractedCues,
								getText: (id, text) => translations[id] || text,
								name: "subtitles-translated.srt",
							})
						}
						disabled={!canApplyTranslation}
						title="Xuất phụ đề đã dịch"
					>
						<HugeiconsIcon icon={Download01Icon} className="size-3" /> Dịch
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 gap-0.5 px-1 text-[9px] font-semibold text-red-500 hover:bg-red-500/10 hover:text-red-600"
						onClick={clearAllCues}
						disabled={
							extractedCues.length === 0 && !Object.keys(translations).length
						}
						title="Xóa toàn bộ danh sách phụ đề"
					>
						<HugeiconsIcon icon={Delete01Icon} className="size-3" /> Xóa tất cả
					</Button>
				</div>
			</div>

			<div
				className={cn(
					"min-h-0 flex-1 overflow-y-auto p-1",
					extractedCues.length === 0
						? "flex items-center justify-center"
						: "grid grid-cols-1 @min-[380px]:grid-cols-2 @min-[750px]:grid-cols-3 gap-1 auto-rows-max content-start",
				)}
			>
				{extractedCues.length === 0 ? (
					<div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
						Chưa có phụ đề.
						<br />
						Nhận dạng hoặc nhập SRT để bắt đầu.
					</div>
				) : (
					extractedCues.map((cue, index) => {
						const isSelected = selectedCueId === cue.id;
						const speakerKey = cue.speakerId ?? cue.speakerName ?? cue.speaker;
						const speakerName = cue.speakerId
							? (speakerNames.get(cue.speakerId) ??
								cue.speakerName ??
								cue.speaker)
							: (cue.speakerName ?? cue.speaker);
						const hasTts = ttsCueIds.has(cue.id);
						const isTranslatingThisCue = Boolean(translatingCueIds[cue.id]);
						const isGeneratingTtsThisCue = Boolean(generatingTtsCueIds[cue.id]);

						return (
							<div
								key={cue.id}
								ref={(el) => {
									cueCardRefs.current[cue.id] = el;
								}}
								role="button"
								tabIndex={0}
								onClick={() => selectCue(index)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ")
										selectCue(index);
								}}
								className={cn(
									"space-y-1 rounded-md border p-1.5 text-xs transition-all duration-150",
									isSelected
										? "border-primary bg-primary/10 ring-2 ring-primary/60 shadow-sm"
										: "border-border/60 bg-card hover:border-border hover:bg-muted/40",
								)}
								style={
									cue.speakerColor
										? {
												borderLeftColor: cue.speakerColor,
												borderLeftWidth: isSelected ? 4 : 3,
											}
										: undefined
								}
							>
								<div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
									<div className="flex shrink-0 items-center gap-1 font-mono text-muted-foreground">
										<span
											className={cn(
												"shrink-0 text-[10px] font-bold",
												isSelected ? "text-primary" : "text-foreground/80",
											)}
										>
											#{index + 1}
										</span>
										<SpeakerSelectDropdown
											cue={cue}
											cueIndex={index}
											editor={editor}
											preferredTrackId={sourceTrackId}
										/>
										{speakerKey && speakerName && (
											<SpeakerNameInput
												speakerKey={speakerKey}
												name={speakerName}
												color={cue.speakerColor}
												onCommit={commitSpeakerName}
											/>
										)}
										<CueTimeInput
											value={cue.startTime}
											onChange={(value) =>
												updateCueTiming({ index, field: "startTime", value })
											}
											label={`Thời gian bắt đầu cue ${index + 1}`}
										/>
										<span className="shrink-0 text-[8px] font-bold text-muted-foreground/60">
											→
										</span>
										<CueTimeInput
											value={cue.endTime}
											onChange={(value) =>
												updateCueTiming({ index, field: "endTime", value })
											}
											label={`Thời gian kết thúc cue ${index + 1}`}
										/>
									</div>

									<div className="flex shrink-0 items-center gap-1 ml-auto">
										{/* Nút hiển thị trạng thái TTS */}
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												seekCueTts(cue, index);
											}}
											className={cn(
												"flex h-4.5 items-center gap-0.5 rounded px-1.5 text-[7.5px] font-medium transition-all cursor-pointer",
												hasTts
													? "border border-emerald-500/50 bg-emerald-500/15 font-bold text-emerald-600 dark:text-emerald-400 opacity-100 shadow-2xs hover:bg-emerald-500/25"
													: "border border-border/40 text-muted-foreground opacity-35 font-normal hover:opacity-75",
											)}
											title={
												hasTts
													? "Đã có giọng đọc TTS trên Timeline (Nhấp để nhảy tới)"
													: "Chưa có giọng đọc TTS cho câu này"
											}
										>
											<HugeiconsIcon
												icon={VolumeHighIcon}
												className="size-2.5"
											/>
											<span>TTS</span>
										</button>

										{/* Nút Dịch câu này */}
										<button
											type="button"
											disabled={isTranslatingThisCue}
											onClick={(event) => {
												event.stopPropagation();
												handleTranslateSingleCue(cue, index);
											}}
											className="flex h-4.5 items-center gap-0.5 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 text-[7.5px] font-medium text-violet-600 transition-all hover:bg-violet-500/20 disabled:opacity-50 dark:text-violet-400 cursor-pointer shadow-2xs"
											title="Dịch câu này bằng AI"
										>
											{isTranslatingThisCue ? (
												<Loader2 className="size-2.5 animate-spin" />
											) : (
												<HugeiconsIcon
													icon={TranslateIcon}
													className="size-2.5"
												/>
											)}
											<span>Dịch</span>
										</button>

										{/* Nút Tạo TTS câu này */}
										<button
											type="button"
											disabled={isGeneratingTtsThisCue}
											onClick={(event) => {
												event.stopPropagation();
												handleGenerateTtsSingleCue(cue, index);
											}}
											className="flex h-4.5 items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 text-[7.5px] font-medium text-amber-600 transition-all hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400 cursor-pointer shadow-2xs"
											title="Tạo / Tạo lại giọng đọc TTS cho câu này"
										>
											{isGeneratingTtsThisCue ? (
												<Loader2 className="size-2.5 animate-spin" />
											) : (
												<HugeiconsIcon
													icon={SparklesIcon}
													className="size-2.5"
												/>
											)}
											<span>Tạo TTS</span>
										</button>
									</div>
								</div>
								<Textarea
									rows={1}
									value={cue.text}
									onFocus={() => selectCue(index)}
									onClick={(event) => event.stopPropagation()}
									onChange={(event) => {
										const text = event.target.value;
										updateExtractedCue(cue.id, text);
										if (editor && sourceTrackId) {
											isUpdatingFromPanelRef.current = true;
											syncCueTextToTimeline({
												editor,
												cue,
												cueIndex: index,
												preferredTrackId: sourceTrackId,
												text,
												cueStartTime: mediaTimeFromSeconds({
													seconds: cue.startTime,
												}),
											});
											if (timelineSnapshotRef.current?.source?.[index]) {
												timelineSnapshotRef.current.source[index].content =
													text;
											}
											setTimeout(() => {
												isUpdatingFromPanelRef.current = false;
											}, 50);
										}
									}}
									className={cn(
										"min-h-5 resize-y bg-background px-1.5 py-0.5 text-[8.5px] leading-tight",
										isSelected &&
											"border-primary/50 focus-visible:ring-1 focus-visible:ring-primary",
									)}
									aria-label={`Cue gốc ${index + 1}`}
								/>
								<Textarea
									rows={1}
									value={translations[cue.id] ?? ""}
									onFocus={() => selectCue(index)}
									onClick={(event) => event.stopPropagation()}
									onChange={(event) => {
										const text = event.target.value;
										setTranslation({ id: cue.id, text });
										if (
											editor &&
											translatedTrackId &&
											translatedTrackId !== sourceTrackId
										) {
											isUpdatingFromPanelRef.current = true;
											syncCueTextToTimeline({
												editor,
												cue,
												cueIndex: index,
												preferredTrackId: translatedTrackId,
												text,
												cueStartTime: mediaTimeFromSeconds({
													seconds: cue.startTime,
												}),
											});
											if (timelineSnapshotRef.current?.translated?.[index]) {
												timelineSnapshotRef.current.translated[index].content =
													text;
											}
											setTimeout(() => {
												isUpdatingFromPanelRef.current = false;
											}, 50);
										}
									}}
									placeholder="Bản dịch..."
									className={cn(
										"min-h-5 resize-y border-violet-500/30 bg-violet-500/5 px-1.5 py-0.5 text-[8.5px] leading-tight",
										isSelected &&
											"border-violet-500/80 focus-visible:ring-1 focus-visible:ring-violet-500",
									)}
									aria-label={`Cue dịch ${index + 1}`}
								/>
							</div>
						);
					})
				)}
			</div>

			<div className="grid shrink-0 grid-cols-2 gap-1.5 border-t p-1.5">
				<Button
					type="button"
					variant="outline"
					className="h-8 gap-1 px-1 text-[10px]"
					onClick={applySource}
					disabled={!extractedCues.length}
				>
					<HugeiconsIcon icon={ClosedCaptionIcon} className="size-3" /> Gốc →
					Timeline
				</Button>
				<Button
					type="button"
					variant="outline"
					className="h-8 gap-1 px-1 text-[10px]"
					onClick={applyTranslation}
					disabled={!canApplyTranslation}
				>
					<HugeiconsIcon icon={TranslateIcon} className="size-3" /> Dịch →
					Timeline
				</Button>
			</div>
		</div>
	);
}
