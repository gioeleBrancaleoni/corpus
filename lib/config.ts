import fs from "node:fs";
import path from "node:path";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  rootDir: null,
  ollamaHost: "http://localhost:11434",
  chatModel: "qwen2.5:7b",
  embedModel: "nomic-embed-text",
  embedDim: null,
  topK: 6,
  chunkSize: 3200,
  chunkOverlap: 600,
  vramGiB: null,
};

export function dataDir(): string {
  const dir = process.env.CORPUS_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configPath(): string {
  return path.join(dataDir(), "config.json");
}

/** Keep a saved value only when its type matches the default's type (null defaults accept strings/numbers). */
function sanitize(raw: unknown): Partial<Settings> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, unknown> = {};
  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = source[key];
    if (value === undefined) continue;
    const def = DEFAULT_SETTINGS[key];
    if (def === null) {
      if (value === null || typeof value === "string" || typeof value === "number") out[key] = value;
    } else if (typeof value === typeof def) {
      out[key] = value;
    }
  }
  return out as Partial<Settings>;
}

export function loadSettings(): Settings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...sanitize(parsed) };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const merged = { ...loadSettings(), ...sanitize(patch) };
  const file = configPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
  fs.renameSync(tmp, file);
  return merged;
}
