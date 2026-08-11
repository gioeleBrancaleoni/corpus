export interface Chunk {
  ordinal: number;
  text: string;
  /** Character offsets into the source text. */
  start: number;
  end: number;
}

const DEFAULT_SIZE = 3200; // chars ≈ 800 tokens at ~4 chars/token
const DEFAULT_OVERLAP = 600; // chars ≈ 150 tokens

/**
 * Split text into overlapping windows of ~`size` chars, advancing by
 * `size - overlap`. Window ends prefer a paragraph/newline/sentence boundary
 * found in the last 20% of the window.
 */
export function chunkText(
  text: string,
  opts?: { size?: number; overlap?: number },
): Chunk[] {
  const size = opts?.size ?? DEFAULT_SIZE;
  const overlap = opts?.overlap ?? DEFAULT_OVERLAP;
  if (overlap >= size) throw new Error(`overlap (${overlap}) must be smaller than size (${size})`);

  const trimmed = text.trimEnd();
  if (trimmed.trim().length === 0) return [];
  const total = trimmed.length;

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < total) {
    let end = Math.min(start + size, total);
    if (end < total) {
      end = snapToBoundary(trimmed, start, end, size);
    }
    chunks.push({ ordinal: chunks.length, text: trimmed.slice(start, end), start, end });
    if (end >= total) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Prefer to end at \n\n, then \n, then ". ", searching the last 20% of the window. */
function snapToBoundary(text: string, start: number, end: number, size: number): number {
  const searchFrom = end - Math.floor(size * 0.2);
  for (const boundary of ["\n\n", "\n", ". "]) {
    const at = text.lastIndexOf(boundary, end);
    if (at > searchFrom && at > start) {
      return at + (boundary === ". " ? 1 : 0); // keep the period, drop the space
    }
  }
  return end;
}
