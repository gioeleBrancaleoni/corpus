import path from "node:path";
import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings, saveSettings } from "@/lib/config";
import { openStore } from "@/lib/store";
import type { Settings } from "@/lib/types";

/** Same library root? Tolerant of trailing slashes / relative segments. */
function sameRoot(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return path.resolve(a) === path.resolve(b);
}

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  return Response.json(loadSettings());
}

function validationError(patch: Partial<Settings>): string | null {
  if (patch.topK !== undefined && (patch.topK < 1 || patch.topK > 20)) {
    return "topK must be between 1 and 20";
  }
  if (patch.chunkSize !== undefined && (patch.chunkSize < 500 || patch.chunkSize > 20000)) {
    return "chunkSize must be between 500 and 20000";
  }
  const size = patch.chunkSize ?? loadSettings().chunkSize;
  if (patch.chunkOverlap !== undefined && (patch.chunkOverlap < 0 || patch.chunkOverlap >= size)) {
    return "chunkOverlap must be >= 0 and smaller than chunkSize";
  }
  if (
    patch.vramGiB !== undefined &&
    patch.vramGiB !== null &&
    (typeof patch.vramGiB !== "number" || patch.vramGiB < 0 || patch.vramGiB > 2048)
  ) {
    return "vramGiB must be a number of GiB (0–2048) or null";
  }
  if (patch.maxUploadMB !== undefined && (patch.maxUploadMB < 1 || patch.maxUploadMB > 1024)) {
    return "maxUploadMB must be between 1 and 1024";
  }
  if (patch.ollamaHost !== undefined) {
    try {
      const url = new URL(patch.ollamaHost);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "ollamaHost must be http(s)";
    } catch {
      return "ollamaHost is not a valid URL";
    }
  }
  return null;
}

export async function PUT(req: Request) {
  if (!authorize(req)) return unauthorized();
  let patch: Partial<Settings>;
  try {
    patch = (await req.json()) as Partial<Settings>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const problem = validationError(patch);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const before = loadSettings();
  const saved = saveSettings(patch);

  // Changing the library root invalidates the index: chunks from the old
  // root would otherwise keep surfacing in answers until the next full
  // re-index. Wipe now; the tree shows everything as unindexed.
  if (patch.rootDir !== undefined && !sameRoot(before.rootDir, saved.rootDir)) {
    const store = openStore();
    try {
      store.wipe();
    } finally {
      store.close();
    }
    return Response.json(saveSettings({ embedDim: null }));
  }
  return Response.json(saved);
}
