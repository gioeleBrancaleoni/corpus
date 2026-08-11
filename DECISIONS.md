# DECISIONS.md

Log of technical decisions and deviations, per the build spec.

## SQLite (`better-sqlite3`) + brute-force cosine, no vector server

For a personal corpus (up to ~tens of thousands of chunks) an exhaustive cosine scan over
Float32 embeddings loaded from SQLite takes milliseconds and needs **zero native vector
extensions**, which maximises the Windows + Linux "just works" guarantee. Retrieval sits behind a
`VectorStore` interface (`lib/vector.ts`) so `sqlite-vec` or LanceDB can be swapped in later
without touching callers. Trade-off: brute force is O(n) per query; acceptable at this scale by design.

**Version pin:** `better-sqlite3` is pinned to `^12.11.1` (i.e. < 13). The v13.x releases publish
**no prebuilt binaries** (verified: zero release assets on v13.0.0–13.0.3), so installs fall back
to node-gyp — which broke on the `windows-latest` CI runner (node-gyp 11 can't detect Visual
Studio 18). v12.11.1 ships prebuilds for Node 20/22 on win32/linux/darwin (checked the release
assets explicitly, per the spec's "verify prebuilds before committing to it" note). Revisit when
v13 resumes publishing prebuilds.

## Chunking by characters, not tokens

Tokenization would drag in a tokenizer dependency per model family. We approximate tokens as
chars/4: default chunk size 3200 chars (~800 tokens), overlap 600 chars (~150 tokens), both
configurable in Settings. Chunk windows prefer to break at paragraph/newline/sentence boundaries
found in the last 20% of the window.

## Model defaults

- Embedding: `nomic-embed-text` (small, widely available, solid quality).
- Chat: `qwen2.5:7b` (small, widely available, good grounded-answer behavior). Both are dropdowns
  populated from the live Ollama `/api/tags`, so any pulled model works.
- The embedding dimension is discovered at runtime from the first embed call and stored in
  config; changing the embedding model wipes and rebuilds the index (dimensions differ).

## Scaffold versions

`create-next-app` produced Next.js 16.3 / React 19.2 / Tailwind v4 (spec said "Next.js App
Router + TS strict"; 16 is the current stable App Router line). TypeScript `strict` plus
`noUncheckedIndexedAccess`.

## No web fonts, system stack only

The spec forbids external assets at runtime. We went further: no bundled font files either (the
scaffold's Geist import was removed) — `system-ui` for UI, `ui-monospace` for code. A fresh clone
builds fully offline and ships zero font bytes.

## Chat wire protocol: NDJSON over a fetch stream (not SSE)

`POST /api/chat` answers with newline-delimited JSON events (`sources`, `delta`, `done`,
`error`). Same expressiveness as SSE, one fewer framing layer, and it mirrors Ollama's own NDJSON
so the client parser is shared mental model. Ingestion progress is a polled endpoint
(`/api/ingest/status`, 500 ms) instead of SSE for the same simplicity reason.

## Syntax highlighting: `react-syntax-highlighter` (Prism, bundled)

Pure-JS, bundled at build time, no CDN. `shiki` was considered and rejected as heavier than the
job requires. Markdown rendering via `react-markdown` + `remark-gfm`; library HTML files are
served as `text/plain` so they are never executed in the app origin.

## DOCX preview

`.docx` files are indexed (mammoth → raw text) but not previewed in the viewer — only offered as
download. A faithful DOCX renderer is out of scope for v1; the download button keeps the
browse/preview/download promise honest.

## E2E determinism

Playwright boots a stub Ollama (`e2e/mock-ollama.mjs`): embeddings are bag-of-words counts over a
tiny vocabulary (so cosine ranking is predictable), chat streams one canned NDJSON answer. CI
needs no GPU and no model downloads.

## VRAM-based model recommendation

Detection shells out to `nvidia-smi --query-gpu=memory.total,name` (works on Windows and Linux
with NVIDIA drivers; multi-GPU picks the largest card) and **never throws** — AMD/Apple/CPU-only
machines get `{ detected: false }` and a manual VRAM field in Settings. The recommendation logic
(`lib/model-recommend.ts`) is a pure function over (VRAM, installed models) so it's unit-tested
without mocks. The tier table is a single exported constant:
≥24 GB → `qwen3.6:27b` + `snowflake-arctic-embed2`; 16–24 → `gpt-oss:20b` + same; 6–16 →
`qwen2.5:7b` + `nomic-embed-text`; <6/CPU → `llama3.2:3b` + `nomic-embed-text`. All tags
verified against ollama.com tag listings on 2026-08-11; the ≥24 GB tier is validated on an
RTX 3090 Ti. An installed model from the matched tier *or a lighter one* is preferred over
suggesting a pull; heavier-than-VRAM installed models are never recommended.

## Chat markdown rendering

Assistant answers are markdown (models emit `**bold**`, lists, headers), so the chat bubble
renders through `react-markdown` + GFM. Citation markers `[n]` are turned into link nodes by a
small remark plugin and swapped for clickable chips at render time — this keeps citations
clickable *inside* formatted text instead of splitting the markdown around them.

## Auth scope

Optional `CORPUS_TOKEN` shared secret guarding all `/api/*` routes (Bearer header or
`corpus_token` cookie), for LAN exposure only. Deliberately not a user system: no accounts, no
sessions, no OAuth (spec non-goal).
