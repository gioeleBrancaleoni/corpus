import { describe, expect, it } from "vitest";
import { MODEL_TIERS, recommendModels } from "@/lib/model-recommend";

describe("MODEL_TIERS", () => {
  it("is ordered from heaviest to lightest with a catch-all floor", () => {
    const mins = MODEL_TIERS.map((t) => t.minVramGiB);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
    expect(mins.at(-1)).toBe(0);
  });
});

describe("recommendModels — tier selection", () => {
  const cases: [vram: number, chat: string, embed: string][] = [
    [32, "qwen3.6:27b", "snowflake-arctic-embed2"],
    [24, "qwen3.6:27b", "snowflake-arctic-embed2"],
    [23.9, "gpt-oss:20b", "snowflake-arctic-embed2"],
    [16, "gpt-oss:20b", "snowflake-arctic-embed2"],
    [12, "qwen2.5:7b", "nomic-embed-text"],
    [8, "qwen2.5:7b", "nomic-embed-text"],
    [4, "llama3.2:3b", "nomic-embed-text"],
    [0, "llama3.2:3b", "nomic-embed-text"],
  ];
  for (const [vram, chat, embed] of cases) {
    it(`${vram} GiB → ${chat} + ${embed}`, () => {
      const r = recommendModels(vram, []);
      expect(r.chat.model).toBe(chat);
      expect(r.embed.model).toBe(embed);
    });
  }
});

describe("recommendModels — installed vs must-pull", () => {
  it("marks missing models with the exact pull command", () => {
    const r = recommendModels(24, []);
    expect(r.chat.installed).toBe(false);
    expect(r.chat.pullCommand).toBe("ollama pull qwen3.6:27b");
    expect(r.embed.pullCommand).toBe("ollama pull snowflake-arctic-embed2");
  });

  it("marks the tier model installed when present (no pull command)", () => {
    const r = recommendModels(24, ["qwen3.6:27b", "snowflake-arctic-embed2:latest"]);
    expect(r.chat).toEqual({ model: "qwen3.6:27b", installed: true });
    expect(r.embed).toEqual({ model: "snowflake-arctic-embed2", installed: true });
  });

  it("prefers an installed model from a lighter tier over pulling the tier model", () => {
    const r = recommendModels(24, ["qwen2.5:7b", "nomic-embed-text:latest"]);
    expect(r.chat).toEqual({ model: "qwen2.5:7b", installed: true });
    expect(r.embed).toEqual({ model: "nomic-embed-text", installed: true });
  });

  it("never recommends an installed model from a heavier tier than the VRAM allows", () => {
    const r = recommendModels(8, ["qwen3.6:27b"]);
    expect(r.chat.model).toBe("qwen2.5:7b");
    expect(r.chat.installed).toBe(false);
  });

  it("treats :latest as equivalent to the bare tag", () => {
    const r = recommendModels(4, ["llama3.2:3b"]);
    expect(r.chat.installed).toBe(true);
  });
});
