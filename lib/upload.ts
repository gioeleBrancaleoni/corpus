import fs from "node:fs";
import path from "node:path";
import { chatStream } from "./ollama";
import type { Settings } from "./types";

/**
 * Smart-upload helpers. THE MODEL'S FOLDER SUGGESTION IS UNTRUSTED INPUT:
 * everything that could become part of a filesystem path goes through the
 * sanitizers here, and the route additionally confines the final path with
 * resolveSafe. Pure functions are kept dependency-free for unit testing.
 */

const WINDOWS_RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/**
 * Collapse an untrusted folder suggestion into ONE safe path segment:
 * lowercase kebab-case, [a-z0-9-] only, ≤40 chars. Returns "" when nothing
 * safe survives — the caller must fall back to the fixed "inbox" folder.
 */
export function sanitizeFolderName(raw: string): string {
  const kebab = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics left by NFKD
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  if (!kebab || kebab === "." || kebab === ".." || WINDOWS_RESERVED.has(kebab)) return "";
  return kebab;
}

/** Keep only a clean basename: no directories, no null bytes, no control chars. */
export function sanitizeFileName(raw: string): string {
  // win32.basename treats both / and \ as separators on every platform.
  const base = path.win32.basename(raw.replaceAll("\0", ""));
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean || clean === "." || clean === "..") return "upload";
  return clean;
}

/** First free filename in dir: name.ext, name-2.ext, name-3.ext… Never overwrites. */
export function dedupeName(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let candidate = filename;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i++) {
    candidate = `${stem}-${i}${ext}`;
  }
  return candidate;
}

export interface Classification {
  folder: string;
  isNew: boolean;
  reason?: string;
}

/** Robustly extract the classification JSON from a model answer, or null. */
export function parseClassification(text: string): Classification | null {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.folder !== "string") return null;
  return {
    folder: rec.folder,
    isNew: Boolean(rec.isNew),
    reason: typeof rec.reason === "string" ? rec.reason : undefined,
  };
}

/** Existing top-level folders under the library root (skips dotdirs/node_modules). */
export function listTopLevelFolders(rootDir: string): string[] {
  try {
    return fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const ANSWER_CAP = 2000;

/**
 * Ask the chat model where the document belongs. Returns null on any failure —
 * classification must never fail the upload (caller falls back to inbox).
 */
export async function classifyDocument(
  snippet: string,
  existingFolders: string[],
  settings: Settings,
  chatFn: typeof chatStream = chatStream,
): Promise<Classification | null> {
  const folderList = existingFolders.length > 0 ? existingFolders.join(", ") : "(none yet)";
  const prompt =
    "You are a filing assistant. A user uploaded a document; place it in a folder.\n" +
    `Existing folders: ${folderList}\n` +
    "Pick the best existing folder, or propose ONE concise new kebab-case name.\n" +
    'Reply with ONLY this JSON: {"folder":"<kebab-case>","isNew":<boolean>,"reason":"<short>"}\n\n' +
    `Document excerpt:\n"""\n${snippet}\n"""`;
  try {
    let answer = "";
    for await (const delta of chatFn(settings.ollamaHost, settings.chatModel, [
      { role: "user", content: prompt },
    ])) {
      answer += delta;
      if (answer.length > ANSWER_CAP) break;
    }
    return parseClassification(answer);
  } catch {
    return null;
  }
}
