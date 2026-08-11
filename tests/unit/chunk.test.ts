import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk when text fits", () => {
    const chunks = chunkText("short text", { size: 100, overlap: 20 });
    expect(chunks).toEqual([{ ordinal: 0, text: "short text", start: 0, end: 10 }]);
  });

  it("splits long text into overlapping windows that cover the whole input", () => {
    const text = "x".repeat(1000);
    const chunks = chunkText(text, { size: 300, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(1000);
    // ordinals sequential
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
    // consecutive chunks overlap by ~overlap chars (no boundary snapping possible in "xxx")
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.start).toBe(chunks[i - 1]!.end - 60);
    }
    // every chunk's text matches its offsets
    for (const c of chunks) expect(c.text).toBe(text.slice(c.start, c.end));
  });

  it("prefers paragraph boundaries near the window end", () => {
    const para1 = "a".repeat(250);
    const para2 = "b".repeat(400);
    const text = `${para1}\n\n${para2}`;
    const chunks = chunkText(text, { size: 300, overlap: 50 });
    // first chunk should snap to the paragraph break rather than cutting into para2
    expect(chunks[0]!.text.endsWith("a")).toBe(true);
    expect(chunks[0]!.end).toBe(250);
  });

  it("handles huge inputs without pathological chunk counts", () => {
    const text = "word ".repeat(200_000); // 1M chars
    const chunks = chunkText(text, { size: 3200, overlap: 600 });
    expect(chunks.length).toBeLessThan(500);
    expect(chunks.at(-1)!.end).toBe(text.trimEnd().length);
  });

  it("throws when overlap >= size", () => {
    expect(() => chunkText("abc", { size: 100, overlap: 100 })).toThrow();
  });
});
