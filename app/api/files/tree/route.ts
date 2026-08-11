import fs from "node:fs";
import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings } from "@/lib/config";
import { openStore } from "@/lib/store";
import { type TreeNode, buildTree } from "@/lib/tree";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  const { rootDir } = loadSettings();
  if (!rootDir) return Response.json({ ok: false, error: "no-root" });
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return Response.json({ ok: false, error: "root-missing" });
  }

  const tree = buildTree(rootDir);
  const store = openStore();
  try {
    const rows = new Map(store.listFiles().map((f) => [f.path, f]));
    annotate(tree, rows);
  } finally {
    store.close();
  }
  return Response.json({ ok: true, tree });
}

function annotate(node: TreeNode, rows: Map<string, { mtimeMs: number; size: number }>): void {
  if (node.type === "file" && node.status !== "unsupported") {
    const row = rows.get(node.path);
    node.status = !row
      ? "unindexed"
      : row.mtimeMs === node.mtimeMs && row.size === node.size
        ? "indexed"
        : "stale";
  }
  node.children?.forEach((c) => annotate(c, rows));
}
