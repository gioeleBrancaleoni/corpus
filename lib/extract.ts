import fs from "node:fs";
import path from "node:path";
import { isSupported } from "./fs-safe";

export class UnsupportedFileError extends Error {
  constructor(p: string) {
    super(`unsupported file type: ${path.extname(p) || p}`);
    this.name = "UnsupportedFileError";
  }
}

/** File → plain text, dispatching on extension (spec §4). */
export async function extractText(filePath: string): Promise<string> {
  if (!isSupported(filePath)) throw new UnsupportedFileError(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await getDocumentProxy(buf);
    const { text } = await unpdfExtract(pdf, { mergePages: true });
    return text;
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }

  // txt / md / csv / code: read as UTF-8
  return fs.readFileSync(filePath, "utf8");
}
