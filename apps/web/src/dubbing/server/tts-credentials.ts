import "server-only";

import fs from "node:fs";
import path from "node:path";

export type TtsCredentialProvider = "gemini" | "elevenlabs";
type StoredCredentials = Partial<Record<TtsCredentialProvider, string>>;

function workspaceRoot() {
	const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];
	return candidates.find((candidate) => fs.existsSync(path.join(candidate, "apps", "web"))) ?? process.cwd();
}

function credentialsPath() {
	return path.join(workspaceRoot(), ".local-services", "tts-credentials.json");
}

function readStored(): StoredCredentials {
	const file = credentialsPath();
	if (!fs.existsSync(file)) return {};
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return {};
		return {
			gemini: "gemini" in parsed && typeof parsed.gemini === "string" ? parsed.gemini : undefined,
			elevenlabs: "elevenlabs" in parsed && typeof parsed.elevenlabs === "string" ? parsed.elevenlabs : undefined,
		};
	} catch {
		return {};
	}
}

export function getTtsApiKey(provider: TtsCredentialProvider) {
	if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || readStored().gemini;
	return process.env.ELEVENLABS_API_KEY || readStored().elevenlabs;
}

export function getTtsCredentialStatus() {
	const stored = readStored();
	return {
		gemini: { configured: Boolean(getTtsApiKey("gemini")), source: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "environment" as const : stored.gemini ? "local" as const : null },
		elevenlabs: { configured: Boolean(getTtsApiKey("elevenlabs")), source: process.env.ELEVENLABS_API_KEY ? "environment" as const : stored.elevenlabs ? "local" as const : null },
	};
}

export function saveTtsApiKeys(input: Partial<Record<TtsCredentialProvider, string | null>>) {
	const current = readStored();
	for (const provider of ["gemini", "elevenlabs"] as const) {
		if (!(provider in input)) continue;
		const value = input[provider]?.trim();
		if (value) current[provider] = value;
		else delete current[provider];
	}
	const file = credentialsPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(current), { encoding: "utf8", mode: 0o600 });
	return getTtsCredentialStatus();
}

