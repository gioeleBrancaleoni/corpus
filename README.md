# Corpus

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

Chat with your own documents — **without sending a single byte to any cloud**.

Corpus is a single-machine web app: point it at a folder, browse and preview the files in it, and
ask questions that a local LLM answers with **grounded, clickable citations** back to the exact
source file. All inference (embeddings + chat) runs through [Ollama](https://ollama.com), either on
the same machine or on another box on your LAN.

> **The privacy promise:** your documents, your questions, and the answers never leave your
> infrastructure. Corpus makes exactly **zero** outbound network calls except to the Ollama host
> you configure. No fonts, no analytics, no update checks, no telemetry. This is the product's
> whole reason to exist.

![30-second demo](docs/demo.gif) <!-- TODO: record demo GIF -->

## Who it's for

People and small teams with sensitive documents — legal, medical, HR, financial, GDPR-relevant —
who want the "chat with my documents" experience without OpenAI, Anthropic, or any hosted API.

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [Ollama](https://ollama.com) running somewhere you can reach, with two models pulled:

```
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

(Any chat model works — pick it in Settings. `nomic-embed-text` is the default embedding model.)

## Quick start — Linux / macOS (bash)

```bash
git clone https://github.com/OWNER/REPO corpus && cd corpus
npm ci
npm run build
npm start          # → http://localhost:3000
```

## Quick start — Windows (PowerShell)

```powershell
git clone https://github.com/OWNER/REPO corpus; cd corpus
npm ci
npm run build
npm start          # → http://localhost:3000
```

Then, in the app: **Settings** → set your documents folder and Ollama host → **Index library** →
ask your first question.

## Using a GPU box on your LAN

A weak laptop can use a beefy machine for inference. On the GPU box, make Ollama listen on the
network (`OLLAMA_HOST=0.0.0.0 ollama serve`), then in Corpus **Settings** set the Ollama host to
`http://192.168.x.x:11434`. That machine is the only thing Corpus will ever talk to.

## Architecture

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

## How retrieval works

1. **Index.** Corpus walks your folder (skipping dotfiles, `node_modules`, and anything listed in
   an optional `.corpusignore` file), extracts plain text per format (`.txt`/`.md`/code directly,
   `.pdf` via unpdf, `.docx` via mammoth, `.csv` as text), splits it into overlapping ~3200-char
   chunks (~800 tokens), embeds each chunk with the embedding model, and stores everything in a
   local SQLite file. Re-indexing is incremental: unchanged files (same sha256 + mtime) are skipped.
2. **Ask.** Your question is embedded with the same model, and the top-k chunks by cosine
   similarity are retrieved (brute force over Float32 vectors — milliseconds for a personal
   corpus).
3. **Answer.** The chat model receives a strict system prompt: *answer only from the provided
   excerpts, cite them as [n], say "I don't know from these documents" otherwise*. The answer
   streams token by token; every `[n]` citation is a link that highlights its source and opens the
   file it came from.

## Security model

- **Path confinement.** Every file path from the UI is resolved against the configured root with
  a canonical real-path check (`lib/fs-safe.ts`). Traversal (`..`), absolute paths, UNC paths,
  null bytes, and symlink escapes are rejected — proven by a table of attack-input tests.
- **No egress.** The only runtime network destination is the configured Ollama host.
- **Local by default.** The server binds to `127.0.0.1`. To expose it on your LAN, run with
  `HOST=0.0.0.0` and (recommended) set `CORPUS_TOKEN=<secret>` — all `/api/*` routes then require
  `Authorization: Bearer <secret>` (or a `corpus_token` cookie). This is a lock on the door, not
  an auth system: Corpus stays single-user.
- Downloads are served with safe content-disposition headers; file contents are never executed.

## Ignoring files

Drop a `.corpusignore` in your library root (see `.corpusignore.example`): one name or relative
path per line, `#` for comments.

## Development

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # Vitest unit tests
npm run test:e2e   # Playwright E2E against a mocked Ollama (no GPU needed)
```

CI runs all of the above on Ubuntu **and** Windows. See [DECISIONS.md](DECISIONS.md) for the
reasoning behind the main technical choices and [CONTRIBUTING.md](CONTRIBUTING.md) for how to
contribute.

## Docker (optional)

The primary supported path is bare `npm` on one machine. A `Dockerfile` and `docker-compose.yml`
are provided for convenience; Ollama is assumed external (or uncomment the bundled service in the
compose file).

```bash
docker compose up --build   # → http://localhost:3000
```

## License

[MIT](LICENSE)
