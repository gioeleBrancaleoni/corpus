export interface Settings {
  /** Library root folder; null until the user picks one. */
  rootDir: string | null;
  ollamaHost: string;
  chatModel: string;
  embedModel: string;
  /** Embedding dimension, discovered on the first embed call. */
  embedDim: number | null;
  topK: number;
  /** Chunk size in characters (~tokens * 4). */
  chunkSize: number;
  /** Chunk overlap in characters. */
  chunkOverlap: number;
}

export interface ModelInfo {
  name: string;
  size: number;
  parameterSize?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Source {
  /** 1-based citation index as it appears in the answer, e.g. [2]. */
  n: number;
  path: string;
  ordinal: number;
  snippet: string;
  score: number;
}
