import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PUT } from "@/app/api/settings/route";
import { saveSettings } from "@/lib/config";
import { openStore } from "@/lib/store";

let tmp: string;

function seedIndex(): void {
  const store = openStore();
  const id = store.upsertFile({ path: "a.md", sha256: "x", mtimeMs: 1, size: 1, indexedAt: 1 });
  store.replaceChunks(id, [
    { ordinal: 0, text: "t", embedding: Float32Array.from([1]), startOffset: 0, endOffset: 1 },
  ]);
  store.close();
}

function chunkCount(): number {
  const store = openStore();
  const n = store.allChunks().length;
  store.close();
  return n;
}

function put(body: unknown): Promise<Response> {
  return PUT(
    new Request("http://x/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-settings-route-"));
  process.env.CORPUS_DATA_DIR = path.join(tmp, "data");
  saveSettings({ rootDir: path.join(tmp, "library-a") });
  seedIndex();
});

afterEach(() => {
  delete process.env.CORPUS_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("PUT /api/settings — root change wipes the index", () => {
  it("wipes chunks when rootDir changes", async () => {
    expect(chunkCount()).toBe(1);
    const res = await put({ rootDir: path.join(tmp, "library-b") });
    expect(res.status).toBe(200);
    expect(chunkCount()).toBe(0);
  });

  it("keeps the index for unrelated changes", async () => {
    await put({ topK: 9 });
    expect(chunkCount()).toBe(1);
  });

  it("keeps the index when the same root is re-saved (trailing slash tolerated)", async () => {
    await put({ rootDir: path.join(tmp, "library-a") + path.sep });
    expect(chunkCount()).toBe(1);
  });
});
