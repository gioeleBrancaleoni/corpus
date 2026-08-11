<!-- Draft README for the Corpus repo. Put this at the repo root as README.md.
     Replace YOUR-USERNAME, the demo GIF, and any model names you actually ship. -->

# Corpus

**Chat with your own documents — 100% locally.** Corpus indexes a folder of files and answers
questions about them using a local LLM through [Ollama](https://ollama.com). Nothing you index and
nothing you ask ever leaves your machine (or your LAN). No cloud, no API keys, no accounts.

<!-- Badges: enable once CI is green -->
![CI](https://github.com/YOUR-USERNAME/corpus/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

> **Why local?** Corpus is built for documents you *can't* send to a cloud provider — legal, medical,
> HR, financial, anything GDPR-relevant. The privacy guarantee isn't a feature bolted on; it's the
> reason the project exists. At runtime the app makes **zero outbound calls** except to the Ollama
> host you configure.

<!-- ![Corpus demo](docs/demo.gif) -->

---

## What it does

- **Browse** a folder of documents in a file tree — preview Markdown, PDFs, code, and text; **download** any file.
- **Ask questions** and get answers grounded in your documents via Retrieval-Augmented Generation (RAG).
- **Clickable citations** — every answer links back to the exact source file it came from.
- **Local or remote Ollama** — run the model on the same machine, or point Corpus at a beefier GPU
  box elsewhere on your network. A weak laptop can drive a strong server.
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

## How retrieval works

1. Your question is embedded with the same model used to index your documents.
2. Corpus finds the most similar chunks by cosine similarity.
3. Those chunks are handed to the chat model with a strict instruction: **answer only from this
   context, cite sources, and say so when the documents don't cover it.**
4. The answer streams back token-by-token, with a **Sources** panel linking each citation to its file.

This means answers are *grounded*: if it isn't in your documents, Corpus tells you instead of guessing.

---

## Prerequisites

1. [Install Ollama](https://ollama.com/download) and start it.
2. Pull one embedding model and one chat model:

   ```bash
   ollama pull nomic-embed-text
   ollama pull llama3.1:8b        # or any chat model you prefer
   ```

3. Node.js **>= 20**.

## Quick start

### Linux / macOS (bash)

```bash
git clone https://github.com/YOUR-USERNAME/corpus.git
cd corpus
npm ci
npm run build
npm start
# open http://localhost:3000
```

### Windows (PowerShell)

```powershell
git clone https://github.com/YOUR-USERNAME/corpus.git
cd corpus
npm ci
npm run build
npm start
# open http://localhost:3000
```

Then in the app: **Settings → pick a folder → Index → ask a question.**

### Using a remote Ollama

In **Settings**, set the Ollama host to another machine, e.g. `http://192.168.1.50:11434`.
On that machine, start Ollama listening on the network: `OLLAMA_HOST=0.0.0.0 ollama serve`.

## Configuration

| Setting            | Default                     | Notes                                        |
|--------------------|-----------------------------|----------------------------------------------|
| Root folder        | *(none — set it first)*     | The only folder Corpus can read.             |
| Ollama host        | `http://localhost:11434`    | Point anywhere on your LAN.                  |
| Chat model         | `llama3.1:8b`               | Any model you've pulled.                     |
| Embedding model    | `nomic-embed-text`          | Changing it rebuilds the index.              |
| Top-k              | `6`                         | Chunks retrieved per question.               |
| Chunk size / overlap | `~800` / `~150`           | Approximate tokens.                          |

## Security model

- **Path confinement.** Every file request is resolved against the configured root and rejected if
  it escapes it (`..`, absolute paths, symlinks, Windows UNC paths). This is covered by a dedicated
  test suite of malicious inputs.
- **No egress.** The only network destination at runtime is your Ollama host. No fonts, analytics,
  telemetry, or update checks.
- **Local by default.** The server binds to `127.0.0.1`. To expose it on your LAN, set `HOST=0.0.0.0`
  and optionally `CORPUS_TOKEN=<secret>` to require a bearer token on the API.

## Development

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
npm run test:e2e   # playwright (runs against a mocked Ollama — no GPU needed)
```

## Roadmap

- [ ] `sqlite-vec` / LanceDB backend for larger corpora
- [ ] More file formats (`.docx`, `.pptx`, `.epub`)
- [ ] Re-ranking / MMR for more diverse retrieval
- [ ] Conversation export

## License

[MIT](LICENSE)

---

<sub>Built as a study in clean, typed, tested full-stack code. Contributions and issues welcome.</sub>
