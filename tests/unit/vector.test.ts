import { describe, expect, it } from "vitest";
import { BruteForceStore, DimensionMismatchError, cosineSim } from "@/lib/vector";

const v = (...xs: number[]) => Float32Array.from(xs);

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
  const store = new BruteForceStore([
    { chunkId: 1, embedding: v(1, 0) }, // cos with (1, 0.1) ≈ 0.995
    { chunkId: 2, embedding: v(0, 1) }, // ≈ 0.0995
    { chunkId: 3, embedding: v(1, 1) }, // ≈ 0.778
    { chunkId: 4, embedding: v(-1, 0) }, // ≈ -0.995
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
