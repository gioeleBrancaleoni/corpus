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

/** Scale a vector to unit length. The zero vector is returned unchanged. */
export function normalizeVec(v: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < v.length; i++) sumSquares += v[i]! * v[i]!;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

/** Plain dot product; equals cosine similarity when both vectors are unit length. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new DimensionMismatchError(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
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

/**
 * Contract: entries' embeddings MUST already be unit-normalized (the ingest
 * write path guarantees this — see INDEX_FORMAT in lib/ingest.ts). The query
 * is normalized once here, so the hot loop is a plain dot product with no
 * per-entry norm work.
 */
export class BruteForceStore implements VectorStore {
  private entries: { chunkId: number; embedding: Float32Array }[];

  constructor(entries: { chunkId: number; embedding: Float32Array }[]) {
    this.entries = entries;
  }

  search(query: Float32Array, k: number): SearchHit[] {
    const unitQuery = normalizeVec(query);
    const scored = this.entries.map((e) => ({
      chunkId: e.chunkId,
      score: dot(unitQuery, e.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
