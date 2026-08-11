import { describe, expect, it } from "vitest";
import { BruteForceStore, DimensionMismatchError, cosineSim, dot, normalizeVec } from "@/lib/vector";

const v = (...xs: number[]) => Float32Array.from(xs);

describe("normalizeVec / dot", () => {
  it("scales vectors to unit length", () => {
    const u = normalizeVec(v(3, 4));
    expect(Math.hypot(...u)).toBeCloseTo(1, 6);
    expect(u[0]).toBeCloseTo(0.6, 6);
  });

  it("leaves the zero vector unchanged (no NaN)", () => {
    expect(Array.from(normalizeVec(v(0, 0)))).toEqual([0, 0]);
  });

  it("dot product of unit vectors equals cosine of the originals", () => {
    const a = v(3, 1, -2);
    const b = v(0.5, 4, 1);
    expect(dot(normalizeVec(a), normalizeVec(b))).toBeCloseTo(cosineSim(a, b), 6);
  });

  it("dot throws on dimension mismatch", () => {
    expect(() => dot(v(1, 2), v(1, 2, 3))).toThrow(DimensionMismatchError);
  });
});

describe("cosineSim", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSim(v(1, 2, 3), v(1, 2, 3))).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSim(v(1, 0), v(0, 1))).toBeCloseTo(0, 6);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSim(v(2, 0), v(-4, 0))).toBeCloseTo(-1, 6);
  });

  it("is scale-invariant", () => {
    expect(cosineSim(v(1, 1), v(100, 100))).toBeCloseTo(1, 6);
  });

  it("guards zero vectors (returns 0, never NaN)", () => {
    expect(cosineSim(v(0, 0), v(1, 2))).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSim(v(1, 2), v(1, 2, 3))).toThrow(DimensionMismatchError);
  });
});

describe("BruteForceStore", () => {
  // Contract: entries are unit-normalized (the ingest write path guarantees it).
  const store = new BruteForceStore([
    { chunkId: 1, embedding: normalizeVec(v(1, 0)) }, // cos with (1, 0.1) ≈ 0.995
    { chunkId: 2, embedding: normalizeVec(v(0, 1)) }, // ≈ 0.0995
    { chunkId: 3, embedding: normalizeVec(v(1, 1)) }, // ≈ 0.778
    { chunkId: 4, embedding: normalizeVec(v(-1, 0)) }, // ≈ -0.995
  ]);

  it("returns top-k by descending cosine score", () => {
    const hits = store.search(v(1, 0.1), 2);
    expect(hits.map((h) => h.chunkId)).toEqual([1, 3]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[0]!.score).toBeCloseTo(1 / Math.sqrt(1.01), 4);
  });

  it("returns all entries when k exceeds the store size", () => {
    expect(store.search(v(1, 0), 10)).toHaveLength(4);
  });

  it("throws on query dimension mismatch", () => {
    expect(() => store.search(v(1, 2, 3), 2)).toThrow(DimensionMismatchError);
  });

  it("handles an empty store", () => {
    expect(new BruteForceStore([]).search(v(1, 0), 5)).toEqual([]);
  });
});
