import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
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
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

interface RawChunkRow extends Omit<ChunkRow, "embedding"> {
  // node:sqlite returns BLOBs as Uint8Array
  embedding: Uint8Array;
}

function decodeChunk(row: RawChunkRow): ChunkRow {
  const bytes = row.embedding;
  // Copy into an aligned Float32Array; the returned bytes may not be 4-aligned.
  const embedding = new Float32Array(bytes.byteLength / 4);
  new Uint8Array(embedding.buffer).set(bytes);
  return { ...row, embedding };
}

function encodeEmbedding(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export function openStore(dbPath?: string): Store {
  // Node's built-in SQLite (stable since Node 24): zero native dependencies.
  const db = new DatabaseSync(dbPath ?? path.join(dataDir(), "corpus.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
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
  const getMetaStmt = db.prepare("SELECT value FROM meta WHERE key = ?");
  const setMetaStmt = db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  return {
    upsertFile(f) {
      upsert.run({
        path: f.path,
        sha256: f.sha256,
        mtimeMs: f.mtimeMs,
        size: f.size,
        indexedAt: f.indexedAt,
      });
      return (byPath.get(f.path) as unknown as FileRow).id;
    },
    getFileByPath(p) {
      return byPath.get(p) as unknown as FileRow | undefined;
    },
    listFiles() {
      return all.all() as unknown as FileRow[];
    },
    deleteFile(p) {
      delFile.run(p);
    },
    replaceChunks(fileId, chunks) {
      // node:sqlite has no transaction helper: explicit BEGIN/COMMIT with
      // ROLLBACK on throw preserves the delete+insert atomicity.
      db.exec("BEGIN");
      try {
        delChunks.run(fileId);
        for (const c of chunks) {
          insChunk.run({
            fileId,
            ordinal: c.ordinal,
            text: c.text,
            embedding: encodeEmbedding(c.embedding),
            startOffset: c.startOffset,
            endOffset: c.endOffset,
          });
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    allChunks() {
      return (allChunksStmt.all() as unknown as RawChunkRow[]).map(decodeChunk);
    },
    chunksByFile(fileId) {
      return (chunksByFileStmt.all(fileId) as unknown as RawChunkRow[]).map(decodeChunk);
    },
    getMeta(key) {
      const row = getMetaStmt.get(key) as unknown as { value: string } | undefined;
      return row?.value;
    },
    setMeta(key, value) {
      setMetaStmt.run(key, value);
    },
    wipe() {
      db.exec("DELETE FROM chunks; DELETE FROM files;");
    },
    close() {
      db.close();
    },
  };
}
