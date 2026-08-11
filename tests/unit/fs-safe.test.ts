import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PathEscapeError, isSupported, resolveSafe } from "@/lib/fs-safe";

let outside: string;
let root: string;

beforeAll(() => {
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-fs-"));
  root = path.join(outside, "library");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "a.md"), "# hello");
  fs.writeFileSync(path.join(outside, "secret.txt"), "outside the root");
  if (process.platform !== "win32") {
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "sneaky-link"));
    fs.symlinkSync(outside, path.join(root, "sneaky-dir"));
  }
});

afterAll(() => {
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("resolveSafe — attack table", () => {
  const attacks: [name: string, input: string][] = [
    ["parent traversal", "../../etc/passwd"],
    ["nested traversal", "docs/../../x"],
    ["absolute unix path", "/etc/passwd"],
    ["absolute windows path", "C:\\Windows\\system32"],
    ["windows traversal", "..\\..\\windows"],
    ["null byte", "docs/a.md\0.png"],
    ["UNC path", "\\\\evil\\share"],
    ["home expansion", "~/secrets"],
    ["lone parent", ".."],
  ];

  for (const [name, input] of attacks) {
    it(`rejects ${name}: ${JSON.stringify(input)}`, () => {
      expect(() => resolveSafe(root, input)).toThrow(PathEscapeError);
    });
  }

  it.skipIf(process.platform === "win32")("rejects a symlinked file escaping the root", () => {
    expect(() => resolveSafe(root, "sneaky-link")).toThrow(PathEscapeError);
  });

  it.skipIf(process.platform === "win32")("rejects paths through a symlinked dir", () => {
    expect(() => resolveSafe(root, "sneaky-dir/secret.txt")).toThrow(PathEscapeError);
  });
});

describe("resolveSafe — legitimate paths", () => {
  it("accepts a nested file", () => {
    expect(resolveSafe(root, "docs/a.md")).toBe(path.join(root, "docs", "a.md"));
  });

  it("accepts ./ and duplicate separators", () => {
    expect(resolveSafe(root, "docs/./a.md")).toBe(path.join(root, "docs", "a.md"));
    expect(resolveSafe(root, "docs//a.md")).toBe(path.join(root, "docs", "a.md"));
  });

  it("accepts the empty path as the root itself", () => {
    expect(resolveSafe(root, "")).toBe(path.resolve(root));
  });

  it("accepts a not-yet-existing path inside the root", () => {
    expect(resolveSafe(root, "docs/new-file.txt")).toBe(path.join(root, "docs", "new-file.txt"));
  });
});

describe("isSupported", () => {
  it("accepts documents and code", () => {
    for (const p of ["a.md", "b.txt", "c.pdf", "d.docx", "e.csv", "f.ts", "g.py"]) {
      expect(isSupported(p)).toBe(true);
    }
  });
  it("rejects binaries and unknown extensions", () => {
    for (const p of ["a.exe", "b.png", "c.zip", "noext"]) {
      expect(isSupported(p)).toBe(false);
    }
  });
});
