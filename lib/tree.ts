import fs from "node:fs";
import path from "node:path";
import { isSupported } from "./fs-safe";

export interface TreeNode {
  name: string;
  /** Relative to the library root, always forward-slash separated. */
  path: string;
  type: "dir" | "file";
  size?: number;
  status?: "indexed" | "stale" | "unindexed" | "unsupported";
  children?: TreeNode[];
}

const ALWAYS_SKIPPED = new Set(["node_modules"]);

function readIgnoreList(root: string): string[] {
  try {
    return fs
      .readFileSync(path.join(root, ".corpusignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.replaceAll("\\", "/").replace(/\/+$/, ""));
  } catch {
    return [];
  }
}

function isIgnored(relPath: string, name: string, ignore: string[]): boolean {
  if (name.startsWith(".")) return true;
  if (ALWAYS_SKIPPED.has(name)) return true;
  // .corpusignore entries match by bare name or by relative-path prefix.
  return ignore.some((entry) => name === entry || relPath === entry || relPath.startsWith(`${entry}/`));
}

function walk(absDir: string, relDir: string, ignore: string[]): TreeNode[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (isIgnored(rel, entry.name, ignore)) continue;
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: "dir",
        children: walk(path.join(absDir, entry.name), rel, ignore),
      });
    } else if (entry.isFile()) {
      const abs = path.join(absDir, entry.name);
      nodes.push({
        name: entry.name,
        path: rel,
        type: "file",
        size: fs.statSync(abs).size,
        status: isSupported(entry.name) ? "unindexed" : "unsupported",
      });
    }
    // symlinks are intentionally not followed here; fs-safe rejects them on access
  }
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
  );
  return nodes;
}

export function buildTree(root: string): TreeNode {
  const ignore = readIgnoreList(root);
  return {
    name: path.basename(root),
    path: "",
    type: "dir",
    children: walk(root, "", ignore),
  };
}

/** Flat list of every supported file in the tree, as relative paths. */
export function listSupportedFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (node: TreeNode) => {
    if (node.type === "file" && node.status !== "unsupported") out.push(node.path);
    node.children?.forEach(visit);
  };
  visit(buildTree(root));
  return out;
}
