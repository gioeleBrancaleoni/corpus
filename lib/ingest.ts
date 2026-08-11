import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chunkText } from "./chunk";
import { loadSettings, saveSettings } from "./config";
import { extractText } from "./extract";
import { embed as ollamaEmbed } from "./ollama";
import { type Store, openStore } from "./store";
import { listSupportedFiles } from "./tree";
import type { Settings } from "./types";
import { normalizeVec } from "./vector";

/**
 * Version of the on-disk vector representation. "unit-f32-v1" = embeddings
 * stored unit-normalized so retrieval is a plain dot product. Bump this when
 * the stored representation changes; a mismatch wipes and rebuilds the index
 * (same mechanism as an embedModel change) so normalized and non-normalized
 * vectors are never mixed.
 */
export const INDEX_FORMAT = "unit-f32-v1";

export interface FileError {
  path: string;
  message: string;
}

export interface IngestProgress {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  totalFiles: number;
  doneFiles: number;
  currentFile: string | null;
  fileErrors: FileError[];
  error?: string;
  startedAt?: number;
}

// Module-level singleton job state; one Next.js process (spec §7).
let progress: IngestProgress = {
  state: "idle",
  totalFiles: 0,
  doneFiles: 0,
  currentFile: null,
  fileErrors: [],
};
let cancelled = false;

export function getProgress(): IngestProgress {
  return progress;
}

export function cancelIngest(): void {
  if (progress.state === "running") cancelled = true;
}

/**
 * True when the existing index is incompatible with the current settings —
 * written with a different embedding model, or in an older stored vector
 * format. An empty index is never stale. Callers must either wipe+rebuild
 * (full ingest) or refuse to add vectors (single-file upload): mixing
 * representations silently corrupts retrieval.
 */
export function indexIsStale(store: Store, settings: Settings): boolean {
  if (store.listFiles().length === 0) return false;
  return (
    store.getMeta("embedModel") !== settings.embedModel ||
    store.getMeta("indexFormat") !== INDEX_FORMAT
  );
}

interface IngestDeps {
  embedFn?: typeof ollamaEmbed;
  store?: Store;
  settings?: Settings;
}

export async function runIngest(deps?: IngestDeps): Promise<IngestProgress> {
  if (progress.state === "running") return progress;

  const settings = deps?.settings ?? loadSettings();
  const embedFn = deps?.embedFn ?? ollamaEmbed;
  const ownStore = !deps?.store;
  const store = deps?.store ?? openStore();

  cancelled = false;
  progress = {
    state: "running",
    totalFiles: 0,
    doneFiles: 0,
    currentFile: null,
    fileErrors: [],
    startedAt: Date.now(),
  };

  try {
    const { rootDir } = settings;
    if (!rootDir || !fs.existsSync(rootDir)) {
      progress = { ...progress, state: "error", error: "no library folder configured" };
      return progress;
    }

    // Changing the embedding model changes vector dimensions, and an index
    // written in an older vector format can't be mixed with the current one:
    // both cases rebuild from scratch.
    if (indexIsStale(store, settings)) {
      store.wipe();
      saveSettings({ embedDim: null });
    }

    const files = listSupportedFiles(rootDir);
    progress = { ...progress, totalFiles: files.length };

    // Remove DB rows for files that vanished from disk.
    const onDisk = new Set(files);
    for (const row of store.listFiles()) {
      if (!onDisk.has(row.path)) store.deleteFile(row.path);
    }

    for (const relPath of files) {
      if (cancelled) {
        progress = { ...progress, state: "cancelled", currentFile: null };
        return progress;
      }
      progress = { ...progress, currentFile: relPath };
      try {
        await ingestOne(rootDir, relPath, settings, store, embedFn);
      } catch (err) {
        progress.fileErrors.push({
          path: relPath,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      progress = { ...progress, doneFiles: progress.doneFiles + 1 };
    }

    store.setMeta("embedModel", settings.embedModel);
    store.setMeta("indexFormat", INDEX_FORMAT);
    progress = { ...progress, state: cancelled ? "cancelled" : "done", currentFile: null };
    return progress;
  } catch (err) {
    progress = {
      ...progress,
      state: "error",
      error: err instanceof Error ? err.message : String(err),
    };
    return progress;
  } finally {
    if (ownStore) store.close();
  }
}

/** Extract → chunk → embed → store ONE file. Exported for the upload flow. */
export async function ingestOne(
  rootDir: string,
  relPath: string,
  settings: Settings,
  store: Store,
  embedFn: typeof ollamaEmbed,
): Promise<void> {
  const abs = path.join(rootDir, ...relPath.split("/"));
  const stat = fs.statSync(abs);
  const existing = store.getFileByPath(relPath);

  // Fast path: identical mtime + size → assume unchanged, skip hashing.
  if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) return;

  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  if (existing && existing.sha256 === sha256) {
    // Touched but identical content: refresh stat info only.
    store.upsertFile({ path: relPath, sha256, mtimeMs: stat.mtimeMs, size: stat.size, indexedAt: Date.now() });
    return;
  }

  const text = await extractText(abs);
  const chunks = chunkText(text, { size: settings.chunkSize, overlap: settings.chunkOverlap });
  // Stored unit-normalized (INDEX_FORMAT) so search is a plain dot product.
  const embeddings = (
    await embedFn(
      settings.ollamaHost,
      settings.embedModel,
      chunks.map((c) => c.text),
    )
  ).map(normalizeVec);

  if (settings.embedDim === null && embeddings.length > 0) {
    saveSettings({ embedDim: embeddings[0]!.length });
  }

  const fileId = store.upsertFile({
    path: relPath,
    sha256,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    indexedAt: Date.now(),
  });
  store.replaceChunks(
    fileId,
    chunks.map((c, i) => ({
      ordinal: c.ordinal,
      text: c.text,
      embedding: embeddings[i]!,
      startOffset: c.start,
      endOffset: c.end,
    })),
  );
}
