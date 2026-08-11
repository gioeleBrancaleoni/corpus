import type { ChatMessage, ModelInfo } from "./types";

export type OllamaErrorKind = "unreachable" | "model-missing" | "http" | "bad-response";

export class OllamaError extends Error {
  kind: OllamaErrorKind;
  host: string;

  constructor(kind: OllamaErrorKind, host: string, message: string) {
    super(message);
    this.name = "OllamaError";
    this.kind = kind;
    this.host = host;
  }
}

const EMBED_BATCH = 32;

async function ollamaFetch(host: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${host}${path}`, init);
  } catch {
    throw new OllamaError("unreachable", host, `Ollama not reachable at ${host}`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      // non-JSON error body; keep status only
    }
    if (/not found/i.test(detail) && /model|pull/i.test(detail)) {
      throw new OllamaError("model-missing", host, detail);
    }
    throw new OllamaError("http", host, detail || `Ollama returned HTTP ${res.status}`);
  }
  return res;
}

export async function ping(host: string): Promise<boolean> {
  try {
    await ollamaFetch(host, "/api/version", { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

export async function listModels(host: string): Promise<ModelInfo[]> {
  const res = await ollamaFetch(host, "/api/tags", { signal: AbortSignal.timeout(5000) });
  const data = (await res.json()) as {
    models?: { name: string; size: number; details?: { parameter_size?: string } }[];
  };
  if (!Array.isArray(data.models)) {
    throw new OllamaError("bad-response", host, "unexpected /api/tags response shape");
  }
  return data.models.map((m) => ({
    name: m.name,
    size: m.size,
    parameterSize: m.details?.parameter_size,
  }));
}

export async function embed(host: string, model: string, texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await ollamaFetch(host, "/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: batch }),
    });
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
      throw new OllamaError("bad-response", host, "unexpected /api/embed response shape");
    }
    for (const vec of data.embeddings) out.push(Float32Array.from(vec));
  }
  return out;
}

export async function* chatStream(
  host: string,
  model: string,
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal },
): AsyncIterable<string> {
  // think:false — grounded RAG answers don't benefit from long hidden
  // reasoning, which reads as a frozen UI. Non-thinking models accept the
  // field unchanged; models that can't disable it (gpt-oss) ignore it.
  const res = await ollamaFetch(host, "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, think: false }),
    signal: opts?.signal,
  });
  if (!res.body) throw new OllamaError("bad-response", host, "empty response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const delta = parseChatLine(line, host);
        if (delta === null) return;
        if (delta) yield delta;
      }
    }
    const rest = buffer.trim();
    if (rest) {
      const delta = parseChatLine(rest, host);
      if (delta) yield delta;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Returns the content delta, "" when the line has none, or null when the stream is done. */
function parseChatLine(line: string, host: string): string | null {
  let obj: { message?: { content?: string }; done?: boolean; error?: string };
  try {
    obj = JSON.parse(line);
  } catch {
    throw new OllamaError("bad-response", host, `invalid NDJSON line from Ollama: ${line.slice(0, 120)}`);
  }
  if (obj.error) throw new OllamaError("http", host, obj.error);
  if (obj.done) return null;
  return obj.message?.content ?? "";
}
