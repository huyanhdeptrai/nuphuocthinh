import fs from "node:fs";
import path from "node:path";
import { componentsRoot } from "./runtime-paths";

export type TtsEngineId = "vieneu" | "supertonic" | "omnivoice";

export function ttsEngineRoot(developmentRoot: string, engine: TtsEngineId) {
	return path.join(componentsRoot({ developmentRoot }), `tts-${engine}`);
}

export function legacyTtsEngineRoot(root: string, engine: TtsEngineId) {
	return path.join(root, ".local-services", engine);
}

export function ttsEnginePython(root: string, engine: TtsEngineId) {
	const portable = path.join(ttsEngineRoot(root, engine), "python", "python.exe");
	if (fs.existsSync(portable)) return portable;
	return path.join(legacyTtsEngineRoot(root, engine), ".venv", "Scripts", "python.exe");
}

export function ttsEngineDataRoot(root: string, engine: TtsEngineId) {
	const portable = path.join(ttsEngineRoot(root, engine), "data");
	return fs.existsSync(portable) ? portable : path.join(legacyTtsEngineRoot(root, engine), "data");
}

export function ttsEngineSitePackages(root: string, engine: TtsEngineId) {
	const portable = path.join(ttsEngineRoot(root, engine), "site-packages");
	return fs.existsSync(portable)
		? portable
		: path.join(legacyTtsEngineRoot(root, engine), ".venv", "Lib", "site-packages");
}

export function ttsEngineModelsRoot(root: string, engine: TtsEngineId) {
	return path.join(ttsEngineRoot(root, engine), "models");
}

export function isTtsEngineInstalled(root: string, engine: TtsEngineId) {
	return fs.existsSync(path.join(ttsEngineRoot(root, engine), "current.json")) ||
		fs.existsSync(ttsEnginePython(root, engine));
}
