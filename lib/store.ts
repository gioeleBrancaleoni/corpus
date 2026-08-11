import path from "node:path";
import Database from "better-sqlite3";
import { dataDir } from "./config";

export interface FileRow {
  id: number;
  path: string;
  sha256: string;
  mtimeMs: number;
  size: number;
  indexedAt: number;
}

export interface ChunkRow {
  id: number;
  fileId: number;
  ordinal: number;
  text: string;
  embedding: Float32Array;
  startOffset: number;
  endOffset: number;
}

export interface Store {
  upsertFile(f: Omit<FileRow, "id">): number;
  getFileByPath(p: string): FileRow | undefined;
  listFiles(): FileRow[];
  deleteFile(path: string): void;
  replaceChunks(fileId: number, chunks: Omit<ChunkRow, "id" | "fileId">[]): void;
  allChunks(): ChunkRow[];
  chunksByFile(fileId: number): ChunkRow[];
  wipe(): void;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  mtimeMs REAL NOT NULL,
  size INTEGER NOT NULL,
  indexedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fileId INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  startOffset INTEGER NOT NULL,
  endOffset INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(fileId);
`;

interface RawChunkRow extends Omit<ChunkRow, "embedding"> {
  embedding: Buffer;
}

function decodeChunk(row: RawChunkRow): ChunkRow {
  const buf = row.embedding;
  // Copy into an aligned Float32Array; the Buffer's byteOffset may not be 4-aligned.
  const embedding = new Float32Array(buf.byteLength / 4);
  new Uint8Array(embedding.buffer).set(buf);
  return { ...row, embedding };
}

export function openStore(dbPath?: string): Store {
  const db = new Database(dbPath ?? path.join(dataDir(), "corpus.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const upsert = db.prepare(`
    INSERT INTO files (path, sha256, mtimeMs, size, indexedAt)
    VALUES (@path, @sha256, @mtimeMs, @size, @indexedAt)
    ON CONFLICT(path) DO UPDATE SET
      sha256 = excluded.sha256, mtimeMs = excluded.mtimeMs,
      size = excluded.size, indexedAt = excluded.indexedAt
  `);
  const byPath = db.prepare("SELECT * FROM files WHERE path = ?");
  const all = db.prepare("SELECT * FROM files ORDER BY path");
  const delFile = db.prepare("DELETE FROM files WHERE path = ?");
  const delChunks = db.prepare("DELETE FROM chunks WHERE fileId = ?");
  const insChunk = db.prepare(`
    INSERT INTO chunks (fileId, ordinal, text, embedding, startOffset, endOffset)
    VALUES (@fileId, @ordinal, @text, @embedding, @startOffset, @endOffset)
  `);
  const allChunksStmt = db.prepare("SELECT * FROM chunks ORDER BY fileId, ordinal");
  const chunksByFileStmt = db.prepare("SELECT * FROM chunks WHERE fileId = ? ORDER BY ordinal");

  const replaceChunksTx = db.transaction(
    (fileId: number, chunks: Omit<ChunkRow, "id" | "fileId">[]) => {
      delChunks.run(fileId);
      for (const c of chunks) {
        insChunk.run({
          fileId,
          ordinal: c.ordinal,
          text: c.text,
          embedding: Buffer.from(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength),
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        });
      }
    },
  );

  return {
    upsertFile(f) {
      upsert.run(f);
      return (byPath.get(f.path) as FileRow).id;
    },
    getFileByPath(p) {
      return byPath.get(p) as FileRow | undefined;
    },
    listFiles() {
      return all.all() as FileRow[];
    },
    deleteFile(p) {
      delFile.run(p);
    },
    replaceChunks(fileId, chunks) {
      replaceChunksTx(fileId, chunks);
    },
    allChunks() {
      return (allChunksStmt.all() as RawChunkRow[]).map(decodeChunk);
    },
    chunksByFile(fileId) {
      return (chunksByFileStmt.all(fileId) as RawChunkRow[]).map(decodeChunk);
    },
    wipe() {
      db.exec("DELETE FROM chunks; DELETE FROM files;");
    },
    close() {
      db.close();
    },
  };
}
