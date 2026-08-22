import "server-only";

import fs from "node:fs";
import path from "node:path";

export type ClonedVoiceProvider = "vieneu" | "elevenlabs" | "omnivoice";

export type ClonedVoiceSettings = {
	provider: ClonedVoiceProvider;
	voiceId: string;
	rate: number;
	pitch: number;
	volumeGain: number;
};

function workspaceRoot() {
	const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];
	return (
		candidates.find((candidate) =>
			fs.existsSync(path.join(candidate, "apps", "web")),
		) ?? process.cwd()
	);
}

function settingsPath() {
	return path.join(
		workspaceRoot(),
		".local-services",
		"cloned-voice-settings.json",
	);
}

function clampRate(value: number) {
	return Math.min(2, Math.max(0.5, value));
}

function clampPitch(value: number) {
	return Math.min(12, Math.max(-12, value));
}

function isSettings(value: unknown): value is ClonedVoiceSettings {
	return (
		typeof value === "object" &&
		value !== null &&
		"provider" in value &&
		(value.provider === "vieneu" ||
			value.provider === "elevenlabs" ||
			value.provider === "omnivoice") &&
		"voiceId" in value &&
		typeof value.voiceId === "string" &&
		value.voiceId.length > 0 &&
		"rate" in value &&
		typeof value.rate === "number" &&
		"pitch" in value &&
		typeof value.pitch === "number" &&
		"volumeGain" in value &&
		typeof value.volumeGain === "number"
	);
}

export function listClonedVoiceSettings(): ClonedVoiceSettings[] {
	const file = settingsPath();
	if (!fs.existsSync(file)) return [];
	try {
		const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		return Array.isArray(value) ? value.filter(isSettings) : [];
	} catch {
		return [];
	}
}

export function getClonedVoiceSettings({
	provider,
	voiceId,
}: {
	provider: string;
	voiceId: string;
}) {
	if (
		provider !== "vieneu" &&
		provider !== "elevenlabs" &&
		provider !== "omnivoice"
	) {
		return null;
	}
	return (
		listClonedVoiceSettings().find(
			(item) => item.provider === provider && item.voiceId === voiceId,
		) ?? null
	);
}

function writeSettings(settings: ClonedVoiceSettings[]) {
	const file = settingsPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(settings), {
		encoding: "utf8",
		mode: 0o600,
	});
}

export function saveClonedVoiceSettings(input: ClonedVoiceSettings) {
	const next: ClonedVoiceSettings = {
		provider: input.provider,
		voiceId: input.voiceId,
		rate: clampRate(input.rate),
		pitch: clampPitch(input.pitch),
		volumeGain: clampPitch(input.volumeGain),
	};
	const remaining = listClonedVoiceSettings().filter(
		(item) =>
			!(item.provider === next.provider && item.voiceId === next.voiceId),
	);
	writeSettings([...remaining, next]);
	return next;
}

export function deleteClonedVoiceSettings({
	provider,
	voiceId,
}: {
	provider: ClonedVoiceProvider;
	voiceId: string;
}) {
	const settings = listClonedVoiceSettings();
	const remaining = settings.filter(
		(item) => !(item.provider === provider && item.voiceId === voiceId),
	);
	if (remaining.length === settings.length) return false;
	writeSettings(remaining);
	return true;
}
