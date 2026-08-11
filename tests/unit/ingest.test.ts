import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelIngest, getProgress, indexIsStale, runIngest } from "@/lib/ingest";
import { type Store, openStore } from "@/lib/store";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/config";

let tmp: string;
let root: string;
let store: Store;
let settings: Settings;

const embedFn = vi.fn(async (_host: string, _model: string, texts: string[]) =>
  texts.map((t) => Float32Array.from([t.length, 1, 2])),
);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-ingest-"));
  process.env.CORPUS_DATA_DIR = path.join(tmp, "data");
  root = path.join(tmp, "library");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "one.md"), "# One\n\nfirst document");
  fs.writeFileSync(path.join(root, "two.txt"), "second document");
  fs.writeFileSync(path.join(root, "docs", "three.csv"), "a,b\n1,2");
  store = openStore(path.join(tmp, "test.db"));
  settings = { ...DEFAULT_SETTINGS, rootDir: root };
  embedFn.mockClear();
});

afterEach(() => {
  store.close();
  delete process.env.CORPUS_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runIngest", () => {
  it("indexes all supported files with chunks and embeddings", async () => {
    const result = await runIngest({ embedFn, store, settings });
    expect(result.state).toBe("done");
    expect(result.totalFiles).toBe(3);
    expect(result.doneFiles).toBe(3);
    expect(store.listFiles()).toHaveLength(3);
    expect(store.allChunks().length).toBeGreaterThanOrEqual(3);
    expect(store.allChunks()[0]!.embedding).toBeInstanceOf(Float32Array);
  });

  it("is incremental: unchanged files are not re-embedded", async () => {
    await runIngest({ embedFn, store, settings });
    embedFn.mockClear();
    const result = await runIngest({ embedFn, store, settings });
    expect(result.state).toBe("done");
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("re-embeds only a touched file", async () => {
    await runIngest({ embedFn, store, settings });
    embedFn.mockClear();
    fs.writeFileSync(path.join(root, "one.md"), "# One\n\nchanged content!");
    await runIngest({ embedFn, store, settings });
    expect(embedFn).toHaveBeenCalledTimes(1);
    const texts = embedFn.mock.calls[0]![2];
    expect(texts.join(" ")).toContain("changed content!");
  });

  it("removes rows for files deleted from disk", async () => {
    await runIngest({ embedFn, store, settings });
    fs.rmSync(path.join(root, "two.txt"));
    await runIngest({ embedFn, store, settings });
    expect(store.listFiles().map((f) => f.path).sort()).toEqual(["docs/three.csv", "one.md"]);
  });

  it("stores embeddings unit-normalized", async () => {
    await runIngest({ embedFn, store, settings });
    for (const chunk of store.allChunks()) {
      expect(Math.hypot(...chunk.embedding)).toBeCloseTo(1, 5);
    }
  });

  it("rebuilds when the stored index predates the current vector format", async () => {
    await runIngest({ embedFn, store, settings });
    store.setMeta("indexFormat", "legacy-raw-f32");
    embedFn.mockClear();
    await runIngest({ embedFn, store, settings });
    expect(embedFn).toHaveBeenCalledTimes(3); // full re-embed, not incremental skip
    expect(store.getMeta("indexFormat")).toBe("unit-f32-v1");
  });

  it("wipes the index when the embedding model changes", async () => {
    await runIngest({ embedFn, store, settings });
    embedFn.mockClear();
    await runIngest({ embedFn, store, settings: { ...settings, embedModel: "other-model" } });
    // all three files re-embedded from scratch
    expect(embedFn).toHaveBeenCalledTimes(3);
    expect(store.getMeta("embedModel")).toBe("other-model");
  });

  it("can be cancelled between files", async () => {
    const slowEmbed = vi.fn(async (_h: string, _m: string, texts: string[]) => {
      cancelIngest();
      return texts.map(() => Float32Array.from([1]));
    });
    const result = await runIngest({ embedFn: slowEmbed, store, settings });
    expect(result.state).toBe("cancelled");
    expect(result.doneFiles).toBeLessThan(result.totalFiles);
    expect(getProgress().state).toBe("cancelled");
  });

  it("records per-file errors and keeps going", async () => {
    fs.writeFileSync(path.join(root, "broken.pdf"), "not really a pdf");
    const result = await runIngest({ embedFn, store, settings });
    expect(result.state).toBe("done");
    expect(result.doneFiles).toBe(4);
    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0]!.path).toBe("broken.pdf");
    // the other three still made it
    expect(store.listFiles()).toHaveLength(3);
  });

  it("indexIsStale: empty store never stale; mismatched model or format is", async () => {
    expect(indexIsStale(store, settings)).toBe(false); // empty store
    await runIngest({ embedFn, store, settings });
    expect(indexIsStale(store, settings)).toBe(false); // matching model + format
    expect(indexIsStale(store, { ...settings, embedModel: "other-model" })).toBe(true);
    store.setMeta("indexFormat", "legacy-raw-f32");
    expect(indexIsStale(store, settings)).toBe(true); // old vector format
  });

  it("errors cleanly when no root is configured", async () => {
    const result = await runIngest({ embedFn, store, settings: { ...settings, rootDir: null } });
    expect(result.state).toBe("error");
  });
});
