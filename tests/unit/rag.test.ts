import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/config";
import { GROUNDED_SYSTEM_PROMPT, answerQuestion } from "@/lib/rag";
import { type Store, openStore } from "@/lib/store";
import type { ChatMessage, Settings } from "@/lib/types";

let tmp: string;
let store: Store;
let settings: Settings;

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const part of stream) out += part;
  return out;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-rag-"));
  process.env.CORPUS_DATA_DIR = path.join(tmp, "data");
  store = openStore(path.join(tmp, "test.db"));
  settings = { ...DEFAULT_SETTINGS, rootDir: "/fake", topK: 2 };

  const plants = store.upsertFile({ path: "plants.md", sha256: "p", mtimeMs: 1, size: 1, indexedAt: 1 });
  const trains = store.upsertFile({ path: "trains.md", sha256: "t", mtimeMs: 1, size: 1, indexedAt: 1 });
  store.replaceChunks(plants, [
    { ordinal: 0, text: "Photosynthesis converts light into chemical energy.", embedding: Float32Array.from([1, 0, 0]), startOffset: 0, endOffset: 51 },
  ]);
  store.replaceChunks(trains, [
    { ordinal: 0, text: "Steam locomotives burn coal.", embedding: Float32Array.from([0, 1, 0]), startOffset: 0, endOffset: 28 },
    { ordinal: 1, text: "Diesel replaced steam in the 1950s.", embedding: Float32Array.from([0, 0.9, 0.1]), startOffset: 20, endOffset: 55 },
  ]);
});

afterEach(() => {
  store.close();
  delete process.env.CORPUS_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("answerQuestion", () => {
  it("retrieves top-k chunks, numbers sources 1..k, and streams the answer", async () => {
    const embedFn = vi.fn(async () => [Float32Array.from([0.9, 0.1, 0])]);
    const chatFn = vi.fn(async function* (_h: string, _m: string, _messages: ChatMessage[]) {
      yield "It converts light ";
      yield "[1].";
    });
    const { sources, stream } = await answerQuestion("What does photosynthesis do?", [], {
      embedFn,
      chatFn,
      store,
      settings,
    });

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ n: 1, path: "plants.md", ordinal: 0 });
    expect(sources[0]!.snippet).toContain("Photosynthesis");
    expect(sources[0]!.score).toBeGreaterThan(sources[1]!.score);

    expect(await collect(stream)).toBe("It converts light [1].");

    // grounded prompt: system message + [n]-labelled excerpts + the question last
    const messages = chatFn.mock.calls[0]![2];
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toBe(GROUNDED_SYSTEM_PROMPT);
    const contextMsg = messages.find((m) => m.content.includes("[1] plants.md"));
    expect(contextMsg?.content).toContain("Photosynthesis converts light");
    expect(messages.at(-1)!.content).toContain("What does photosynthesis do?");
  });

  it("keeps only the last 6 turns of history", async () => {
    const embedFn = vi.fn(async () => [Float32Array.from([1, 0, 0])]);
    const chatFn = vi.fn(async function* (_h: string, _m: string, _messages: ChatMessage[]) {
      yield "ok";
    });
    const history: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `turn ${i}`,
    }));
    await answerQuestion("q", history, { embedFn, chatFn, store, settings });
    const messages = chatFn.mock.calls[0]![2];
    const turns = messages.filter((m) => m.content.startsWith("turn "));
    expect(turns).toHaveLength(6);
    expect(turns[0]!.content).toBe("turn 4");
  });

  it("answers the fallback without calling the chat model when the index is empty", async () => {
    store.wipe();
    const embedFn = vi.fn(async () => [Float32Array.from([1, 0, 0])]);
    const chatFn = vi.fn(async function* () {
      yield "should not happen";
    });
    const { sources, stream } = await answerQuestion("anything?", [], {
      embedFn,
      chatFn,
      store,
      settings,
    });
    expect(sources).toEqual([]);
    expect(await collect(stream)).toContain("I don't know from these documents");
    expect(chatFn).not.toHaveBeenCalled();
  });
});
