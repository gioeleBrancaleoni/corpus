import fs from "node:fs";
import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings } from "@/lib/config";
import { buildTree } from "@/lib/tree";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  const { rootDir } = loadSettings();
  if (!rootDir) return Response.json({ ok: false, error: "no-root" });
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return Response.json({ ok: false, error: "root-missing" });
  }
  return Response.json({ ok: true, tree: buildTree(rootDir) });
}
