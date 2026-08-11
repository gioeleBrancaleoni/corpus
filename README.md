# Corpus

**Chat with your own documents — 100% locally.** Corpus indexes a folder of files and answers
questions about them using a local LLM through [Ollama](https://ollama.com). Nothing you index and
nothing you ask ever leaves your machine (or your LAN). No cloud, no API keys, no accounts.

[![CI](https://github.com/gioeleBrancaleoni/corpus/actions/workflows/ci.yml/badge.svg)](https://github.com/gioeleBrancaleoni/corpus/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

> **Why local?** Corpus is built for documents you *can't* send to a cloud provider — legal, medical,
> HR, financial, anything GDPR-relevant. The privacy guarantee isn't a feature bolted on; it's the
> reason the project exists. At runtime the app makes **zero outbound calls** except to the Ollama
> host you configure.

![Corpus: indexing a folder and answering a question about an invoice, fully locally](docs/demo.gif)

<sub>Regenerate with `npm run demo:gif` (needs the app running, a reachable Ollama with the
configured models, and `ffmpeg` on PATH — see `scripts/record-demo.ts`).</sub>

---

## What it does

- **Browse** a folder of documents in a file tree — preview Markdown, PDFs, code, CSV and text; **download** any file.
- **Ask questions** and get answers grounded in your documents via Retrieval-Augmented Generation (RAG).
- **Clickable citations** — every `[n]` in an answer links back to the exact source file it came from.
- **Local or remote Ollama** — run the model on the same machine, or point Corpus at a beefier GPU
  box elsewhere on your network. A weak laptop can drive a strong server.
- **VRAM-aware model picks** — Corpus detects your NVIDIA GPU (or takes a manual VRAM value) and
  recommends chat + embedding models sized for it, with one-click apply and the exact
  `ollama pull` command for anything missing.
- **Cross-platform** — first-class support for **Windows and Linux**, verified in CI on both.

## Tech stack

| Layer            | Choice                                                        |
|------------------|---------------------------------------------------------------|
| App              | Next.js (App Router) + TypeScript (`strict`)                  |
| UI               | React + Tailwind CSS                                          |
| Storage          | SQLite (`better-sqlite3`) — single file, no server            |
| Vector search    | In-process cosine similarity (swappable `VectorStore` interface) |
| Inference        | Ollama HTTP API — embeddings + chat, streamed                 |
| Tests            | Vitest (unit) + Playwright (E2E)                              |
| CI               | GitHub Actions, matrix on Ubuntu **and** Windows              |

> **On the vector store:** for a personal corpus (up to tens of thousands of chunks), a brute-force
> cosine search in TypeScript is a few milliseconds and needs **no native vector extension** — which
> is what keeps the "just works on Windows and Linux" promise honest. It lives behind a `VectorStore`
> interface, so swapping in `sqlite-vec` or LanceDB later is a one-file change. See
> [`DECISIONS.md`](DECISIONS.md).

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
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

## How retrieval works

1. **Index.** Corpus walks your folder (skipping dotfiles, `node_modules`, and anything in an
   optional `.corpusignore`), extracts plain text per format, splits it into overlapping chunks,
   embeds each chunk, and stores everything in a local SQLite file. Re-indexing is incremental:
   unchanged files (same sha256 + mtime) are skipped.
2. **Ask.** Your question is embedded with the same model used to index your documents, and Corpus
   finds the most similar chunks by cosine similarity.
3. **Answer.** Those chunks are handed to the chat model with a strict instruction: **answer only
   from this context, cite sources as [n], and say so when the documents don't cover it.**
4. The answer streams back token-by-token, with a **Sources** panel linking each citation to its file.

This means answers are *grounded*: if it isn't in your documents, Corpus tells you instead of guessing.

---

## Prerequisites

1. [Install Ollama](https://ollama.com/download) and start it.
2. Pull one embedding model and one chat model, **sized for your GPU**. Corpus recommends the
   right pair in **Settings** (NVIDIA VRAM is detected automatically; otherwise enter it
   manually). The default tiers:

   | Available VRAM | Chat model    | Embedding model           |
   |----------------|---------------|---------------------------|
   | ≥ 24 GB        | `qwen3.6:27b` | `snowflake-arctic-embed2:latest` |
   | 16–24 GB       | `gpt-oss:20b` | `snowflake-arctic-embed2:latest` |
   | 6–16 GB        | `qwen2.5:7b`  | `nomic-embed-text:latest`        |
   | < 6 GB / CPU   | `llama3.2:3b` | `nomic-embed-text:latest`        |

   For example, on a 24 GB card:

   ```bash
   ollama pull snowflake-arctic-embed2:latest
   ollama pull qwen3.6:27b
   ```

   All tags verified on [ollama.com](https://ollama.com/library); the ≥ 24 GB tier is validated
   on an RTX 3090 Ti (24 GB). Sizes leave headroom for context, embeddings and the OS.

3. Node.js **>= 20**.

## Quick start

### Linux / macOS (bash)

```bash
git clone https://github.com/gioeleBrancaleoni/corpus.git corpus
cd corpus
npm ci
npm run build
npm start
# open http://localhost:3000
```

### Windows (PowerShell)

```powershell
git clone https://github.com/gioeleBrancaleoni/corpus.git corpus
cd corpus
npm ci
npm run build
npm start
# open http://localhost:3000
```

Then in the app: **Settings → pick a folder → Index library → ask a question.**

### Using a remote Ollama

In **Settings**, set the Ollama host to another machine, e.g. `http://192.168.1.50:11434`.
On that machine, start Ollama listening on the network: `OLLAMA_HOST=0.0.0.0 ollama serve`.
That machine is the only thing Corpus will ever talk to.

## Configuration

| Setting              | Default                     | Notes                                        |
|----------------------|-----------------------------|----------------------------------------------|
| Root folder          | *(none — set it first)*     | The only folder Corpus can read.             |
| Ollama host          | `http://localhost:11434`    | Point anywhere on your LAN.                  |
| Chat model           | Recommended per your VRAM (see Settings) | Any model you've pulled.        |
| Embedding model      | Recommended per your VRAM (see Settings) | Changing it rebuilds the index. |
| VRAM (manual)        | auto-detected via `nvidia-smi` | Set by hand on AMD/Apple/CPU-only machines. |
| Top-k                | `6`                         | Chunks retrieved per question.               |
| Chunk size / overlap | `3200` / `600` chars        | ≈ 800 / 150 tokens.                          |

To exclude files from indexing, drop a `.corpusignore` in your library root (one name or relative
path per line, `#` for comments — see [`.corpusignore.example`](.corpusignore.example)).

## Security model

- **Path confinement.** Every file request is resolved against the configured root with a canonical
  real-path check and rejected if it escapes it (`..`, absolute paths, null bytes, symlinks,
  Windows UNC paths). This is covered by a dedicated test suite of malicious inputs
  (`tests/unit/fs-safe.test.ts`).
- **No egress.** The only network destination at runtime is your Ollama host. No fonts, analytics,
  telemetry, or update checks — the app ships zero external assets.
- **Local by default.** The server binds to `127.0.0.1`. To expose it on your LAN, set `HOST=0.0.0.0`
  and (recommended) `CORPUS_TOKEN=<secret>` — all `/api/*` routes then require
  `Authorization: Bearer <secret>` (or a `corpus_token` cookie). A lock on the door, not an auth
  system: Corpus stays single-user.
- Downloads are served with safe content-disposition headers; file contents are never executed.

## Development

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
npm run test:e2e   # playwright (runs against a mocked Ollama — no GPU needed)
```

CI runs all of the above on Ubuntu **and** Windows. See [DECISIONS.md](DECISIONS.md) for the
reasoning behind the main technical choices and [CONTRIBUTING.md](CONTRIBUTING.md) for how to
contribute.

## Docker (optional)

The primary supported path is bare `npm` on one machine. A `Dockerfile` and `docker-compose.yml`
are provided for convenience; Ollama is assumed external (or uncomment the bundled service in the
compose file).

## Roadmap

- [ ] `sqlite-vec` / LanceDB backend for larger corpora
- [ ] More file formats (`.pptx`, `.epub`) and in-app DOCX preview
- [ ] Re-ranking / MMR for more diverse retrieval
- [ ] Conversation export

## License

[MIT](LICENSE)

---

<sub>Built as a study in clean, typed, tested full-stack code. Contributions and issues welcome.</sub>
