import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dedupeName,
  parseClassification,
  sanitizeFileName,
  sanitizeFolderName,
} from "@/lib/upload";

describe("sanitizeFolderName — attack table", () => {
  // Every entry must collapse to a safe single [a-z0-9-] segment, or "" (→ inbox fallback).
  const attacks: [input: string, note: string][] = [
    ["../secrets", "parent traversal"],
    ["/etc", "absolute path"],
    ["..", "lone parent"],
    [".", "lone dot"],
    ["C:\\x", "windows drive"],
    ["..\\..\\windows", "windows traversal"],
    ["", "empty"],
    ["   ", "whitespace only"],
    ["a".repeat(500), "500-char string"],
    ["Città Fattùre 🚀", "unicode + emoji"],
    ["con", "windows reserved"],
    ["COM1", "windows reserved upper"],
    ["nul.txt", "reserved-ish with extension"],
    ["folder/../../x", "embedded traversal"],
    ["a\0b", "null byte"],
  ];

  for (const [input, note] of attacks) {
    it(`neutralizes ${note}: ${JSON.stringify(input.slice(0, 30))}`, () => {
      const out = sanitizeFolderName(input);
      expect(out).toMatch(/^[a-z0-9-]*$/); // only safe chars, possibly empty
      expect(out.length).toBeLessThanOrEqual(40);
      expect(out).not.toContain("..");
      expect(["con", "prn", "aux", "nul", "com1"]).not.toContain(out);
    });
  }

  it("keeps a good kebab name as-is and kebab-cases plain names", () => {
    expect(sanitizeFolderName("invoices")).toBe("invoices");
    expect(sanitizeFolderName("Contratti Fornitori 2026")).toBe("contratti-fornitori-2026");
  });

  it("returns empty for names that cannot be salvaged (caller falls back to inbox)", () => {
    expect(sanitizeFolderName("..")).toBe("");
    expect(sanitizeFolderName("🚀🚀🚀")).toBe("");
    expect(sanitizeFolderName("con")).toBe("");
  });
});

describe("sanitizeFileName", () => {
  it("strips directories, null bytes and control chars", () => {
    expect(sanitizeFileName("../../evil/../doc.pdf")).toBe("doc.pdf");
    expect(sanitizeFileName("C:\\Users\\x\\report.docx")).toBe("report.docx");
    expect(sanitizeFileName("no\0te\u0007.md")).toBe("note.md");
  });

  it("falls back for empty or dot-only names", () => {
    expect(sanitizeFileName("")).toBe("upload");
    expect(sanitizeFileName("..")).toBe("upload");
  });
});

describe("parseClassification", () => {
  it("parses plain JSON", () => {
    expect(parseClassification('{"folder":"invoices","isNew":false,"reason":"billing"}')).toEqual({
      folder: "invoices",
      isNew: false,
      reason: "billing",
    });
  });

  it("parses fenced or prose-wrapped JSON", () => {
    expect(
      parseClassification('Sure! Here you go:\n```json\n{"folder":"hr","isNew":true}\n```'),
    ).toMatchObject({ folder: "hr", isNew: true });
  });

  it("returns null for garbage, missing folder, or wrong types (caller → inbox)", () => {
    expect(parseClassification("no json here")).toBeNull();
    expect(parseClassification('{"isNew":true}')).toBeNull();
    expect(parseClassification('{"folder":42}')).toBeNull();
    expect(parseClassification("{broken")).toBeNull();
  });
});

describe("dedupeName", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-dedupe-"));
    fs.writeFileSync(path.join(dir, "doc.pdf"), "");
    fs.writeFileSync(path.join(dir, "doc-2.pdf"), "");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("returns the name unchanged when free", () => {
    expect(dedupeName(dir, "fresh.md")).toBe("fresh.md");
  });

  it("suffixes -2, -3… until free — never overwrites", () => {
    expect(dedupeName(dir, "doc.pdf")).toBe("doc-3.pdf");
  });
});
