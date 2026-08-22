import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	GEMINI_TTS_MODELS,
	type GeminiTtsModel,
} from "../gemini-tts-options";

export type GeminiTtsPreset = {
	id: string;
	name: string;
	model: GeminiTtsModel;
	language: string;
	voice: string;
	styleInstructions: string;
	rate: number;
	pitch: number;
	volumeGain: number;
	createdAt: string;
};

type CreateGeminiTtsPreset = Omit<GeminiTtsPreset, "id" | "createdAt">;

function workspaceRoot() {
	const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];
	return candidates.find((candidate) =>
		fs.existsSync(path.join(candidate, "apps", "web")),
	) ?? process.cwd();
}

function presetsPath() {
	return path.join(workspaceRoot(), ".local-services", "gemini-tts-presets.json");
}

function isPreset(value: unknown): value is GeminiTtsPreset {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value && typeof value.id === "string" &&
		"name" in value && typeof value.name === "string" &&
		"model" in value && typeof value.model === "string" &&
		GEMINI_TTS_MODELS.includes(value.model as GeminiTtsModel) &&
		"language" in value && typeof value.language === "string" &&
		"voice" in value && typeof value.voice === "string" &&
		"styleInstructions" in value && typeof value.styleInstructions === "string" &&
		"rate" in value && typeof value.rate === "number" &&
		"pitch" in value && typeof value.pitch === "number" &&
		"volumeGain" in value && typeof value.volumeGain === "number" &&
		"createdAt" in value && typeof value.createdAt === "string"
	);
}

export function listGeminiTtsPresets(): GeminiTtsPreset[] {
	const file = presetsPath();
	if (!fs.existsSync(file)) return [];
	try {
		const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		return Array.isArray(value) ? value.filter(isPreset) : [];
	} catch {
		return [];
	}
}

export function getGeminiTtsPreset({ id }: { id: string }) {
	return listGeminiTtsPresets().find((preset) => preset.id === id) ?? null;
}

export function createGeminiTtsPreset(input: CreateGeminiTtsPreset) {
	const preset: GeminiTtsPreset = {
		...input,
		id: randomUUID(),
		createdAt: new Date().toISOString(),
	};
	const file = presetsPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify([...listGeminiTtsPresets(), preset]));
	return preset;
}

export function deleteGeminiTtsPreset({ id }: { id: string }) {
	const presets = listGeminiTtsPresets();
	const remaining = presets.filter((preset) => preset.id !== id);
	if (remaining.length === presets.length) return false;
	const file = presetsPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(remaining));
	return true;
}

