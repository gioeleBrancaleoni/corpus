import { loadSettings } from "./config";
import { chatStream as ollamaChatStream, embed as ollamaEmbed } from "./ollama";
import { type Store, openStore } from "./store";
import type { ChatMessage, Settings, Source } from "./types";
import { BruteForceStore } from "./vector";

export const GROUNDED_SYSTEM_PROMPT =
  "You are Corpus, a document assistant. Answer ONLY from the numbered context excerpts " +
  "provided in the next message. Cite every claim with its excerpt index like [1] or [2][3]. " +
  'If the context does not contain the answer, reply exactly: I don\'t know from these documents. ' +
  "Do not use outside knowledge.";

export const NO_INDEX_FALLBACK =
  "I don't know from these documents — the library index is empty. Index your library first.";

const HISTORY_TURNS = 6;
const SNIPPET_LENGTH = 160;

export interface RagResult {
  sources: Source[];
  stream: AsyncIterable<string>;
}

interface RagDeps {
  embedFn?: typeof ollamaEmbed;
  chatFn?: typeof ollamaChatStream;
  store?: Store;
  settings?: Settings;
  signal?: AbortSignal;
}

async function* onceStream(text: string): AsyncIterable<string> {
  yield text;
}

export async function answerQuestion(
  question: string,
  history: ChatMessage[],
  deps?: RagDeps,
): Promise<RagResult> {
  const settings = deps?.settings ?? loadSettings();
  const embedFn = deps?.embedFn ?? ollamaEmbed;
  const chatFn = deps?.chatFn ?? ollamaChatStream;
  const ownStore = !deps?.store;
  const store = deps?.store ?? openStore();

  // Load everything needed from the DB eagerly so an owned store can be
  // closed before the (long-lived) stream is consumed.
  let chunks;
  let pathsById: Map<number, string>;
  try {
    chunks = store.allChunks();
    pathsById = new Map(store.listFiles().map((f) => [f.id, f.path]));
  } finally {
    if (ownStore) store.close();
  }

  if (chunks.length === 0) {
    return { sources: [], stream: onceStream(NO_INDEX_FALLBACK) };
  }

  const [queryEmbedding] = await embedFn(settings.ollamaHost, settings.embedModel, [question]);
  const vectorStore = new BruteForceStore(
    chunks.map((c) => ({ chunkId: c.id, embedding: c.embedding })),
  );
  const hits = vectorStore.search(queryEmbedding!, settings.topK);

  const byId = new Map(chunks.map((c) => [c.id, c]));
  const sources: Source[] = hits.map((hit, i) => {
    const chunk = byId.get(hit.chunkId)!;
    return {
      n: i + 1,
      path: pathsById.get(chunk.fileId) ?? "unknown",
      ordinal: chunk.ordinal,
      snippet:
        chunk.text.length > SNIPPET_LENGTH
          ? `${chunk.text.slice(0, SNIPPET_LENGTH)}…`
          : chunk.text,
      score: hit.score,
    };
  });

  const contextBlock = hits
    .map((hit, i) => {
      const chunk = byId.get(hit.chunkId)!;
      const p = pathsById.get(chunk.fileId) ?? "unknown";
      return `[${i + 1}] ${p} (section ${chunk.ordinal + 1})\n${chunk.text}`;
    })
    .join("\n\n---\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: GROUNDED_SYSTEM_PROMPT },
    { role: "user", content: `Context excerpts:\n\n${contextBlock}` },
    {
      role: "assistant",
      content: "Understood. I will answer only from these excerpts and cite them as [n].",
    },
    ...history.slice(-HISTORY_TURNS),
    { role: "user", content: question },
  ];

  const stream = chatFn(settings.ollamaHost, settings.chatModel, messages, {
    signal: deps?.signal,
  });
  return { sources, stream };
}
