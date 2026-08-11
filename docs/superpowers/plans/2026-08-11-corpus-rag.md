# Corpus — Local Privacy-First RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-machine Next.js web app to browse/preview/download a folder of documents and ask questions answered by a local Ollama LLM via RAG, with grounded clickable citations and zero data egress.

**Architecture:** One Next.js (App Router) process serving both the React UI (three panes: Library tree / Viewer+Chat / Sources) and Route Handlers under `/api/*`. All domain logic lives in `lib/` behind small typed modules: path confinement (`fs-safe`), extraction, chunking, Ollama HTTP client, SQLite persistence, brute-force cosine `VectorStore`, and the RAG orchestrator. SQLite (`better-sqlite3`) holds files, chunks (embeddings as Float32 BLOBs) and settings under `./data/` (gitignored).

**Tech Stack:** Next.js 15 (App Router) + TypeScript `strict`, React 19, Tailwind CSS v4, better-sqlite3, unpdf, mammoth, Vitest, Playwright, GitHub Actions (ubuntu + windows matrix).

## Global Constraints

- Node.js >= 20 (`engines` in package.json). Dev machine runs Node 26; CI pins Node 22 LTS.
- TypeScript `strict: true` — hard requirement. `tsc --noEmit` must pass.
- Ollama only; **no OpenAI/Anthropic SDKs**, no cloud calls. Runtime `fetch` allowed ONLY to the configured Ollama host.
- No external fonts/assets/CDN/telemetry at runtime.
- Persistence: SQLite via `better-sqlite3`, single `data/corpus.db`. If it fights Windows CI, fall back to pure-JS store and record in DECISIONS.md.
- Vector search: brute-force cosine in TypeScript behind a `VectorStore` interface. No vector servers.
- Use `node:path` everywhere; no hand-concatenated `/`. No bash-only npm scripts.
- Default embedding model `nomic-embed-text`; default chat model `qwen2.5:7b` (configurable).
- Chunking by characters: size 3200 chars (~800 tokens at chars/4), overlap 600 chars (~150 tokens). Configurable.
- Bind `127.0.0.1` by default; optional `CORPUS_TOKEN` bearer/cookie gate on all `/api/*`.
- Every milestone ends green (typecheck + lint + tests) and committed. Conventional-ish commits.
- `.gitignore` MUST exclude `data/`, `*.db`, `node_modules`, `.next`, `test-results/`, `playwright-report/`.
- Record every deviation/decision in `DECISIONS.md`.

## File Structure (target)

```
corpus/
├─ app/
│  ├─ layout.tsx, globals.css, page.tsx        # three-pane shell
│  ├─ api/
│  │  ├─ health/route.ts                       # GET {ok:true}
│  │  ├─ models/route.ts                       # GET → Ollama tags proxy
│  │  ├─ settings/route.ts                     # GET/PUT config.json
│  │  ├─ files/tree/route.ts                   # GET file tree + index status
│  │  ├─ files/raw/route.ts                    # GET ?path= inline content
│  │  ├─ files/download/route.ts               # GET ?path= attachment
│  │  ├─ ingest/route.ts                       # POST start / DELETE cancel
│  │  ├─ ingest/status/route.ts                # GET progress (polled)
│  │  └─ chat/route.ts                         # POST → NDJSON stream
├─ components/
│  ├─ FileTree.tsx  Viewer.tsx  Chat.tsx  SourcesPanel.tsx
│  ├─ SettingsDialog.tsx  StatusDot.tsx  EmptyState.tsx  CenterTabs.tsx
├─ lib/
│  ├─ types.ts      # shared types (Settings, ModelInfo, ChatMessage, Source…)
│  ├─ config.ts     # data dir resolution + config.json load/save + defaults
│  ├─ auth.ts       # CORPUS_TOKEN bearer/cookie check
│  ├─ fs-safe.ts    # resolveSafe(root, requested) — the security core
│  ├─ ollama.ts     # listModels / embed / chatStream (NDJSON) / OllamaError
│  ├─ extract.ts    # extractText(filePath) per format
│  ├─ chunk.ts      # chunkText(text, opts) overlapping chunks
│  ├─ store.ts      # better-sqlite3: files, chunks, settings
│  ├─ vector.ts     # VectorStore iface + BruteForceStore + cosineSim
│  ├─ ingest.ts     # walk → hash → extract → chunk → embed → store (+progress)
│  └─ rag.ts        # question → retrieve → grounded prompt → stream
├─ tests/unit/      # Vitest: chunk, vector, fs-safe, ollama, extract, config
├─ e2e/
│  ├─ fixtures/library/   # 3 tiny public-domain docs
│  ├─ mock-ollama.ts      # deterministic stub server
│  └─ *.spec.ts
├─ .github/workflows/ci.yml
├─ Dockerfile  docker-compose.yml
├─ README.md  LICENSE  DECISIONS.md  CONTRIBUTING.md  .env.example
```

---

### Task 1: Skeleton — Next.js + TS strict + Tailwind + Prettier + git

**Files:** entire scaffold via `create-next-app`, then `.prettierrc`, `.gitignore`, `package.json` tweaks.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --use-npm --turbopack --import-alias "@/*"` (run in repo root; the spec file and docs/ already exist — scaffold alongside).
- [ ] **Step 2:** Verify `tsconfig.json` has `"strict": true`; add `"noUncheckedIndexedAccess": true`. Add `"engines": { "node": ">=20" }` to package.json. Add scripts: `"typecheck": "tsc --noEmit"`, `"format": "prettier --write ."`.
- [ ] **Step 3:** Add `.prettierrc` (`{ "semi": true, "singleQuote": false }`) and `.prettierignore` (`.next`, `node_modules`, `data`). Install `prettier` as devDep.
- [ ] **Step 4:** Extend `.gitignore`: `data/`, `*.db`, `test-results/`, `playwright-report/`, `blob-report/`, `.env`.
- [ ] **Step 5:** Verify: `npm run typecheck && npm run lint && npm run build` all green.
- [ ] **Step 6:** `git init`, commit `chore: scaffold Next.js 15 + TS strict + Tailwind`.

### Task 2: Test harness — Vitest + Playwright with trivial passing tests

**Files:** Create `vitest.config.ts`, `tests/unit/smoke.test.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`; add `/api/health/route.ts`.

**Interfaces produced:** `GET /api/health` → `{ ok: true }` (used by Playwright webServer readiness and later by e2e).

- [ ] **Step 1:** `npm i -D vitest @playwright/test`; `npx playwright install --with-deps chromium` (local: no --with-deps on mac).
- [ ] **Step 2:** `vitest.config.ts` including only `tests/unit/**/*.test.ts`. Smoke test: `expect(1 + 1).toBe(2)`.
- [ ] **Step 3:** `app/api/health/route.ts`:
  ```ts
  export async function GET() { return Response.json({ ok: true }); }
  ```
- [ ] **Step 4:** `playwright.config.ts`: testDir `e2e`, chromium only, `webServer: { command: "npm run dev", url: "http://localhost:3111/api/health", reuseExistingServer: !process.env.CI }`, port 3111 (`dev` script gets `-p 3111`? No — keep dev on 3000; webServer command `npm run dev -- -p 3111` so e2e never collides). `e2e/smoke.spec.ts`: fetch `/api/health`, expect ok.
- [ ] **Step 5:** Scripts: `"test": "vitest run"`, `"test:e2e": "playwright test"`. Run both, green.
- [ ] **Step 6:** Commit `test: add Vitest + Playwright harness with smoke tests`.

### Task 3: CI matrix (ubuntu + windows)

**Files:** Create `.github/workflows/ci.yml`.

- [ ] **Step 1:** Workflow: on push/PR; matrix `os: [ubuntu-latest, windows-latest]`; Node 22 via `actions/setup-node@v4` with `cache: npm`; steps: `npm ci` → `npm run typecheck` → `npm run lint` → `npm run test` → `npx playwright install --with-deps chromium` (ubuntu) / `npx playwright install chromium` (windows) → `npm run test:e2e`. Cache Playwright browsers (`~/.cache/ms-playwright` / `~\AppData\Local\ms-playwright`) keyed on playwright version. Build step `npm run build` before e2e? e2e uses dev server — keep `npm run build` as its own step for the build guarantee.
- [ ] **Step 2:** Commit `ci: add GitHub Actions matrix (ubuntu, windows)`. (Badge added to README in Task 16; goes green when repo is pushed.)

### Task 4: Types + config + auth

**Files:** Create `lib/types.ts`, `lib/config.ts`, `lib/auth.ts`, `app/api/settings/route.ts`; Test `tests/unit/config.test.ts`, `tests/unit/auth.test.ts`.

**Interfaces produced:**
```ts
// lib/types.ts
export interface Settings {
  rootDir: string | null;         // library root, null until user sets it
  ollamaHost: string;             // default "http://localhost:11434"
  chatModel: string;              // default "qwen2.5:7b"
  embedModel: string;             // default "nomic-embed-text"
  embedDim: number | null;        // discovered at first embed
  topK: number;                   // default 6
  chunkSize: number;              // default 3200 (chars)
  chunkOverlap: number;           // default 600 (chars)
}
export interface ModelInfo { name: string; size: number; parameterSize?: string }
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface Source { n: number; path: string; ordinal: number; snippet: string; score: number }
// lib/config.ts
export function dataDir(): string;                 // env CORPUS_DATA_DIR || path.join(process.cwd(), "data"); mkdir -p
export function loadSettings(): Settings;          // config.json merged over defaults
export function saveSettings(patch: Partial<Settings>): Settings;
export const DEFAULT_SETTINGS: Settings;
// lib/auth.ts
export function authorize(req: Request): boolean;  // true if no CORPUS_TOKEN set, else Bearer or corpus_token cookie matches
export function unauthorized(): Response;          // 401 JSON
```

- [ ] **Step 1:** Write failing tests: `loadSettings()` returns defaults when file missing; `saveSettings({topK: 8})` persists and round-trips; partial/corrupt config.json falls back to defaults per-key. Use `CORPUS_DATA_DIR` pointed at a temp dir per test. Auth: no env token → any req authorized; token set → missing/wrong header 401 logic (`authorize` returns false), `Authorization: Bearer secret` passes, cookie `corpus_token=secret` passes.
- [ ] **Step 2:** Run, expect FAIL (modules missing).
- [ ] **Step 3:** Implement. `saveSettings` writes atomically (write tmp + rename). Read token via `process.env.CORPUS_TOKEN` at call time (tests mutate env).
- [ ] **Step 4:** `app/api/settings/route.ts`: `GET` → settings (but never leak nothing sensitive — it's all local; fine); `PUT` body `Partial<Settings>` → validated (topK 1–20, chunkSize 500–20000, overlap < size, host must parse as http/https URL) → `saveSettings`. Both guarded by `authorize`.
- [ ] **Step 5:** Tests green. Commit `feat: settings persistence, config dir, optional token auth`.

### Task 5: Ollama client (`lib/ollama.ts`)

**Files:** Create `lib/ollama.ts`; Test `tests/unit/ollama.test.ts` (+ fixture `tests/unit/fixtures/chat-stream.ndjson`).

**Interfaces produced:**
```ts
export type OllamaErrorKind = "unreachable" | "model-missing" | "http" | "bad-response";
export class OllamaError extends Error { kind: OllamaErrorKind; host: string; }
export async function listModels(host: string): Promise<ModelInfo[]>;
export async function embed(host: string, model: string, texts: string[]): Promise<Float32Array[]>;
export async function* chatStream(host: string, model: string, messages: ChatMessage[], opts?: { signal?: AbortSignal }): AsyncIterable<string>;
export async function ping(host: string): Promise<boolean>;   // GET /api/version, short timeout
```

- [ ] **Step 1:** Failing tests with `vi.stubGlobal("fetch", ...)`:
  - `listModels` parses `{models:[{name,size,details:{parameter_size}}]}`.
  - `embed` posts `{model, input}` to `/api/embed`, maps `{embeddings:number[][]}` → `Float32Array[]`; empty input → `[]` without fetching.
  - `chatStream` fed a `ReadableStream` built from the NDJSON fixture (several `{"message":{"content":"..."},"done":false}` lines, split mid-line across chunks to prove buffering, final `{"done":true}`) yields exactly the concatenated deltas.
  - fetch rejects `TypeError` → `OllamaError` kind `unreachable`; HTTP 404 with `{"error":"model 'x' not found"}` → kind `model-missing`; other non-2xx → `http`.
- [ ] **Step 2:** Run, FAIL.
- [ ] **Step 3:** Implement. NDJSON parser: accumulate text buffer, split on `\n`, JSON.parse complete lines, keep remainder; yield `obj.message?.content ?? ""` when non-empty; stop on `obj.done === true`. `embed` batches input in slices of 32.
- [ ] **Step 4:** Tests green. Commit `feat: ollama client (tags, embed, NDJSON chat streaming) with error mapping`.

### Task 6: Models API + Settings UI with live connection status

**Files:** Create `app/api/models/route.ts`, `components/SettingsDialog.tsx`, `components/StatusDot.tsx`; wire a Settings button into `app/page.tsx` shell.

**Interfaces produced:** `GET /api/models` → `{ ok: true, models: ModelInfo[] } | { ok: false, error: { kind, message, host } }` (status 200 always; UI branches on `ok`). SettingsDialog props: `{ open: boolean; onClose(): void; onSaved(s: Settings): void }`.

- [ ] **Step 1:** `app/api/models/route.ts`: authorize → `listModels(loadSettings().ollamaHost)`; map `OllamaError` to the `ok:false` envelope — never throw 500 for unreachable.
- [ ] **Step 2:** SettingsDialog (client component): fields for rootDir (text input), ollamaHost, chat/embed model `<select>`s populated from `/api/models`, topK, chunkSize/overlap. On host field change (debounced) re-fetch models → StatusDot green "Connected — N models" / red "Ollama not reachable at {host}". PUT on save. Tailwind, minimal editorial style.
- [ ] **Step 3:** Page shell `app/page.tsx`: header with app name, Settings gear; three-pane grid placeholder (Library / Center / Sources) with EmptyState explaining 3 setup steps (pull models, pick folder, index).
- [ ] **Step 4:** `npm run typecheck && lint && test`; manual smoke via dev server. Commit `feat: models endpoint + settings dialog with live Ollama status`.

### Task 7: `fs-safe.ts` + attack-table tests (the security core)

**Files:** Create `lib/fs-safe.ts`; Test `tests/unit/fs-safe.test.ts`.

**Interfaces produced:**
```ts
export class PathEscapeError extends Error {}
// Resolves a client-supplied relative path against root.
// Throws PathEscapeError unless the real resolved path stays inside root.
export function resolveSafe(root: string, requested: string): string;
export function isSupported(p: string): boolean; // by extension: .txt .md .markdown .csv .pdf .docx + code exts
```

- [ ] **Step 1:** Failing tests. Setup: temp root with `docs/a.md`, plus a symlink inside root pointing outside (skip symlink case on Windows via `it.skipIf(process.platform === "win32")` — creating symlinks needs privileges there; CI ubuntu covers it). Attack table, ALL must throw `PathEscapeError`:
  `"../../etc/passwd"`, `"..%2F..%2Fetc/passwd"` (after decode), `"/etc/passwd"`, `"C:\\Windows\\system32"`, `"..\\..\\windows"`, `"docs/../../x"`, `"docs/a.md\0.png"`, `"\\\\evil\\share"` (UNC), `"~/secrets"`, symlink escaping root. Legit accepted: `"docs/a.md"`, `"docs/./a.md"`, `"docs//a.md"`, `""` (→ root itself).
- [ ] **Step 2:** Run, FAIL.
- [ ] **Step 3:** Implement:
  ```ts
  export function resolveSafe(root: string, requested: string): string {
    if (requested.includes("\0")) throw new PathEscapeError("null byte");
    if (/^[\\/]|^[A-Za-z]:|^~/.test(requested)) throw new PathEscapeError("absolute or home path");
    const normalizedRoot = path.resolve(root);
    const resolved = path.resolve(normalizedRoot, requested);
    const rel = path.relative(normalizedRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new PathEscapeError("escapes root");
    // realpath check: walk up to nearest existing ancestor of `resolved`, realpath it,
    // and require it to stay under realpath(root) — defeats symlink escapes.
    const realRoot = fs.realpathSync.native(normalizedRoot);
    let probe = resolved;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const realProbe = fs.realpathSync.native(probe);
    const relReal = path.relative(realRoot, realProbe);
    if (relReal.startsWith("..") || path.isAbsolute(relReal)) throw new PathEscapeError("symlink escapes root");
    return resolved;
  }
  ```
- [ ] **Step 4:** Tests green on mac; note CI proves ubuntu+windows. Commit `feat: fs-safe path confinement with attack-table tests`.

### Task 8: File APIs — tree, raw, download

**Files:** Create `app/api/files/tree/route.ts`, `app/api/files/raw/route.ts`, `app/api/files/download/route.ts`; helper `lib/tree.ts`; Test `tests/unit/tree.test.ts`.

**Interfaces produced:**
```ts
// lib/tree.ts
export interface TreeNode { name: string; path: string; type: "dir" | "file"; size?: number;
  status?: "indexed" | "stale" | "unindexed" | "unsupported"; children?: TreeNode[] }
export function buildTree(root: string): TreeNode;   // skips dotfiles, node_modules, .corpusignore patterns (simple glob-less prefix/name matching)
```
- `GET /api/files/tree` → `{ ok: true, tree: TreeNode } | { ok:false, error:"no-root" }`; status filled from DB in Task 12 (until then `"unindexed"`/`"unsupported"`).
- `GET /api/files/raw?path=rel` → file bytes, correct `Content-Type` (md/text/csv → text/plain|markdown, pdf → application/pdf inline, code → text/plain), `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`.
- `GET /api/files/download?path=rel` → `Content-Disposition: attachment; filename="..."` (RFC 5987 encoded).

- [ ] **Step 1:** Failing unit tests for `buildTree`: skips `.hidden`, `node_modules`, honors `.corpusignore` lines (name or relative-path prefix, `#` comments), sorts dirs-first alphabetical.
- [ ] **Step 2:** Implement `buildTree` (recursive `fs.readdirSync` with `withFileTypes`).
- [ ] **Step 3:** Route handlers: every path goes through `resolveSafe(settings.rootDir, param)`; `PathEscapeError` → 403; missing file → 404; directories rejected on raw/download → 400. All behind `authorize`.
- [ ] **Step 4:** Green. Commit `feat: file tree + raw/download endpoints through fs-safe`.

### Task 9: Library tree + Viewer UI

**Files:** Create `components/FileTree.tsx`, `components/Viewer.tsx`, `components/CenterTabs.tsx`; Modify `app/page.tsx`. Deps: `react-markdown` + `remark-gfm` (md render), `shiki` or `react-syntax-highlighter`? — use **`react-markdown` + CSS `prose`** for md and a zero-dep `<pre>` + tiny token highlighter? Decision: use `shiki` at build/server-side is heavy; use `highlight.js` (pure JS, no runtime CDN) via `react-syntax-highlighter`. Record in DECISIONS.md. Note: Tailwind v4 has no official typography plugin issues — `@tailwindcss/typography` works; include it locally (build-time, not runtime CDN — allowed).

**Interfaces produced:** `FileTree` props `{ tree: TreeNode; selected?: string; onSelect(path: string): void; onReindex(): void; indexing: boolean }`. `Viewer` props `{ path: string | null }` — fetches `/api/files/raw`, renders by extension: md (rendered/raw toggle), pdf (`<iframe src="/api/files/raw?path=…">`), code (highlighted), txt/csv (mono `<pre>`, csv as simple table when parseable). Download button → `/api/files/download?path=…`.

- [ ] **Step 1:** Implement FileTree (collapsible dirs, status badge dot per file, Re-index button placeholder calling `onReindex`).
- [ ] **Step 2:** Implement Viewer + CenterTabs (`viewer` / `chat` tabs; chat placeholder for now).
- [ ] **Step 3:** Wire into `page.tsx`: load tree on mount and after settings save; selecting a file switches center to viewer.
- [ ] **Step 4:** typecheck/lint/test green; manual smoke with a sample folder. Commit `feat: library tree and file viewer (md/pdf/code/text/csv) with download`.

### Task 10: SQLite store (`lib/store.ts`)

**Files:** Create `lib/store.ts`; Test `tests/unit/store.test.ts`. Dep: `better-sqlite3` + `@types/better-sqlite3`.

**Interfaces produced:**
```ts
export interface FileRow { id: number; path: string; sha256: string; mtimeMs: number; size: number; indexedAt: number }
export interface ChunkRow { id: number; fileId: number; ordinal: number; text: string; embedding: Float32Array; startOffset: number; endOffset: number }
export function openStore(dbPath?: string): Store;   // default path.join(dataDir(), "corpus.db"); WAL mode
export interface Store {
  upsertFile(f: Omit<FileRow, "id">): number;                 // returns fileId
  getFileByPath(p: string): FileRow | undefined;
  listFiles(): FileRow[];
  deleteFile(path: string): void;                              // cascades chunks
  replaceChunks(fileId: number, chunks: Omit<ChunkRow, "id" | "fileId">[]): void;  // tx: delete+insert
  allChunks(): ChunkRow[];                                     // embeddings decoded to Float32Array
  chunksByFile(fileId: number): ChunkRow[];
  wipe(): void;                                                // drop all rows (index invalidation)
  close(): void;
}
```

- [ ] **Step 1:** Failing tests against a temp-dir DB: upsert/round-trip file; replaceChunks stores and returns identical Float32Array values (BLOB via `Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)`); delete cascades; wipe empties.
- [ ] **Step 2:** Implement with `CREATE TABLE IF NOT EXISTS`, FK `ON DELETE CASCADE`, `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON`.
- [ ] **Step 3:** Green (confirms better-sqlite3 prebuild works on Node 26 mac; CI will confirm win+linux — fallback plan per Global Constraints). Commit `feat: sqlite store for files, chunks, embeddings`.

### Task 11: extract + chunk

**Files:** Create `lib/extract.ts`, `lib/chunk.ts`; Test `tests/unit/extract.test.ts`, `tests/unit/chunk.test.ts`; fixtures `tests/unit/fixtures/{sample.pdf,sample.docx,sample.csv,sample.md}`. Deps: `unpdf`, `mammoth`.

**Interfaces produced:**
```ts
// extract.ts
export async function extractText(filePath: string): Promise<string>;  // dispatch by ext; throws UnsupportedFileError
export class UnsupportedFileError extends Error {}
// chunk.ts
export interface Chunk { ordinal: number; text: string; start: number; end: number }  // char offsets into source
export function chunkText(text: string, opts?: { size?: number; overlap?: number }): Chunk[];
```

- [ ] **Step 1:** Failing chunk tests: empty → `[]`; text ≤ size → 1 chunk spanning all; long text → windows advance by `size - overlap`, consecutive chunks share exactly `overlap` chars (except boundary-snapping tolerance), last chunk reaches end, ordinals sequential, `size <= overlap` throws. Boundary preference: break at last `\n\n` / `\n` / `. ` within the final 20% of the window when present.
- [ ] **Step 2:** Implement `chunkText`; green.
- [ ] **Step 3:** Failing extract tests: `.md`/`.txt`/`.csv`/code read verbatim (utf-8); `.pdf` fixture (generate a tiny one-page PDF in-repo via script or commit a public-domain sample) yields its known sentence; `.docx` fixture likewise (create with a tiny generator script using raw OOXML zip — or commit a minimal fixture); unsupported ext throws.
- [ ] **Step 4:** Implement via `unpdf` (`extractText(await getDocumentProxy(buf))`) and `mammoth.extractRawText({ path })`; green. Commit `feat: text extraction (txt/md/csv/code/pdf/docx) and overlapping chunker`.

### Task 12: Ingestion pipeline + progress + cancel

**Files:** Create `lib/ingest.ts`, `app/api/ingest/route.ts`, `app/api/ingest/status/route.ts`; Test `tests/unit/ingest.test.ts` (mocked `embed`).

**Interfaces produced:**
```ts
// lib/ingest.ts  — module-level singleton job state (one Next.js process)
export interface IngestProgress { state: "idle" | "running" | "done" | "error" | "cancelled";
  totalFiles: number; doneFiles: number; currentFile: string | null; error?: string; startedAt?: number }
export function getProgress(): IngestProgress;
export function cancelIngest(): void;
export async function runIngest(deps?: { embedFn?: typeof embed }): Promise<IngestProgress>;
// walk (reuses buildTree's ignore logic via shared lib/walk.ts if cleaner) → for each supported file:
//   sha256+mtime vs files table → skip unchanged; extract → chunk → embed (batch) → replaceChunks
//   deletes DB rows for files no longer on disk; discovers embedDim on first embed → saveSettings;
//   if embedModel changed since last index (store settings row "embedModel"), wipe() first.
```
- `POST /api/ingest` → starts job if idle (fire-and-forget promise), 409 if running. `DELETE` → cancel. `GET /api/ingest/status` → `IngestProgress` (UI polls ~500ms).

- [ ] **Step 1:** Failing tests with temp root + temp DB + fake `embedFn` returning deterministic vectors: full run indexes 3 files; second run with no changes embeds nothing (spy call count 0); touching one file re-embeds only it; deleting a file removes its rows; cancel mid-run stops between files and leaves DB consistent.
- [ ] **Step 2:** Implement; keep per-file try/catch (a bad file records error and continues).
- [ ] **Step 3:** Green. Commit `feat: incremental ingestion pipeline with progress and cancellation`.

### Task 13: Index status in UI + Re-index flow

**Files:** Modify `app/api/files/tree/route.ts` (join with store → real per-file status: `indexed` / `stale` (sha or mtime differs) / `unindexed` / `unsupported`), `components/FileTree.tsx`, `app/page.tsx` (Re-index button → POST /api/ingest, poll status, progress bar `doneFiles/totalFiles` + currentFile, cancel button).

- [ ] **Step 1:** Implement status join + UI progress.
- [ ] **Step 2:** typecheck/lint/tests green; manual smoke. Commit `feat: per-file index status and re-index progress UI`.

### Task 14: Vector store (`lib/vector.ts`)

**Files:** Create `lib/vector.ts`; Test `tests/unit/vector.test.ts`.

**Interfaces produced:**
```ts
export interface SearchHit { chunkId: number; score: number }
export interface VectorStore { search(query: Float32Array, k: number): SearchHit[] }
export function cosineSim(a: Float32Array, b: Float32Array): number;   // throws DimensionMismatchError
export class DimensionMismatchError extends Error {}
export class BruteForceStore implements VectorStore {
  constructor(entries: { chunkId: number; embedding: Float32Array }[]);
}
```

- [ ] **Step 1:** Failing tests: cosine of identical vectors = 1 (±1e-6); orthogonal = 0; opposite = −1; zero-vector → 0 (guard, no NaN); mismatch throws; top-k returns k best in descending score with known hand-computed fixture; k > n returns n.
- [ ] **Step 2:** Implement (single-pass dot+norms; partial-select via full sort is fine at this scale).
- [ ] **Step 3:** Green. Commit `feat: brute-force cosine VectorStore`.

### Task 15: RAG + streaming chat API + Chat/Sources UI

**Files:** Create `lib/rag.ts`, `app/api/chat/route.ts`, `components/Chat.tsx`, `components/SourcesPanel.tsx`; Modify `app/page.tsx`, `components/CenterTabs.tsx`; Test `tests/unit/rag.test.ts`.

**Interfaces produced:**
```ts
// lib/rag.ts
export interface RagResult { sources: Source[]; stream: AsyncIterable<string> }
export async function answerQuestion(question: string, history: ChatMessage[],
  deps?: { embedFn?: typeof embed; chatFn?: typeof chatStream; store?: Store }): Promise<RagResult>;
// Grounded system prompt (verbatim, keep in one exported const GROUNDED_SYSTEM_PROMPT):
// "You are Corpus, a document assistant. Answer ONLY from the numbered context excerpts below.
//  Cite every claim with its excerpt index like [1] or [2][3]. If the context does not contain
//  the answer, reply exactly: I don't know from these documents. Do not use outside knowledge."
```
- Wire protocol `POST /api/chat` body `{ question: string; history: ChatMessage[] }` → NDJSON stream:
  first line `{"type":"sources","sources":Source[]}`, then `{"type":"delta","content":"…"}`*, finally `{"type":"done"}` or `{"type":"error","kind":…,"message":…}`.
- Chat UI: thread state, streams into last assistant bubble, renders `[n]` as clickable chips → highlights entry in SourcesPanel. History: send last 6 messages. SourcesPanel: file name, snippet, score; click → open file in Viewer tab (and pass `ordinal` for future scroll-to-chunk; store chunk `startOffset` to scroll text viewers proportionally).

- [ ] **Step 1:** Failing rag unit tests with fake deps: retrieves top-k from seeded store, sources numbered 1..k mapped to correct `{path, ordinal}`; prompt contains excerpts labeled `[n]`; empty index → sources `[]` and stream yields the "I don't know" fallback without calling chatFn.
- [ ] **Step 2:** Implement `answerQuestion` + route (ReadableStream from async generator; honors request abort → cancels Ollama fetch via AbortSignal).
- [ ] **Step 3:** Implement Chat + SourcesPanel UI; wire citation-chip ↔ source highlight ↔ viewer open.
- [ ] **Step 4:** Green + manual smoke. Commit `feat: grounded RAG chat with streaming answers and clickable sources`.

### Task 16: Mock-Ollama E2E + full-flow tests

**Files:** Create `e2e/mock-ollama.ts` (plain `node:http` server: `/api/version`, `/api/tags` → 2 fake models, `/api/embed` → deterministic vectors = seeded hash of input text, `/api/chat` → canned NDJSON stream answering "Photosynthesis converts light into chemical energy [1]"), `e2e/fixtures/library/` (3 tiny public-domain text/md docs, one containing the photosynthesis fact), `e2e/full-flow.spec.ts`, `e2e/unreachable.spec.ts`; Modify `playwright.config.ts` (globalSetup starts mock server on port 11435; app configured via `CORPUS_DATA_DIR` temp dir with pre-written config.json pointing rootDir at fixtures and ollamaHost at the mock).

- [ ] **Step 1:** Deterministic mock embeddings: hash tokens → the fixture doc about photosynthesis and the question "What does photosynthesis do?" must rank that doc's chunk top-1 (verify by construction: mock embeds by bag-of-words on a tiny vocabulary so overlapping words → high cosine).
- [ ] **Step 2:** `full-flow.spec.ts`: open app → tree shows fixtures → click Re-index → wait for done → open Chat → ask question → assert streamed answer text appears AND SourcesPanel links to `plants.md` → click source → Viewer opens that file.
- [ ] **Step 3:** `unreachable.spec.ts`: config points at a dead port → Settings shows "Ollama not reachable at http://localhost:1", chat returns friendly error state, app does not crash.
- [ ] **Step 4:** All e2e green locally. Commit `test: e2e full flow against mock Ollama + unreachable state`.

### Task 17: Docs, packaging, polish, v0.1.0

**Files:** Create `README.md`, `LICENSE` (MIT), `DECISIONS.md`, `CONTRIBUTING.md`, `.env.example`, `.corpusignore` (example in README + `e2e/fixtures`), `Dockerfile`, `docker-compose.yml`; Modify `package.json` (name `corpus`, version 0.1.0), empty states.

- [ ] **Step 1:** README per spec §13: privacy promise bold, GIF placeholder, prerequisites (`ollama pull nomic-embed-text`, `ollama pull qwen2.5:7b`), **separate Windows PowerShell and Linux bash quick starts**, §5 architecture diagram, security model, "how retrieval works", remote-Ollama LAN section, CI badge (`.github/workflows/ci.yml` badge URL with OWNER/REPO placeholder if no remote yet).
- [ ] **Step 2:** DECISIONS.md entries: brute-force vs sqlite-vec; chars-as-tokens chunking; qwen2.5:7b default; highlight.js choice; NDJSON wire protocol over SSE; polling over SSE for ingest progress; anything else accumulated.
- [ ] **Step 3:** Dockerfile (node:22-slim, build, `HOST=0.0.0.0` note) + compose with commented-out ollama service.
- [ ] **Step 4:** Full local gate: `npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e`. Fix anything red.
- [ ] **Step 5:** Commit `docs: README, DECISIONS, LICENSE, contributing, docker packaging`; `git tag v0.1.0`.

## Self-Review Notes

- Spec coverage: §4 stack→T1/2/10/11; §6 ollama→T5/6; §7 ingestion→T11/12/13; §8 RAG→T14/15; §9 UI→T6/9/13/15/17; §10 security→T4(auth)/T7/T8/§17 README; §11 tests→T2/5/7/10/11/12/14/15/16 + T3 CI; §12 cross-platform→T1(engines)/T3(matrix)/T17(docker, quick starts); §13 hygiene→T1/T17; §14 milestones = task order; §15 acceptance→T16/T17 gate.
- Types used across tasks match the `lib/types.ts` block in Task 4 (Source, Settings, ChatMessage, ModelInfo).
- Known judgment calls to log in DECISIONS.md as they land: ingest progress via polling (simplest cross-platform), NDJSON chat protocol, highlight.js, chat default model qwen2.5:7b.
