import type { EditorCore } from "@/core";
import {
	decodeMediaAudioStereo,
	stereoPcmToWavFile,
} from "@/lib/media/mediabunny";
import { mediaSupportsAudio } from "@/lib/media/media-utils";
import { processMediaAssets } from "@/lib/media/processing";
import {
	buildUploadAudioElement,
	wouldElementOverlap,
} from "@/lib/timeline/element-utils";
import type {
	AudioElement,
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
} from "@/types/timeline";
import type { DubbingSettings } from "../types";
import { mixIsolatedStems } from "../services/isolate-mix";
import {
	isDuckedSourceElement,
	isMusicStemElement,
	isRawSourceAudioElement,
	isSourceAudioElement,
} from "../services/duck-envelope";
import { getActiveProjectOrNull, getActiveSceneOrNull } from "./editor";
import { refreshNarrationDuck } from "./source-audio-sync";
import {
	isolateSourceWav,
	stemPcmToWavFile,
	VOCAL_ISOLATION_MODEL_ID,
	type IsolatedStems,
} from "./vocal-isolation";

interface RawPcm {
	left: Float32Array;
	right: Float32Array | null;
	sampleRate: number;
}

const rawPcmCache = new Map<string, RawPcm>();
const stemPcmCache = new Map<string, IsolatedStems>();
const inFlight = new Map<string, Promise<void>>();
let applyChain: Promise<void> = Promise.resolve();
let didWarnMono = false;

export function sourceElementName({
	videoMediaId,
}: {
	videoMediaId: string;
}): string {
	return `[Nguồn video:${videoMediaId}]`;
}

export function musicStemElementName({
	videoMediaId,
}: {
	videoMediaId: string;
}): string {
	return `[Nhạc nền video:${videoMediaId}]`;
}

export function duckedSourceElementName({
	videoMediaId,
}: {
	videoMediaId: string;
}): string {
	return `[Hạ âm video:${videoMediaId}]`;
}

export function videoMediaIdFromSourceName({
	name,
}: {
	name: string;
}): string | null {
	const match =
		/^\[(?:Nguồn video|Nhạc nền video|Hạ âm video):([^\]]+)\]/.exec(name);
	return match?.[1] ?? null;
}

function extractKey({
	mediaId,
	trimStart,
	duration,
}: {
	mediaId: string;
	trimStart: number;
	duration: number;
}): string {
	return `${mediaId}:${trimStart.toFixed(3)}:${duration.toFixed(3)}`;
}

function findAudioElementsBy({
	tracks,
	match,
}: {
	tracks: TimelineTrack[];
	match: (element: AudioElement) => boolean;
}): Array<{ trackId: string; element: AudioElement }> {
	const found: Array<{ trackId: string; element: AudioElement }> = [];
	for (const track of tracks) {
		if (track.type !== "audio") continue;
		for (const element of track.elements) {
			if (element.type !== "audio") continue;
			if (!match(element)) continue;
			found.push({ trackId: track.id, element });
		}
	}
	return found;
}

export function findSourceAudioElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Array<{ trackId: string; element: AudioElement }> {
	return findAudioElementsBy({
		tracks,
		match: (element) => isSourceAudioElement({ element }),
	});
}

export function findRawSourceAudioElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Array<{ trackId: string; element: AudioElement }> {
	return findAudioElementsBy({
		tracks,
		match: (element) => isRawSourceAudioElement({ element }),
	});
}

export function findMusicStemElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Array<{ trackId: string; element: AudioElement }> {
	return findAudioElementsBy({
		tracks,
		match: (element) => isMusicStemElement({ element }),
	});
}

export function findDuckedSourceElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Array<{ trackId: string; element: AudioElement }> {
	return findAudioElementsBy({
		tracks,
		match: (element) => isDuckedSourceElement({ element }),
	});
}

export function hasSourceAudioClips({
	tracks,
}: {
	tracks: TimelineTrack[];
}): boolean {
	return findSourceAudioElements({ tracks }).length > 0;
}

function findOrCreateRoleTrack({
	editor,
	match,
	startTime,
	duration,
}: {
	editor: EditorCore;
	match?: (element: { audioRole?: string; name: string }) => boolean;
	startTime?: number;
	duration?: number;
}): string {
	const tracks = editor.timeline.getTracks();

	if (startTime !== undefined && duration !== undefined) {
		const endTime = startTime + duration;

		// 1. Try to find an existing audio track matching this role that does NOT overlap
		if (match) {
			const matchingTracks = tracks.filter(
				(track) =>
					track.type === "audio" &&
					track.elements.some((element) => match(element)),
			);
			for (const track of matchingTracks) {
				if (
					!wouldElementOverlap({
						elements: track.elements,
						startTime,
						endTime,
					})
				) {
					return track.id;
				}
			}
		}

		// 2. Try to find any existing audio track without overlap
		const audioTracks = tracks.filter((track) => track.type === "audio");
		for (const track of audioTracks) {
			if (
				!wouldElementOverlap({
					elements: track.elements,
					startTime,
					endTime,
				})
			) {
				return track.id;
			}
		}

		// 3. If all existing audio tracks overlap at this time, create a new track (dÃ²ng má»›i)!
		return editor.timeline.addTrack({ type: "audio" });
	}

	const existing = tracks.find(
		(track) =>
			track.type === "audio" &&
			(match ? track.elements.some((element) => match(element)) : true),
	);
	if (existing) return existing.id;
	return editor.timeline.addTrack({ type: "audio" });
}

export function findOrCreateSourceTrack({
	editor,
	startTime,
	duration,
}: {
	editor: EditorCore;
	startTime?: number;
	duration?: number;
}): string {
	return findOrCreateRoleTrack({
		editor,
		match: (element) => isRawSourceAudioElement({ element }),
		startTime,
		duration,
	});
}

export function findOrCreateMusicStemTrack({
	editor,
	startTime,
	duration,
}: {
	editor: EditorCore;
	startTime?: number;
	duration?: number;
}): string {
	return findOrCreateRoleTrack({
		editor,
		match: (element) => isMusicStemElement({ element }),
		startTime,
		duration,
	});
}

export function findOrCreateDuckedSourceTrack({
	editor,
	startTime,
	duration,
}: {
	editor: EditorCore;
	startTime?: number;
	duration?: number;
}): string {
	return findOrCreateRoleTrack({
		editor,
		match: (element) => isDuckedSourceElement({ element }),
		startTime,
		duration,
	});
}

function findSourceClipForVideo({
	tracks,
	videoMediaId,
	startTime,
	duration,
}: {
	tracks: TimelineTrack[];
	videoMediaId: string;
	startTime: number;
	duration: number;
}): { trackId: string; element: AudioElement } | null {
	for (const clip of findSourceAudioElements({ tracks })) {
		const clipVideoId =
			videoMediaIdFromSourceName({ name: clip.element.name }) ??
			(clip.element.sourceType === "upload"
				? clip.element.originalMediaId
				: null);
		const matchesId = !clipVideoId || clipVideoId === videoMediaId;
		const sameStart = Math.abs(clip.element.startTime - startTime) < 0.001;
		const sameDuration = Math.abs(clip.element.duration - duration) < 0.001;
		if (matchesId && sameStart && sameDuration) return clip;
	}
	return null;
}

function muteVideo({
	editor,
	trackId,
	elementId,
}: {
	editor: EditorCore;
	trackId: string;
	elementId: string;
}): void {
	editor.timeline.updateElements({
		updates: [{ trackId, elementId, updates: { muted: true } }],
		pushHistory: false,
	});
}

function collectVideoClips({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Array<{ trackId: string; element: VideoElement }> {
	const videos: Array<{ trackId: string; element: VideoElement }> = [];
	for (const track of tracks) {
		if (track.type !== "video") continue;
		for (const element of track.elements) {
			if (element.type !== "video") continue;
			videos.push({ trackId: track.id, element });
		}
	}
	return videos;
}

export function collectTargetVideoClips({
	tracks,
	targetElementIds,
}: {
	tracks: TimelineTrack[];
	targetElementIds?: string[];
}): Array<{ trackId: string; element: VideoElement }> {
	const allVideos = collectVideoClips({ tracks });
	if (!targetElementIds || targetElementIds.length === 0) {
		return allVideos;
	}
	const targetSet = new Set(targetElementIds);

	// 1. Check direct video elements match
	const matchedVideos = allVideos.filter((v) => targetSet.has(v.element.id));
	if (matchedVideos.length > 0) return matchedVideos;

	// 2. If audio clips (e.g. music-stem or source) were selected, find corresponding video
	const allAudio = findSourceAudioElements({ tracks });
	const matchedAudio = allAudio.filter((a) => targetSet.has(a.element.id));
	if (matchedAudio.length > 0) {
		const matchedByAudio: Array<{ trackId: string; element: VideoElement }> = [];
		for (const audio of matchedAudio) {
			const video = allVideos.find(
				(v) =>
					Math.abs(v.element.startTime - audio.element.startTime) < 0.001 &&
					Math.abs(v.element.duration - audio.element.duration) < 0.001,
			);
			if (video && !matchedByAudio.some((v) => v.element.id === video.element.id)) {
				matchedByAudio.push(video);
			}
		}
		if (matchedByAudio.length > 0) return matchedByAudio;
	}

	return allVideos;
}

export function findTargetVideoInfo({
	editor,
	targetElementIds,
}: {
	editor: EditorCore;
	targetElementIds?: string[];
}): {
	isSingleVideo: boolean;
	videoCount: number;
	targetName: string;
	startTime?: number;
	duration?: number;
	musicGain?: number;
	vocalGain?: number;
	hasStemOnTimeline?: boolean;
} {
	const tracks = editor.timeline.getTracks();
	const targets = collectTargetVideoClips({ tracks, targetElementIds });
	if (targets.length === 0) {
		return {
			isSingleVideo: false,
			videoCount: 0,
			targetName: "KhÃ´ng cÃ³ video trÃªn timeline",
		};
	}
	if (targets.length === 1) {
		const target = targets[0];
		const existingClip = findSourceClipForVideo({
			tracks,
			videoMediaId: target.element.mediaId,
			startTime: target.element.startTime,
			duration: target.element.duration,
		});
		return {
			isSingleVideo: true,
			videoCount: 1,
			targetName: target.element.name || "Video Clip",
			startTime: target.element.startTime,
			duration: target.element.duration,
			musicGain: existingClip?.element.musicGain,
			vocalGain: existingClip?.element.vocalGain,
			hasStemOnTimeline: Boolean(existingClip),
		};
	}
	const isSpecificSelection =
		Boolean(targetElementIds && targetElementIds.length > 0);
	return {
		isSingleVideo: false,
		videoCount: targets.length,
		targetName: isSpecificSelection
			? `${targets.length} video clip Ä‘Ã£ chá»n`
			: `Táº¥t cáº£ video (${targets.length} clips)`,
	};
}

async function hydrateCacheFromAsset({
	editor,
	cacheId,
}: {
	editor: EditorCore;
	cacheId: string;
}): Promise<RawPcm | null> {
	const cached = rawPcmCache.get(cacheId);
	if (cached) return cached;
	const asset = editor.media.getAssets().find((item) => item.id === cacheId);
	if (!asset) return null;
	const duration = asset.duration ?? 0;
	if (duration <= 0) return null;
	const decoded = await decodeMediaAudioStereo({
		file: asset.file,
		trimStart: 0,
		duration,
	});
	const pcm: RawPcm = {
		left: decoded.left,
		right: decoded.right,
		sampleRate: decoded.sampleRate,
	};
	rawPcmCache.set(cacheId, pcm);
	return pcm;
}

async function extractAudioFromVideoAsset({
	editor,
	projectId,
	video,
}: {
	editor: EditorCore;
	projectId: string;
	video: { trackId: string; element: VideoElement };
}): Promise<{
	status: "extracted" | "exists" | "no-audio";
	mediaId?: string;
	existingClip?: { trackId: string; element: AudioElement };
}> {
	const asset = editor.media
		.getAssets()
		.find((item) => item.id === video.element.mediaId);
	if (!asset || !mediaSupportsAudio({ media: asset })) {
		return { status: "no-audio" };
	}

	const existing = findSourceClipForVideo({
		tracks: editor.timeline.getTracks(),
		videoMediaId: video.element.mediaId,
		startTime: video.element.startTime,
		duration: video.element.duration,
	});
	if (existing) {
		const rawId =
			existing.element.originalMediaId ??
			(existing.element.sourceType === "upload"
				? existing.element.mediaId
				: null);
		if (rawId) {
			await hydrateCacheFromAsset({ editor, cacheId: rawId });
			return { status: "exists", mediaId: rawId, existingClip: existing };
		}
	}

	const key = extractKey({
		mediaId: video.element.mediaId,
		trimStart: video.element.trimStart,
		duration: video.element.duration,
	});
	const pending = inFlight.get(key);
	if (pending) {
		await pending;
		const cachedExisting = findSourceClipForVideo({
			tracks: editor.timeline.getTracks(),
			videoMediaId: video.element.mediaId,
			startTime: video.element.startTime,
			duration: video.element.duration,
		});
		const rawId =
			cachedExisting?.element.originalMediaId ??
			(cachedExisting?.element.sourceType === "upload"
				? cachedExisting?.element.mediaId
				: undefined);
		return {
			status: "exists",
			mediaId: rawId,
			existingClip: cachedExisting ?? undefined,
		};
	}

	let resultStatus: "extracted" | "no-audio" = "extracted";
	let extractedMediaId: string | undefined;

	const task = (async () => {
		let decoded: Awaited<ReturnType<typeof decodeMediaAudioStereo>>;
		try {
			decoded = await decodeMediaAudioStereo({
				file: asset.file,
				trimStart: video.element.trimStart,
				duration: video.element.duration,
			});
		} catch (error) {
			if (error instanceof Error && error.message === "NO_AUDIO_TRACK") {
				resultStatus = "no-audio";
				return;
			}
			throw error;
		}

		if (!decoded.right) didWarnMono = true;

		const wav = stereoPcmToWavFile({
			left: decoded.left,
			right: decoded.right,
			sampleRate: decoded.sampleRate,
			fileName: `nguon-video-${video.element.mediaId}.wav`,
		});
		const processed = (await processMediaAssets({ files: [wav] }))[0];
		if (!processed) {
			throw new Error("KhÃ´ng thá»ƒ xá»­ lÃ½ Ã¢m thanh Ä‘Ã£ tÃ¡ch.");
		}
		const mediaId = await editor.media.addMediaAsset({
			projectId,
			asset: {
				...processed,
				ephemeral: true,
			},
		});
		const stored = editor.media
			.getAssets()
			.some((item) => item.id === mediaId);
		if (!stored) {
			throw new Error("KhÃ´ng thá»ƒ lÆ°u Ã¢m thanh Ä‘Ã£ tÃ¡ch.");
		}

		rawPcmCache.set(mediaId, {
			left: decoded.left,
			right: decoded.right,
			sampleRate: decoded.sampleRate,
		});

		extractedMediaId = mediaId;
	})().finally(() => {
		inFlight.delete(key);
	});

	inFlight.set(key, task);
	await task;
	return { status: resultStatus, mediaId: extractedMediaId };
}

export async function ensureOriginalSourceAudio({
	editor,
	insertIntoTimeline = true,
}: {
	editor: EditorCore;
	insertIntoTimeline?: boolean;
}): Promise<{ extracted: number; monoWarned: boolean }> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}
	const scene = getActiveSceneOrNull({ editor });
	if (!scene) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}

	const videos = collectVideoClips({ tracks: scene.tracks });
	if (videos.length === 0) {
		throw new Error("KhÃ´ng cÃ³ video trÃªn timeline.");
	}

	const warnedBefore = didWarnMono;
	let extracted = 0;
	let noAudio = 0;
	let attempted = 0;

	for (const video of videos) {
		attempted += 1;
		const outcome = await extractAudioFromVideoAsset({
			editor,
			projectId: project.metadata.id,
			video,
		});
		if (outcome.status === "extracted") extracted += 1;
		if (outcome.status === "no-audio") noAudio += 1;

		if (insertIntoTimeline && outcome.mediaId && !outcome.existingClip) {
			muteVideo({
				editor,
				trackId: video.trackId,
				elementId: video.element.id,
			});
			const trackId = findOrCreateSourceTrack({
				editor,
				startTime: video.element.startTime,
				duration: video.element.duration,
			});
			editor.timeline.insertElement({
				element: {
					...buildUploadAudioElement({
						mediaId: outcome.mediaId,
						name: sourceElementName({
							videoMediaId: video.element.mediaId,
						}),
						duration: video.element.duration,
						startTime: video.element.startTime,
					}),
					audioRole: "source",
					originalMediaId: outcome.mediaId,
				},
				placement: { mode: "explicit", trackId },
			});
		}
	}

	const haveClips = insertIntoTimeline
		? hasSourceAudioClips({
				tracks: editor.timeline.getTracks(),
			})
		: extracted > 0 || (attempted > noAudio);
	if (!haveClips) {
		if (noAudio === attempted) {
			throw new Error("Video gá»‘c khÃ´ng cÃ³ track Ã¢m thanh.");
		}
		throw new Error("KhÃ´ng tÃ¡ch Ä‘Æ°á»£c Ã¢m thanh video gá»‘c.");
	}

	return {
		extracted,
		monoWarned: didWarnMono && !warnedBefore,
	};
}

export async function forceExtractOriginalSourceAudio({
	editor,
}: {
	editor: EditorCore;
}): Promise<{ extracted: number }> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}
	const scene = getActiveSceneOrNull({ editor });
	if (!scene) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}

	// Remove old extracted source clips so we cleanly re-decode
	const existingSource = findSourceAudioElements({ tracks: scene.tracks });
	if (existingSource.length > 0) {
		editor.timeline.deleteElements({
			elements: existingSource.map((s) => ({
				trackId: s.trackId,
				elementId: s.element.id,
			})),
		});
	}

	rawPcmCache.clear();
	stemPcmCache.clear();

	const res = await ensureOriginalSourceAudio({ editor });
	editor.audio.refreshScheduledClips();
	return { extracted: res.extracted };
}

async function persistStemAsset({
	editor,
	projectId,
	pcm,
	fileName,
}: {
	editor: EditorCore;
	projectId: string;
	pcm: IsolatedStems["vocals"];
	fileName: string;
}): Promise<string | null> {
	const wav = stemPcmToWavFile({ pcm, fileName });
	const processed = (await processMediaAssets({ files: [wav] }))[0];
	if (!processed) return null;
	const mediaId = await editor.media.addMediaAsset({
		projectId,
		asset: {
			...processed,
			ephemeral: true,
		},
	});
	const stored = editor.media.getAssets().some((item) => item.id === mediaId);
	return stored ? mediaId : null;
}

async function hydrateStemsFromAssets({
	editor,
	vocalsMediaId,
	instrumentalMediaId,
	cacheKey,
}: {
	editor: EditorCore;
	vocalsMediaId?: string;
	instrumentalMediaId?: string;
	cacheKey: string;
}): Promise<IsolatedStems | null> {
	const cached = stemPcmCache.get(cacheKey);
	if (cached?.model === VOCAL_ISOLATION_MODEL_ID) return cached;
	if (!vocalsMediaId || !instrumentalMediaId) return null;
	const [vocals, instrumental] = await Promise.all([
		hydrateCacheFromAsset({ editor, cacheId: vocalsMediaId }),
		hydrateCacheFromAsset({ editor, cacheId: instrumentalMediaId }),
	]);
	if (!vocals || !instrumental) return null;
	const stems: IsolatedStems = {
		vocals,
		instrumental,
		model: VOCAL_ISOLATION_MODEL_ID,
	};
	stemPcmCache.set(cacheKey, stems);
	return stems;
}

async function ensureIsolatedStems({
	editor,
	projectId,
	element,
	rawId,
}: {
	editor: EditorCore;
	projectId: string;
	element: UploadAudioElement;
	rawId: string;
}): Promise<{
	stems: IsolatedStems;
	vocalsMediaId: string;
	instrumentalMediaId: string;
}> {
	const stemsAreCurrent =
		element.vocalIsolationModel === VOCAL_ISOLATION_MODEL_ID;
	const cached = stemsAreCurrent
		? await hydrateStemsFromAssets({
				editor,
				vocalsMediaId: element.vocalsMediaId,
				instrumentalMediaId: element.instrumentalMediaId,
				cacheKey: rawId,
			})
		: null;
	if (cached && element.vocalsMediaId && element.instrumentalMediaId) {
		return {
			stems: cached,
			vocalsMediaId: element.vocalsMediaId,
			instrumentalMediaId: element.instrumentalMediaId,
		};
	}

	const rawAsset = editor.media.getAssets().find((item) => item.id === rawId);
	if (!rawAsset) {
		throw new Error("KhÃ´ng tÃ¬m tháº¥y WAV nguá»“n Ä‘á»ƒ tÃ¡ch giá»ng.");
	}
	const isolated = await isolateSourceWav({ file: rawAsset.file });
	stemPcmCache.set(rawId, isolated);

	const previousVocalsId = element.vocalsMediaId;
	const previousInstId = element.instrumentalMediaId;
	const vocalsMediaId = await persistStemAsset({
		editor,
		projectId,
		pcm: isolated.vocals,
		fileName: `nguon-video-vocals-${rawId}.wav`,
	});
	const instrumentalMediaId = await persistStemAsset({
		editor,
		projectId,
		pcm: isolated.instrumental,
		fileName: `nguon-video-inst-${rawId}.wav`,
	});
	if (!vocalsMediaId || !instrumentalMediaId) {
		throw new Error("KhÃ´ng lÆ°u Ä‘Æ°á»£c stem tÃ¡ch giá»ng.");
	}

	const staleIds = [previousVocalsId, previousInstId].filter(
		(id): id is string =>
			Boolean(id) && id !== vocalsMediaId && id !== instrumentalMediaId,
	);
	for (const id of staleIds) {
		await editor.media.removeMediaAsset({ projectId, id });
	}

	return {
		stems: isolated,
		vocalsMediaId,
		instrumentalMediaId,
	};
}

async function retargetSourceClip({
	editor,
	projectId,
	trackId,
	element,
	nextMediaId,
	vocalsMediaId,
	instrumentalMediaId,
	vocalIsolationModel,
	musicGain,
	vocalGain,
}: {
	editor: EditorCore;
	projectId: string;
	trackId: string;
	element: UploadAudioElement;
	nextMediaId: string;
	vocalsMediaId?: string;
	instrumentalMediaId?: string;
	vocalIsolationModel?: string;
	musicGain?: number;
	vocalGain?: number;
}): Promise<void> {
	const previousId = element.mediaId;
	const rawId = element.originalMediaId ?? element.mediaId;
	const keepIds = new Set(
		[rawId, nextMediaId, vocalsMediaId, instrumentalMediaId].filter(
			(id): id is string => Boolean(id),
		),
	);
	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: element.id,
				updates: {
					mediaId: nextMediaId,
					originalMediaId: rawId,
					vocalsMediaId,
					instrumentalMediaId,
					vocalIsolationModel,
					musicGain,
					vocalGain,
				},
			},
		],
		pushHistory: false,
	});
	if (!keepIds.has(previousId)) {
		await editor.media.removeMediaAsset({
			projectId,
			id: previousId,
		});
	}
}

async function applyVoiceReductionNow({
	editor,
	musicGain,
	vocalGain,
	targetElementIds,
}: {
	editor: EditorCore;
	musicGain: number;
	vocalGain: number;
	targetElementIds?: string[];
}): Promise<void> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) return;

	let clips = findMusicStemElements({
		tracks: editor.timeline.getTracks(),
	});

	if (targetElementIds && targetElementIds.length > 0) {
		const targetSet = new Set(targetElementIds);
		const directAudio = clips.filter((c) => targetSet.has(c.element.id));
		if (directAudio.length > 0) {
			clips = directAudio;
		} else {
			const scene = getActiveSceneOrNull({ editor });
			if (scene) {
				const allVideos = collectVideoClips({ tracks: scene.tracks });
				const selectedVideos = allVideos.filter((v) => targetSet.has(v.element.id));
				if (selectedVideos.length > 0) {
					clips = clips.filter((c) =>
						selectedVideos.some(
							(v) =>
								Math.abs(v.element.startTime - c.element.startTime) < 0.001 &&
								Math.abs(v.element.duration - c.element.duration) < 0.001,
						),
					);
				}
			}
		}
	}

	for (const clip of clips) {
		if (clip.element.sourceType !== "upload") continue;
		const rawId = clip.element.originalMediaId ?? clip.element.mediaId;
		const isolated = await ensureIsolatedStems({
			editor,
			projectId: project.metadata.id,
			element: clip.element,
			rawId,
		});
		const mixed = mixIsolatedStems({
			vocals: isolated.stems.vocals,
			instrumental: isolated.stems.instrumental,
			musicGain,
			vocalGain,
		});
		const wav = stereoPcmToWavFile({
			left: mixed.left,
			right: mixed.right,
			sampleRate: isolated.stems.instrumental.sampleRate,
			fileName: `nguon-video-mix-m${Math.round(musicGain * 100)}-v${Math.round(vocalGain * 100)}-${rawId}.wav`,
		});
		const processed = (await processMediaAssets({ files: [wav] }))[0];
		if (!processed) continue;
		const nextMediaId = await editor.media.addMediaAsset({
			projectId: project.metadata.id,
			asset: {
				...processed,
				ephemeral: true,
			},
		});
		const stored = editor.media
			.getAssets()
			.some((item) => item.id === nextMediaId);
		if (!stored) continue;

		await retargetSourceClip({
			editor,
			projectId: project.metadata.id,
			trackId: clip.trackId,
			element: clip.element,
			nextMediaId,
			vocalsMediaId: isolated.vocalsMediaId,
			instrumentalMediaId: isolated.instrumentalMediaId,
			vocalIsolationModel:
				isolated.stems.model || VOCAL_ISOLATION_MODEL_ID,
			musicGain,
			vocalGain,
		});
	}
}

export async function applyVoiceReductionToSourceClips({
	editor,
	musicGain,
	vocalGain,
	targetElementIds,
}: {
	editor: EditorCore;
	musicGain: number;
	vocalGain: number;
	targetElementIds?: string[];
}): Promise<void> {
	const run = applyChain.then(() =>
		applyVoiceReductionNow({ editor, musicGain, vocalGain, targetElementIds }),
	);
	applyChain = run.then(
		() => undefined,
		() => undefined,
	);
	await run;
}

export async function createMusicStemAudio({
	editor,
	musicGain,
	vocalGain,
	targetElementIds,
}: {
	editor: EditorCore;
	musicGain: number;
	vocalGain: number;
	targetElementIds?: string[];
}): Promise<void> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) return;
	const scene = getActiveSceneOrNull({ editor });
	if (!scene) return;

	const videos = collectTargetVideoClips({
		tracks: scene.tracks,
		targetElementIds,
	});
	if (videos.length === 0) {
		throw new Error("KhÃ´ng cÃ³ video trÃªn timeline.");
	}

	const musicTrackId = findOrCreateMusicStemTrack({ editor });

	for (const video of videos) {
		const extraction = await extractAudioFromVideoAsset({
			editor,
			projectId: project.metadata.id,
			video,
		});

		if (extraction.status === "no-audio" || !extraction.mediaId) {
			continue;
		}

		const rawId = extraction.mediaId;

		muteVideo({
			editor,
			trackId: video.trackId,
			elementId: video.element.id,
		});

		const existingClip =
			extraction.existingClip ??
			findSourceClipForVideo({
				tracks: editor.timeline.getTracks(),
				videoMediaId: video.element.mediaId,
				startTime: video.element.startTime,
				duration: video.element.duration,
			});

		const elementForIsolation = (
			existingClip?.element.sourceType === "upload"
				? existingClip.element
				: {
						...buildUploadAudioElement({
							mediaId: rawId,
							name: sourceElementName({
								videoMediaId: video.element.mediaId,
							}),
							duration: video.element.duration,
							startTime: video.element.startTime,
						}),
						originalMediaId: rawId,
					}
		) as UploadAudioElement;

		const isolated = await ensureIsolatedStems({
			editor,
			projectId: project.metadata.id,
			element: elementForIsolation,
			rawId,
		});

		const mixed = mixIsolatedStems({
			vocals: isolated.stems.vocals,
			instrumental: isolated.stems.instrumental,
			musicGain,
			vocalGain,
		});

		const wav = stereoPcmToWavFile({
			left: mixed.left,
			right: mixed.right,
			sampleRate: isolated.stems.instrumental.sampleRate,
			fileName: `nhac-nen-m${Math.round(musicGain * 100)}-v${Math.round(vocalGain * 100)}-${rawId}.wav`,
		});
		const processed = (await processMediaAssets({ files: [wav] }))[0];
		if (!processed) continue;
		const nextMediaId = await editor.media.addMediaAsset({
			projectId: project.metadata.id,
			asset: {
				...processed,
				ephemeral: true,
			},
		});
		const stored = editor.media
			.getAssets()
			.some((item) => item.id === nextMediaId);
		if (!stored) continue;

		const targetTrackId = findOrCreateMusicStemTrack({
			editor,
			startTime: video.element.startTime,
			duration: video.element.duration,
		});

		editor.timeline.insertElement({
			element: {
				...buildUploadAudioElement({
					mediaId: nextMediaId,
					name: musicStemElementName({
						videoMediaId: video.element.mediaId,
					}),
					duration: video.element.duration,
					startTime: video.element.startTime,
				}),
				audioRole: "music-stem",
				originalMediaId: rawId,
				vocalsMediaId: isolated.vocalsMediaId,
				instrumentalMediaId: isolated.instrumentalMediaId,
				vocalIsolationModel:
					isolated.stems.model || VOCAL_ISOLATION_MODEL_ID,
				musicGain,
				vocalGain,
			},
			placement: { mode: "explicit", trackId: targetTrackId },
		});
	}
}

export async function createDuckedSourceAudio({
	editor,
	settings,
	targetElementIds,
}: {
	editor: EditorCore;
	settings: DubbingSettings;
	targetElementIds?: string[];
}): Promise<void> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}
	const scene = getActiveSceneOrNull({ editor });
	if (!scene) {
		throw new Error("KhÃ´ng cÃ³ dá»± Ã¡n Ä‘ang má»Ÿ.");
	}

	const videos = collectTargetVideoClips({
		tracks: scene.tracks,
		targetElementIds,
	});
	if (videos.length === 0) {
		throw new Error("KhÃ´ng cÃ³ video trÃªn timeline.");
	}

	for (const video of videos) {
		const extraction = await extractAudioFromVideoAsset({
			editor,
			projectId: project.metadata.id,
			video,
		});
		if (extraction.status === "no-audio" || !extraction.mediaId) continue;

		const rawId = extraction.mediaId;
		muteVideo({
			editor,
			trackId: video.trackId,
			elementId: video.element.id,
		});

		const targetTrackId = findOrCreateDuckedSourceTrack({
			editor,
			startTime: video.element.startTime,
			duration: video.element.duration,
		});

		editor.timeline.insertElement({
			element: {
				...buildUploadAudioElement({
					mediaId: rawId,
					name: duckedSourceElementName({
						videoMediaId: video.element.mediaId,
					}),
					duration: video.element.duration,
					startTime: video.element.startTime,
				}),
				audioRole: "ducked-source",
				originalMediaId: rawId,
			},
			placement: { mode: "explicit", trackId: targetTrackId },
		});
	}

	refreshNarrationDuck({
		editor,
		settings: {
			sourceVolume: settings.sourceVolume,
			ttsVolume: settings.ttsVolume,
		},
	});
	editor.audio.refreshScheduledClips();
}

export async function restoreRawSourceClips({
	editor,
}: {
	editor: EditorCore;
}): Promise<void> {
	const project = getActiveProjectOrNull({ editor });
	if (!project) return;

	const clips = findRawSourceAudioElements({
		tracks: editor.timeline.getTracks(),
	});
	for (const clip of clips) {
		if (clip.element.sourceType !== "upload") continue;
		const rawId = clip.element.originalMediaId;
		if (!rawId || clip.element.mediaId === rawId) continue;
		const processedId = clip.element.mediaId;
		editor.timeline.updateElements({
			updates: [
				{
					trackId: clip.trackId,
					elementId: clip.element.id,
					updates: {
						mediaId: rawId,
						vocalsMediaId: clip.element.vocalsMediaId,
						instrumentalMediaId: clip.element.instrumentalMediaId,
						vocalIsolationModel: clip.element.vocalIsolationModel,
					},
				},
			],
			pushHistory: false,
		});
		const keepIds = new Set(
			[
				rawId,
				clip.element.vocalsMediaId,
				clip.element.instrumentalMediaId,
			].filter((id): id is string => Boolean(id)),
		);
		if (!keepIds.has(processedId)) {
			await editor.media.removeMediaAsset({
				projectId: project.metadata.id,
				id: processedId,
			});
		}
	}
}
