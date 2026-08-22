import type { RecognitionCue, SpeakerGender, SpeakerProfile } from "../types";
import { SPEAKER_COLORS } from "./speaker-diarization";

export const SELF_PRONOUN_OPTIONS = [
	"tôi",
	"anh",
	"em",
	"chị",
	"mình",
	"tớ",
	"tao",
	"ta",
	"tại hạ",
	"ní",
	"chế",
	"cháu",
] as const;

export const ADDRESS_PRONOUN_OPTIONS = [
	"bạn",
	"anh",
	"em",
	"chị",
	"cậu",
	"mày",
	"ngươi",
	"cô",
	"chú",
	"bác",
	"eng",
	"ní",
	"chế",
	"cháu",
] as const;

export function defaultPronounsForGender(gender?: SpeakerGender): {
	selfPronoun?: string;
	addressPronoun?: string;
} {
	if (gender === "female") return { selfPronoun: "em", addressPronoun: "anh" };
	if (gender === "male") return { selfPronoun: "anh", addressPronoun: "em" };
	return {};
}

export function genderLabel(gender?: SpeakerGender): string {
	if (gender === "female") return "nữ";
	if (gender === "male") return "nam";
	return "chưa rõ";
}

export function collectSpeakerProfiles({
	cues,
	profiles,
}: {
	cues: RecognitionCue[];
	profiles: SpeakerProfile[];
}): SpeakerProfile[] {
	const byId = new Map(profiles.map((profile) => [profile.id, profile]));
	for (const cue of cues) {
		const id = cue.speakerId || "speaker-default";
		if (byId.has(id)) continue;
		byId.set(id, {
			id,
			name: cue.speakerName || cue.speaker || "Người nói 1",
			color: cue.speakerColor || "#60a5fa",
		});
	}
	return Array.from(byId.values());
}

export function translationCueWithRole({
	cue,
	profiles,
}: {
	cue: RecognitionCue;
	profiles: SpeakerProfile[];
}): {
	id: string;
	text: string;
	speaker?: string;
	gender?: SpeakerGender;
	selfPronoun?: string;
	addressPronoun?: string;
} {
	const profile = profiles.find((item) => item.id === (cue.speakerId || ""));
	const speaker = profile?.name || cue.speakerName || cue.speaker;
	const gender = profile?.gender;
	const defaults = defaultPronounsForGender(gender);
	const selfPronoun = profile?.selfPronoun?.trim() || defaults.selfPronoun;
	const addressPronoun =
		profile?.addressPronoun?.trim() || defaults.addressPronoun;
	return {
		id: cue.id,
		text: cue.text,
		...(speaker ? { speaker } : {}),
		...(gender && gender !== "unknown" ? { gender } : {}),
		...(selfPronoun ? { selfPronoun } : {}),
		...(addressPronoun ? { addressPronoun } : {}),
	};
}

export function resolveSpeakerColor({
	speakerId,
	speakerName,
	cueColor,
	profiles,
}: {
	speakerId?: string;
	speakerName?: string;
	cueColor?: string;
	profiles?: SpeakerProfile[];
}): string {
	if (cueColor && cueColor.startsWith("#")) return cueColor;
	if (profiles && (speakerId || speakerName)) {
		const profile = profiles.find(
			(p) =>
				(speakerId && p.id === speakerId) ||
				(speakerName && (p.name === speakerName || p.id === speakerName)),
		);
		if (profile?.color && profile.color.startsWith("#")) return profile.color;
	}

	const raw = speakerName || speakerId || "";
	// Check if matches "N1", "N2", "speaker-1", "Người nói 1"
	const numMatch = raw.match(/(\d+)/);
	if (numMatch) {
		const num = parseInt(numMatch[1], 10);
		if (!Number.isNaN(num) && num >= 1) {
			return SPEAKER_COLORS[(num - 1) % SPEAKER_COLORS.length];
		}
	}

	if (!raw) return SPEAKER_COLORS[0];

	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		hash = (hash << 5) - hash + raw.charCodeAt(i);
	}
	return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
}
