# Handoff — Corpus

> **Audience:** the next contributor (human or AI agent) picking this repo up with zero context.
> The original build brief lives in [CORPUS_RAG_BUILD_SPEC.md](CORPUS_RAG_BUILD_SPEC.md); this
> document is its successor and describes the repo **as it is now**. Read this, then
> [DECISIONS.md](../DECISIONS.md) — every non-obvious choice is logged there with its rationale.

## Current state

- **Version:** `v0.2.0` tagged; a few post-tag commits on `main` (stale-index upload guard,
  `node:sqlite` migration). `main` is the only branch; every commit on it has green CI.
- **CI:** GitHub Actions matrix on `ubuntu-latest` + `windows-latest`, Node 24. Pipeline:
  `npm ci` → typecheck → lint → unit (Vitest) → build → E2E (Playwright vs a mocked Ollama).
  **Both jobs must be green before anything merges. No exceptions — cross-platform is the
  product's promise.**
- **Runtime floor:** Node ≥ 24. There are **zero native modules** (SQLite is Node's built-in
  `node:sqlite`); keep it that way unless a decision entry justifies otherwise.
- **Test counts** (will drift; run them): ~134 unit, 12 E2E. `npm test`, `npm run test:e2e`.

## What the product is

A single-machine Next.js app: point it at a folder, browse/preview/download the files, ask
questions answered by a local Ollama LLM with grounded `[n]` citations that link back to the
source file. Extras built after v0.1: markdown-rendered chat, VRAM-based model recommendation,
smart upload (LLM files the document into a folder), demo-GIF recorder. The full feature list is
in the README; the architecture diagram there is accurate.

## Invariants — do not weaken these

1. **No egress.** The only runtime network destination is the configured Ollama host. No fonts,
   no CDNs, no telemetry, not even bundled font files. Adding any outbound call is a product
   regression, not a tech detail.
2. **Path confinement.** Every filesystem path that originates outside `lib/` goes through
   `resolveSafe()` (`lib/fs-safe.ts`) — file APIs, downloads, uploads. Its unit test is an attack
   table; extend the table when you touch path handling.
3. **LLM output is untrusted input.** The smart-upload folder suggestion is sanitized to a single
   kebab-case segment (`lib/upload.ts: sanitizeFolderName`) **and** still confined with
   `resolveSafe`. Any new feature that turns model output into paths, shell args, SQL, or HTML
   must follow the same pattern: sanitize, then confine, then test with an attack table.
4. **Never mix vector representations.** The store carries `embedModel` + `indexFormat`
   (`unit-f32-v1`, unit-normalized Float32) in its `meta` table. `indexIsStale()` (`lib/ingest.ts`)
   is the single source of truth: a full ingest wipes+rebuilds on mismatch; the single-file
   upload path *defers* indexing instead (never wipes, never mixes). If you change the stored
   representation, bump `INDEX_FORMAT`.
5. **Auth stays a lock, not a system.** Optional `CORPUS_TOKEN` (Bearer or cookie), compared
   timing-safe. No accounts, no sessions, no OAuth — spec non-goal.
6. **Interfaces over rewrites.** Retrieval hides behind `VectorStore` (swap-in point for
   sqlite-vec/LanceDB), parsers behind `extractText`, Ollama behind `lib/ollama.ts`.

## Hard-won gotchas (each cost a red CI or a real bug)

- **`npm run typecheck` is `next typegen && tsc --noEmit`.** `LayoutProps` is generated into
  `.next/types`; plain `tsc` on a fresh checkout fails.
- **Lockfile platform binaries.** A lockfile regenerated on macOS once dropped
  `lightningcss-win32-x64-msvc` and broke Windows `npm ci` (known npm optional-deps issue).
  After dependency changes, grep the lockfile for `-win32-x64` equivalents of any platform
  packages, or just watch the Windows job.
- **`node:sqlite` specifics:** BLOBs read back as `Uint8Array` (keep the 4-byte-aligned copy in
  `decodeChunk`), no `transaction()` helper (explicit `BEGIN/COMMIT/ROLLBACK` in
  `replaceChunks`), pragmas via `exec`.
- **Chat sends `think: false`.** Reasoning models (qwen3.6) otherwise spend 20+ hidden seconds
  before the first token — looks like a frozen UI. Safe on non-thinking models; gpt-oss ignores
  it. Verified on Ollama 0.32.1.
- **Never use Ollama's `format` param with gpt-oss** — returns an empty response (known bug).
  The classification prompt asks for JSON in prose and parses robustly instead
  (`parseClassification`).
- **Embedding model tags use explicit `:latest`** (`snowflake-arctic-embed2:latest`) because
  `/api/tags` reports them that way; all matching is `:latest`-tolerant anyway (`normalize` in
  `lib/model-recommend.ts`, dropdown check in `SettingsDialog`).
- **ESLint (react-hooks v6) is strict:** no synchronous `setState` in effect bodies, no ref
  access during render. The polling pattern in `IndexControls.tsx` is the approved shape.
- **E2E uploads use a throwaway root** under `e2e/.data/` (uploads write into the library root —
  never let tests write into committed fixtures). `upload.spec.ts` shows the pattern including
  direct DB inspection via `node:sqlite`.
- **Changing `rootDir` wipes the index** (settings route) — deliberate, see DECISIONS. Same-path
  re-saves are detected with `path.resolve` and do not wipe.

## The mock-Ollama E2E rig

`e2e/mock-ollama.mjs` is a plain `node:http` stub started by Playwright's `webServer` array:
deterministic bag-of-words embeddings (cosine ranking is predictable by construction) and canned
NDJSON chat answers keyed off the prompt (`filing assistant` → classification JSON;
`EVIL-FOLDER-TRIGGER` → malicious folder for the confinement test; `invoice|acme|total` →
invoice answer; default → photosynthesis). `e2e/global-setup.ts` writes a fresh config pointing
at `e2e/fixtures/library` and the mock host. Extend the vocab/answers when adding scenarios —
keep everything deterministic, CI has no GPU.

## Demo GIF

`npm run demo:gif` (`scripts/record-demo.ts`): records the real app against a real Ollama
(Playwright video → ffmpeg two-pass palette → `docs/demo.gif`, target < 5 MB). Preflight checks
app/Ollama/ffmpeg/fixtures and **warms the models** (a cold 27B load is 15–20 s of dead air).
Deliberately not in CI. Only ever record against the fictitious fixtures — the GIF ships in a
public README of a privacy-first product.

## Release process

1. Everything green locally (`typecheck`, `lint`, `test`, `build`, `test:e2e`) and on both CI jobs.
2. Update DECISIONS.md for anything non-obvious that landed.
3. `git tag -a vX.Y.Z -m "…" <ci-green-sha>` and push the tag. Tags point at CI-green commits.
4. (Optional, never done yet) GitHub Release with changelog from `git log vPREV..vX.Y.Z`.

## Conventions

- Conventional-ish commits (`feat:`, `fix:`, `perf:`, `security:`, `test:`, `docs:`, `chore:`,
  `refactor:`), small and logical. TDD for every pure function: the test goes in
  `tests/unit/<module>.test.ts` and red-then-green is the norm.
- `AGENTS.md` / `CLAUDE.md` at the repo root are **auto-regenerated by `next dev`** — don't
  delete them, don't hand-edit them.
- `PRODUCT.md` / `DESIGN.md` define the register and design tokens (quiet, restrained, moss-green
  primary, system fonts only). New UI should read as the same product.

## Open items / ideas (none blocking)

- Viewer scroll-to-chunk: chunk `startOffset`/`endOffset` are stored precisely for this; the
  viewer doesn't use them yet.
- `sqlite-vec` or LanceDB behind `VectorStore` for corpora beyond ~10⁵ chunks.
- MMR / keyword pre-filter for retrieval diversity (spec §8 "note ideas").
- `.pptx` / `.epub` extractors behind `extractText`; in-app DOCX preview.
- GitHub Release notes for `v0.2.0`; consider re-pointing or cutting `v0.2.1` to include the
  post-tag correctness fixes.
