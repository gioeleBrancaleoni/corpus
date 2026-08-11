export interface SearchHit {
  chunkId: number;
  score: number;
}

/**
 * Retrieval interface (spec §4): brute-force cosine today; swappable for
 * sqlite-vec / LanceDB later without touching callers.
 */
export interface VectorStore {
  search(query: Float32Array, k: number): SearchHit[];
}

export class DimensionMismatchError extends Error {
  constructor(a: number, b: number) {
    super(`embedding dimensions differ: ${a} vs ${b}`);
    this.name = "DimensionMismatchError";
  }
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new DimensionMismatchError(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class BruteForceStore implements VectorStore {
  private entries: { chunkId: number; embedding: Float32Array }[];

  constructor(entries: { chunkId: number; embedding: Float32Array }[]) {
    this.entries = entries;
  }

  search(query: Float32Array, k: number): SearchHit[] {
    const scored = this.entries.map((e) => ({
      chunkId: e.chunkId,
      score: cosineSim(query, e.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
