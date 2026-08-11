import fs from "node:fs";
import path from "node:path";
import { authorize, unauthorized } from "./auth";
import { loadSettings } from "./config";
import { PathEscapeError, resolveSafe } from "./fs-safe";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/plain; charset=utf-8", // never serve library HTML as HTML
  ".json": "application/json; charset=utf-8",
};

export function contentTypeFor(p: string): string {
  return CONTENT_TYPES[path.extname(p).toLowerCase()] ?? "text/plain; charset=utf-8";
}

/**
 * Shared guts of /api/files/raw and /api/files/download: authorize, confine
 * the requested path, and stream the file with safe headers.
 */
export function serveFile(req: Request, disposition: "inline" | "attachment"): Response {
  if (!authorize(req)) return unauthorized();
  const { rootDir } = loadSettings();
  if (!rootDir) return Response.json({ error: "no library folder configured" }, { status: 400 });

  const requested = new URL(req.url).searchParams.get("path") ?? "";
  let abs: string;
  try {
    abs = resolveSafe(rootDir, requested);
  } catch (err) {
    if (err instanceof PathEscapeError) {
      return Response.json({ error: "path outside the library root" }, { status: 403 });
    }
    throw err;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
  if (!stat.isFile()) return Response.json({ error: "not a file" }, { status: 400 });

  const filename = path.basename(abs);
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  const utf8Name = encodeURIComponent(filename);
  const body = new Uint8Array(fs.readFileSync(abs));
  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(abs),
      "Content-Length": String(stat.size),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
