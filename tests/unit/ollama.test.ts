import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaError, chatStream, embed, listModels, ping } from "@/lib/ollama";
import type { ChatMessage } from "@/lib/types";

const HOST = "http://fake:11434";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Build a ReadableStream that emits the given string in the given slices. */
function streamOf(...slices: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const s of slices) controller.enqueue(enc.encode(s));
      controller.close();
    },
  });
}

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hi" }];

describe("listModels", () => {
  it("parses /api/tags into ModelInfo[]", async () => {
    const spy = stubFetch(async () =>
      Response.json({
        models: [
          { name: "qwen2.5:7b", size: 4_000_000, details: { parameter_size: "7.6B" } },
          { name: "nomic-embed-text", size: 274_000 },
        ],
      }),
    );
    const models = await listModels(HOST);
    expect(spy).toHaveBeenCalledWith(`${HOST}/api/tags`, expect.anything());
    expect(models).toEqual([
      { name: "qwen2.5:7b", size: 4_000_000, parameterSize: "7.6B" },
      { name: "nomic-embed-text", size: 274_000, parameterSize: undefined },
    ]);
  });

  it("maps network failure to OllamaError kind unreachable", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(listModels(HOST)).rejects.toMatchObject({ kind: "unreachable", host: HOST });
  });
});

describe("embed", () => {
  it("posts {model, input} and maps embeddings to Float32Array", async () => {
    const spy = stubFetch(async () =>
      Response.json({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
    );
    const out = await embed(HOST, "nomic-embed-text", ["a", "b"]);
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ model: "nomic-embed-text", input: ["a", "b"] });
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(out[1]![1]).toBeCloseTo(0.4);
  });

  it("returns [] for empty input without fetching", async () => {
    const spy = stubFetch(async () => Response.json({}));
    expect(await embed(HOST, "m", [])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps 404 model errors to kind model-missing", async () => {
    stubFetch(async () =>
      Response.json({ error: 'model "nope" not found, try pulling it first' }, { status: 404 }),
    );
    await expect(embed(HOST, "nope", ["x"])).rejects.toMatchObject({ kind: "model-missing" });
  });
});

describe("chatStream", () => {
  it("yields deltas from an NDJSON stream, buffering across chunk splits", async () => {
    const lines = [
      `{"message":{"content":"Hel"},"done":false}\n`,
      `{"message":{"content":"lo "},"done":false}\n`,
      `{"message":{"content":"world"},"done":false}\n`,
      `{"done":true}\n`,
    ].join("");
    // split mid-JSON to prove buffering works
    const third = Math.floor(lines.length / 3);
    stubFetch(async () =>
      new Response(streamOf(lines.slice(0, third), lines.slice(third, third + 7), lines.slice(third + 7))),
    );
    const parts: string[] = [];
    for await (const delta of chatStream(HOST, "qwen2.5:7b", MESSAGES)) parts.push(delta);
    expect(parts.join("")).toBe("Hello world");
  });

  it("disables model thinking in the request body", async () => {
    const spy = stubFetch(async () => new Response(streamOf(`{"done":true}\n`)));
    for await (const _ of chatStream(HOST, "qwen3.6:27b", MESSAGES)) void _;
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.think).toBe(false);
  });

  it("maps mid-stream error objects to OllamaError", async () => {
    stubFetch(async () => new Response(streamOf(`{"error":"boom"}\n`)));
    const iterate = async () => {
      for await (const _ of chatStream(HOST, "m", MESSAGES)) void _;
    };
    await expect(iterate()).rejects.toBeInstanceOf(OllamaError);
  });

  it("maps http errors before streaming", async () => {
    stubFetch(async () => Response.json({ error: "bad" }, { status: 500 }));
    const iterate = async () => {
      for await (const _ of chatStream(HOST, "m", MESSAGES)) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: "http" });
  });
});

describe("ping", () => {
  it("true when /api/version responds", async () => {
    stubFetch(async () => Response.json({ version: "0.5.0" }));
    expect(await ping(HOST)).toBe(true);
  });
  it("false when unreachable", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await ping(HOST)).toBe(false);
  });
});
