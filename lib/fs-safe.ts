import fs from "node:fs";
import path from "node:path";

/**
 * Path confinement (spec §10). Every client-supplied path in every file API
 * must pass through resolveSafe before touching the filesystem.
 */
export class PathEscapeError extends Error {
  constructor(reason: string) {
    super(`path rejected: ${reason}`);
    this.name = "PathEscapeError";
  }
}

/**
 * Resolve `requested` (a relative path from the UI) against `root` and return
 * the absolute path, or throw PathEscapeError if it escapes the root in any
 * way: `..`, absolute paths (POSIX, drive-letter, UNC), `~`, null bytes, or
 * symlinks pointing outside.
 */
export function resolveSafe(root: string, requested: string): string {
  if (requested.includes("\0")) throw new PathEscapeError("null byte");
  // Reject absolute-ish inputs before resolution: POSIX "/", Windows drive
  // ("C:"), UNC/backslash-rooted ("\\server", "\x"), and home expansion ("~").
  if (/^[\\/]/.test(requested) || /^[A-Za-z]:/.test(requested) || requested.startsWith("~")) {
    throw new PathEscapeError("absolute or home path");
  }

  // Treat backslashes as separators regardless of platform so Windows-style
  // traversal ("..\\..\\x") is caught on Linux too.
  const normalizedRequest = requested.replaceAll("\\", "/");
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, normalizedRequest);

  const rel = path.relative(normalizedRoot, resolved);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new PathEscapeError("escapes root");
  }

  // Real-path check: find the nearest existing ancestor of the resolved path,
  // canonicalize it, and require it to still live under the canonical root.
  // This defeats symlink escapes (file or directory).
  const realRoot = fs.realpathSync.native(normalizedRoot);
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = fs.realpathSync.native(probe);
  const relReal = path.relative(realRoot, realProbe);
  if (relReal === ".." || relReal.startsWith(`..${path.sep}`) || path.isAbsolute(relReal)) {
    throw new PathEscapeError("symlink escapes root");
  }

  return resolved;
}

const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".pdf",
  ".docx",
  // code
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".php",
  ".sh",
  ".sql",
  ".html",
  ".css",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
]);

export function isSupported(p: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(p).toLowerCase());
}
