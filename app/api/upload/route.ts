import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings } from "@/lib/config";
import { extractText } from "@/lib/extract";
import { PathEscapeError, isSupported, resolveSafe } from "@/lib/fs-safe";
import { INDEX_FORMAT, ingestOne } from "@/lib/ingest";
import { embed } from "@/lib/ollama";
import { openStore } from "@/lib/store";
import {
  classifyDocument,
  dedupeName,
  listTopLevelFolders,
  sanitizeFileName,
  sanitizeFolderName,
} from "@/lib/upload";

const SNIPPET_CHARS = 3000;
const INBOX = "inbox";

/**
 * Smart upload: multipart file (+ optional `folder` override) → classify via
 * the local model → file it into a sanitized, confined subfolder of the
 * library root → index just that file.
 *
 * Security invariants (spec §10 still applies):
 *  - the model's folder suggestion is UNTRUSTED → sanitizeFolderName + resolveSafe
 *  - never overwrite existing files (dedupeName)
 *  - classification failure never fails the upload (falls back to inbox/)
 */
export async function POST(req: Request) {
  if (!authorize(req)) return unauthorized();
  const settings = loadSettings();
  if (!settings.rootDir || !fs.existsSync(settings.rootDir)) {
    return Response.json({ error: "no library folder configured" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file field" }, { status: 400 });
  }
  if (file.size > settings.maxUploadMB * 1024 * 1024) {
    return Response.json(
      { error: `file exceeds the ${settings.maxUploadMB} MB upload limit` },
      { status: 413 },
    );
  }
  const fileName = sanitizeFileName(file.name);
  if (!isSupported(fileName)) {
    return Response.json(
      { error: `unsupported file type: ${path.extname(fileName) || "unknown"}` },
      { status: 415 },
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-upload-"));
  const tmpPath = path.join(tmpDir, fileName);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(await file.arrayBuffer()));

    // Decide the folder: manual override, or model classification, or inbox.
    let folder = "";
    let reason: string | undefined;
    const override = form.get("folder");
    if (typeof override === "string" && override.trim()) {
      folder = sanitizeFolderName(override);
      reason = folder ? "manual override" : "override was not a usable name — placed in inbox";
    } else {
      try {
        const text = await extractText(tmpPath);
        const result = await classifyDocument(
          text.slice(0, SNIPPET_CHARS),
          listTopLevelFolders(settings.rootDir),
          settings,
        );
        if (result) {
          folder = sanitizeFolderName(result.folder);
          reason = folder ? result.reason : "model suggestion was not a usable name — placed in inbox";
        } else {
          reason = "classification unavailable — placed in inbox";
        }
      } catch {
        reason = "could not read the document for classification — placed in inbox";
      }
    }
    if (!folder) folder = INBOX;

    // Confine and place. resolveSafe throws on anything escaping the root.
    const destDir = resolveSafe(settings.rootDir, folder);
    const isNew = !fs.existsSync(destDir);
    fs.mkdirSync(destDir, { recursive: true });
    const finalName = dedupeName(destDir, fileName);
    const relPath = `${folder}/${finalName}`;
    const destPath = resolveSafe(settings.rootDir, relPath);
    fs.copyFileSync(tmpPath, destPath, fs.constants.COPYFILE_EXCL);

    // Index just this file so it's immediately queryable.
    let indexed = true;
    const store = openStore();
    try {
      await ingestOne(settings.rootDir, relPath, settings, store, embed);
      if (store.getMeta("embedModel") === undefined) store.setMeta("embedModel", settings.embedModel);
      if (store.getMeta("indexFormat") === undefined) store.setMeta("indexFormat", INDEX_FORMAT);
    } catch (err) {
      indexed = false;
      reason = `${reason ? `${reason}; ` : ""}indexing failed: ${
        err instanceof Error ? err.message : "unknown error"
      } — re-run Index library`;
    } finally {
      store.close();
    }

    return Response.json({ path: relPath, folder, isNew, indexed, reason });
  } catch (err) {
    if (err instanceof PathEscapeError) {
      return Response.json({ error: "destination outside the library root" }, { status: 403 });
    }
    return Response.json({ error: "upload failed" }, { status: 500 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
