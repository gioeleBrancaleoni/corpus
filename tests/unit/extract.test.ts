import path from "node:path";
import { describe, expect, it } from "vitest";
import { UnsupportedFileError, extractText } from "@/lib/extract";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

describe("extractText", () => {
  it("reads markdown/text/csv verbatim", async () => {
    expect(await extractText(fixture("sample.md"))).toContain("Hello from markdown.");
    expect(await extractText(fixture("sample.csv"))).toContain("ada,36");
  });

  it("extracts text from a PDF", async () => {
    const text = await extractText(fixture("sample.pdf"));
    expect(text).toContain("The quick brown fox");
  });

  it("extracts text from a DOCX", async () => {
    const text = await extractText(fixture("sample.docx"));
    expect(text).toContain("Grace Hopper invented the first compiler.");
  });

  it("throws UnsupportedFileError for unknown extensions", async () => {
    await expect(extractText(fixture("sample.png"))).rejects.toBeInstanceOf(UnsupportedFileError);
  });
});
