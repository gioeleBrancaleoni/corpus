import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, dataDir, loadSettings, saveSettings } from "@/lib/config";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-config-"));
  process.env.CORPUS_DATA_DIR = tmp;
});

afterEach(() => {
  delete process.env.CORPUS_DATA_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("dataDir", () => {
  it("uses CORPUS_DATA_DIR when set and creates it", () => {
    const nested = path.join(tmp, "nested", "dir");
    process.env.CORPUS_DATA_DIR = nested;
    expect(dataDir()).toBe(nested);
    expect(fs.existsSync(nested)).toBe(true);
  });
});

describe("loadSettings", () => {
  it("returns defaults when config.json is missing", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges saved values over defaults", () => {
    saveSettings({ topK: 9 });
    const s = loadSettings();
    expect(s.topK).toBe(9);
    expect(s.ollamaHost).toBe(DEFAULT_SETTINGS.ollamaHost);
  });

  it("falls back to defaults per-key on corrupt file", () => {
    fs.writeFileSync(path.join(tmp, "config.json"), "{not json!!");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores unknown keys and wrong types", () => {
    fs.writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ topK: "banana", nonsense: true, chatModel: "phi3" }),
    );
    const s = loadSettings();
    expect(s.topK).toBe(DEFAULT_SETTINGS.topK);
    expect(s.chatModel).toBe("phi3");
  });
});

describe("saveSettings", () => {
  it("persists a patch and round-trips", () => {
    const out = saveSettings({ rootDir: "/some/where", chunkSize: 4000 });
    expect(out.rootDir).toBe("/some/where");
    const reread = loadSettings();
    expect(reread.chunkSize).toBe(4000);
    expect(reread.rootDir).toBe("/some/where");
  });
});
