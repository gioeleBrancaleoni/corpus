# Build Spec — "Corpus": a local, privacy-first RAG over your own files

> **Handoff document.** You (a fresh Claude Code instance) are building this project from scratch.
> This spec is the source of truth. Follow it. Where it says "decide", use judgement and
> record the decision in `DECISIONS.md`. Where it says "MUST", treat it as a hard requirement.
>
> **Project working title:** `corpus` (the author may rename it — keep the name in one place, `package.json` + README).

---

## 1. What we are building (one paragraph)

A single-machine, cross-platform (Windows **and** Linux) web app that lets a user point at a
folder of documents, **browse / preview / download** those files, and **ask questions** that are
answered by a local LLM using Retrieval-Augmented Generation. All inference (embeddings + chat)
runs through **Ollama** — either on the same machine (`localhost:11434`) or on another machine on
the LAN (configurable host). **No data ever leaves the user's infrastructure.** That privacy
guarantee is the product's whole reason to exist and MUST be visible in the README and the UI.

## 2. Why it exists / who it's for

People and small teams who have sensitive documents (legal, medical, HR, financial, GDPR-relevant)
and want a "chat with my documents" experience **without sending anything to OpenAI/Anthropic or any
cloud**. The differentiators vs. the crowded local-RAG space are: (a) clean, typed, tested codebase
you can actually read and extend; (b) a real file explorer with grounded, **clickable citations**
back to the exact source file; (c) first-class support for a **remote Ollama** host so a weak laptop
can use a beefy GPU box on the LAN.

## 3. Non-goals (do NOT build these)

- No user accounts / multi-tenant auth. Single local user. (A single optional shared-secret env
  token to protect the LAN port is allowed — see §10 — but no user DB, no OAuth.)
- No cloud LLM providers. Ollama only. Do not add OpenAI/Anthropic SDKs.
- No document *editing*. Read, preview, download, index. That's it.
- No account creation, no telemetry, no external analytics, no CDN calls at runtime.
- Don't over-scale: brute-force vector search is fine (see §7). Do not pull in a vector *server*
  (Qdrant/Weaviate/Milvus). Everything runs in-process on one machine.

## 4. Tech stack (decided — do not substitute without recording in DECISIONS.md)

- **Next.js (App Router) + TypeScript**, `strict: true`. This is a hard requirement (it's the
  point of the project). Node.js LTS (>= 20).
- **React** for UI. **Tailwind CSS** for styling. Keep it clean and minimal, not flashy.
- **State/data:** React Server Components + Route Handlers where natural; client components only
  where interactivity requires it (chat, file tree, streaming).
- **Persistence:** **SQLite via `better-sqlite3`** (excellent prebuilt binaries for Windows + Linux,
  zero external server, single `.db` file). Store: files table, chunks table (with embedding as a
  BLOB of Float32), settings.
- **Vector search:** **brute-force cosine similarity computed in TypeScript** over the chunk
  embeddings loaded from SQLite. Rationale: for a personal corpus (up to ~tens of thousands of
  chunks) this is milliseconds and needs **zero native vector extension**, which maximises the
  Windows+Linux "just works" guarantee we're selling. Structure the retrieval behind an interface
  `VectorStore` so it can later be swapped for `sqlite-vec` or LanceDB without touching callers.
  Note this trade-off in DECISIONS.md.
- **LLM/embeddings:** Ollama HTTP API (see §6). No SDK needed — use `fetch`. Support streaming.
- **File parsing:** `.txt`/`.md`/code = read directly; `.pdf` via `unpdf` (or `pdf-parse`);
  `.docx` via `mammoth`; `.csv` as text. Keep parsers behind one `extractText(filePath)` function
  so formats are pluggable.
- **Testing:** **Vitest** (unit) + **Playwright** (E2E). **GitHub Actions** CI.
- **Lint/format:** ESLint (next config) + Prettier. `tsc --noEmit` in CI.

> The testing + CI requirement is not optional and not decorative. It is the single most important
> signal this repo sends. Green CI badge in the README.

## 5. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js app (one process, `next start`)                      │
│                                                              │
│  UI (React/Tailwind)                                         │
│   ├─ Library / file tree ────────────┐                       │
│   ├─ File viewer (md/pdf/code/text)  │  Route Handlers (API) │
│   └─ Chat + Sources panel            │   /api/files/*        │
│                                      │   /api/ingest         │
│                                      │   /api/chat  (stream) │
│                                      │   /api/models         │
│                                      │   /api/settings       │
│                                                              │
│  lib/                                                        │
│   ├─ fs-safe.ts   (path confinement, the security core)      │
│   ├─ extract.ts   (file → text, per format)                  │
│   ├─ chunk.ts     (text → overlapping chunks)                │
│   ├─ ollama.ts    (embed + chat + list models, streaming)    │
│   ├─ store.ts     (SQLite: files, chunks, settings)          │
│   ├─ vector.ts    (VectorStore iface + cosine impl)          │
│   └─ rag.ts       (query → retrieve → prompt → stream answer)│
│                                                              │
│  data/  (gitignored)                                         │
│   ├─ corpus.db    (SQLite)                                   │
│   └─ config.json  (root folder, ollama host, models…)        │
└──────────────┬───────────────────────────────────────────────┘
               │ HTTP
       ┌───────▼────────┐        ┌──────────────────────┐
       │ Ollama (local) │   OR   │ Ollama (other host)  │
       │ localhost:11434│        │ 192.168.x.x:11434    │
       └────────────────┘        └──────────────────────┘
```

## 6. Ollama integration (`lib/ollama.ts`)

Base URL from settings, default `http://localhost:11434`. All calls via `fetch`. Implement:

- `listModels(): Promise<ModelInfo[]>` → `GET {host}/api/tags`. Used to populate model dropdowns.
- `embed(texts: string[], model: string): Promise<Float32Array[]>` → `POST {host}/api/embed`
  with `{ model, input: texts }`. Batch where possible. Default embedding model:
  **`nomic-embed-text`** (document it in README as a required `ollama pull`).
- `chatStream(messages, model, opts): AsyncIterable<string>` → `POST {host}/api/chat` with
  `{ model, messages, stream: true }`; parse the NDJSON stream and yield `message.content` deltas.
  Default chat model: pick a small, widely-available one and make it configurable
  (e.g. **`llama3.1:8b`** or **`qwen2.5:7b`** — document that the user must `ollama pull` it).
- Handle host unreachable / model-not-pulled with clear, user-facing errors (surface them in the
  UI, don't crash). MUST show a friendly "Ollama not reachable at {host}" state.

Embedding dimension is discovered at runtime from the first embed call and stored in settings;
if the user changes the embedding model, the index MUST be invalidated/rebuilt (dimensions differ).

## 7. Ingestion pipeline (`/api/ingest`, `lib/*`)

1. User sets a **root folder** (the "library") in Settings. All indexing/browsing is confined to it.
2. Walk the tree (respect an optional `.corpusignore`, and always skip dotfiles/`node_modules`).
3. For each supported file: compute `sha256 + mtime`; skip if unchanged since last index
   (incremental re-index). Record in `files` table.
4. `extractText(filePath)` → plain text (per-format, §4).
5. `chunk(text)` → overlapping chunks (default ~800 tokens / ~150 overlap; make configurable by
   characters if tokenization is a hassle — approximate tokens as chars/4 and note it).
6. `embed(chunks)` via Ollama → store `{ fileId, ordinal, text, embedding(BLOB), page?/offset? }`
   in `chunks`.
7. Stream progress back to the UI (Server-Sent Events or a simple polled progress endpoint):
   files done / total, current file. Ingestion of a big folder MUST be cancellable and resumable
   (resume = just re-run; step 3 makes it idempotent).

## 8. RAG query flow (`/api/chat`, `lib/rag.ts`)

1. Embed the user question (same embedding model as the index).
2. `vector.search(queryEmbedding, k)` → top-k chunks by cosine (default k=6, configurable).
3. Optional: simple keyword pre-filter or MMR de-duplication — keep it simple first, note ideas.
4. Build a grounded prompt: a system instruction that says *answer only from the provided context,
   cite sources by their [n] index, and say "I don't know from these documents" if unsupported*.
   Include the retrieved chunks with a stable `[n]` label mapped to `{file path, ordinal}`.
5. `chatStream(...)` → stream tokens to the client.
6. Return, alongside the stream, the **source list** so the UI renders a **Sources panel**: each
   source is clickable and opens that file in the viewer, ideally scrolled to the chunk. Grounded
   citations are a headline feature — do them well.

Keep short conversational history (last few turns) but always re-retrieve for the newest question.

## 9. UI (keep it clean, editorial, not a toy)

Three-pane layout, responsive:

- **Left — Library:** collapsible file tree of the root folder. Click a file → opens in viewer.
  Show index status per file (indexed / stale / unsupported). A "Re-index" button with progress.
- **Center — two modes, tabbed:**
  - **Viewer:** render `.md` (rendered + raw toggle), `.pdf` (embedded preview), code
    (syntax-highlighted), text/csv. A **Download** button always present.
  - **Chat:** message thread with streaming answers; inline `[n]` citations that highlight the
    corresponding entry in the Sources panel.
- **Right — Sources:** for the latest answer, the retrieved chunks with file name, a snippet, and a
  link that opens the file in the Viewer.
- **Settings (modal or route):** root folder path, Ollama host, chat model + embedding model
  (populated from `/api/models`), k, chunk size/overlap. Show Ollama connection status live.

Dark/light aware. No external fonts/assets loaded at runtime (privacy + offline). Ship a tiny,
tasteful empty state that explains the 3 setup steps (pull models, pick folder, index).

## 10. Security & privacy (this is the differentiator — treat as core, not polish)

- **Path confinement is the security core.** `lib/fs-safe.ts` MUST resolve every requested path
  against the configured root with `path.resolve` + a real-path check and reject anything that
  escapes the root (`..`, symlinks, absolute paths, UNC paths on Windows). Every file API route
  goes through it. Add unit tests with malicious inputs (see §11) — this is the test suite item to
  be proud of, and it maps directly to the author's GDPR/security background.
- **No egress:** the app makes exactly zero outbound network calls except to the configured Ollama
  host. No fonts, no analytics, no update checks. State this explicitly in the README and enforce
  it (no runtime `fetch` to anything but `{ollamaHost}`).
- Bind to `127.0.0.1` by default. If the user wants LAN access, they set `HOST=0.0.0.0` and MAY set
  `CORPUS_TOKEN=<secret>`; when set, all `/api/*` routes require an `Authorization: Bearer` header
  (or a cookie set from the token). Keep this dead simple — it is a lock on the door, not an auth
  system.
- Downloads set safe content-disposition; never execute or eval file contents.

## 11. Testing & CI (non-negotiable)

**Unit (Vitest):**
- `chunk.ts`: chunk boundaries, overlap, empty/huge inputs.
- `vector.ts`: cosine correctness; top-k ordering; dimension-mismatch guard.
- `fs-safe.ts`: **the important one** — table of attack inputs (`../../etc/passwd`, absolute paths,
  `..\\..\\windows`, symlink escape, null bytes) all rejected; legit nested paths accepted.
- `ollama.ts`: parse a recorded NDJSON stream fixture into deltas; error mapping.

**E2E (Playwright):**
- Boot the app against a **mocked Ollama** (a tiny local stub server returning deterministic
  embeddings + a canned streamed answer — do NOT require a real GPU in CI).
- Flow: set root to a fixtures folder with 2–3 tiny docs → index → ask a question whose answer is
  in one doc → assert the streamed answer appears AND the Sources panel links to the right file →
  click a source → viewer opens that file. Also test the "Ollama unreachable" error state.

**CI (GitHub Actions), matrix on `ubuntu-latest` AND `windows-latest`:**
- `npm ci` → `tsc --noEmit` → `eslint` → `vitest run` → `playwright test`.
- Cache npm + Playwright browsers. Badge in README. CI MUST be green on both OSes before v1.

## 12. Cross-platform requirements

- Use `node:path` everywhere; never hand-concatenate `/`. Store the DB and `config.json` under a
  writable app-data dir (`./data` in the repo, gitignored) — resolve it cross-platform.
- Provide npm scripts that work on both shells: `dev`, `build`, `start`, `lint`, `typecheck`,
  `test`, `test:e2e`. No bash-only scripts in the critical path (use Node scripts or `cross-env` if
  an env var is needed).
- README: separate, copy-pasteable **Windows (PowerShell)** and **Linux (bash)** quick-start blocks.
- Provide an **optional** `Dockerfile` + `docker-compose.yml` (app only; Ollama assumed external or
  a commented service), but the primary supported path is bare `npm` on one machine.

## 13. Repo hygiene / deliverables

- `README.md`: what it is, the privacy promise (bold), a 30-second demo GIF placeholder, prerequisites
  (`ollama pull nomic-embed-text`, `ollama pull llama3.1:8b`), Windows + Linux quick starts,
  architecture diagram (reuse §5), the security model (§10), and a "how retrieval works" section.
- `LICENSE`: MIT.
- `DECISIONS.md`: log the SQLite+brute-force choice, chunking defaults, model defaults, anything you
  deviated on.
- `.env.example`, `.corpusignore` example, `CONTRIBUTING.md` (brief), conventional-ish commit style.
- `.gitignore` MUST exclude `data/`, `*.db`, `node_modules`, `.next`, Playwright artifacts.
- Small fixtures folder (`e2e/fixtures/`) with tiny public-domain sample docs — never commit real
  personal data.

## 14. Milestones (build in this order; each ends green)

1. **Skeleton:** Next.js + TS strict + Tailwind + ESLint/Prettier + Vitest + Playwright + CI matrix
   running a trivial passing test on Ubuntu **and** Windows. Green badge before writing features.
2. **Ollama layer:** `ollama.ts` with `listModels`/`embed`/`chatStream` + unit tests (mocked) +
   a Settings page that shows live connection status and model dropdowns.
3. **Files + security:** `fs-safe.ts` (with its attack-table tests), file tree API, viewer,
   download. This slice alone is a demoable, honest product.
4. **Ingestion:** extract → chunk → embed → SQLite, incremental re-index, progress UI.
5. **RAG:** retrieval + grounded streaming answers + Sources panel with clickable citations.
6. **E2E** covering the full flow against mocked Ollama; polish empty states/errors; write README.

Ship v1 at the end of milestone 6. Tag `v0.1.0`.

## 15. Acceptance criteria (definition of done for v1)

- [ ] Fresh clone → `npm ci && npm run build && npm start` works on Windows and Linux.
- [ ] With Ollama running + two models pulled, user can: set a folder, index it, browse/preview/
      download a file, and get a **grounded, streamed** answer whose Sources link back to the right file.
- [ ] Pointing the Ollama host at **another machine** on the LAN works (documented + verified).
- [ ] `tsc --noEmit`, ESLint, Vitest, Playwright all green in CI on `ubuntu-latest` **and**
      `windows-latest`.
- [ ] Path-traversal attempts are rejected (proven by tests) and the app makes no network calls
      other than to the configured Ollama host.
- [ ] README lets a stranger get it running in under 5 minutes on either OS.

---

### Notes for the builder
- Optimise for **readable, typed, tested code over cleverness** — this repo is also a work sample.
- Prefer boring, well-supported libraries. Every native dependency must have Windows + Linux
  prebuilds (verify `better-sqlite3` does before committing to it; if a native module fights the
  Windows CI, fall back to a pure-JS store and record it in DECISIONS.md).
- Keep functions small and the `lib/` boundaries clean so a reviewer can navigate in minutes.
- Write commit messages a human will read. Small, logical commits per milestone slice.
