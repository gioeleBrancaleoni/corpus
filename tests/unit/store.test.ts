import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Store, openStore } from "@/lib/store";

let tmp: string;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-store-"));
  store = openStore(path.join(tmp, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fileA = { path: "docs/a.md", sha256: "aaa", mtimeMs: 111, size: 10, indexedAt: 1000 };

describe("files", () => {
  it("upserts and reads back a file row", () => {
    const id = store.upsertFile(fileA);
    expect(id).toBeGreaterThan(0);
    expect(store.getFileByPath("docs/a.md")).toMatchObject(fileA);
  });

  it("upsert on the same path updates in place and keeps the id", () => {
    const id1 = store.upsertFile(fileA);
    const id2 = store.upsertFile({ ...fileA, sha256: "bbb" });
    expect(id2).toBe(id1);
    expect(store.getFileByPath("docs/a.md")!.sha256).toBe("bbb");
    expect(store.listFiles()).toHaveLength(1);
  });

  it("deleteFile cascades to chunks", () => {
    const id = store.upsertFile(fileA);
    store.replaceChunks(id, [
      { ordinal: 0, text: "hello", embedding: Float32Array.from([1, 2]), startOffset: 0, endOffset: 5 },
    ]);
    store.deleteFile("docs/a.md");
    expect(store.getFileByPath("docs/a.md")).toBeUndefined();
    expect(store.allChunks()).toHaveLength(0);
  });
});

describe("chunks", () => {
  it("round-trips embeddings exactly as Float32Array", () => {
    const id = store.upsertFile(fileA);
    const vec = Float32Array.from([0.25, -1.5, 3.125, 1e-7]);
    store.replaceChunks(id, [
      { ordinal: 0, text: "chunk zero", embedding: vec, startOffset: 0, endOffset: 10 },
      { ordinal: 1, text: "chunk one", embedding: Float32Array.from([9, 8, 7, 6]), startOffset: 8, endOffset: 17 },
    ]);
    const rows = store.chunksByFile(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(rows[0]!.embedding)).toEqual(Array.from(vec));
    expect(rows[1]!.text).toBe("chunk one");
  });

  it("replaceChunks replaces, not appends", () => {
    const id = store.upsertFile(fileA);
    const mk = (n: number) => ({
      ordinal: n,
      text: `c${n}`,
      embedding: Float32Array.from([n]),
      startOffset: 0,
      endOffset: 2,
    });
    store.replaceChunks(id, [mk(0), mk(1), mk(2)]);
    store.replaceChunks(id, [mk(0)]);
    expect(store.allChunks()).toHaveLength(1);
  });

  it("wipe empties everything", () => {
    const id = store.upsertFile(fileA);
    store.replaceChunks(id, [
      { ordinal: 0, text: "x", embedding: Float32Array.from([1]), startOffset: 0, endOffset: 1 },
    ]);
    store.wipe();
    expect(store.listFiles()).toHaveLength(0);
    expect(store.allChunks()).toHaveLength(0);
  });
});
