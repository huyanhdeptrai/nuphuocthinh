import "server-only";

import fs from "node:fs";
import path from "node:path";

export type TtsProviderConfig = {
	omnivoiceEnabled: boolean;
};

const DEFAULT_CONFIG: TtsProviderConfig = {
	omnivoiceEnabled: false,
};

function workspaceRoot() {
	const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];
	return candidates.find((candidate) => fs.existsSync(path.join(candidate, "apps", "web"))) ?? process.cwd();
}

function configPath() {
	return path.join(workspaceRoot(), ".local-services", "tts-provider-settings.json");
}

export function getTtsProviderConfig(): TtsProviderConfig {
	const file = configPath();
	if (!fs.existsSync(file)) return DEFAULT_CONFIG;
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return DEFAULT_CONFIG;
		return {
			omnivoiceEnabled: "omnivoiceEnabled" in parsed && typeof parsed.omnivoiceEnabled === "boolean" ? parsed.omnivoiceEnabled : DEFAULT_CONFIG.omnivoiceEnabled,
		};
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function saveTtsProviderConfig(input: Partial<TtsProviderConfig>) {
	const next = { ...getTtsProviderConfig(), ...input };
	const file = configPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
	return next;
}
