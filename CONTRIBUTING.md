# Contributing

Thanks for helping! The bar for this repo is **readable, typed, tested**.

## Setup

```bash
npm ci
npm run dev
```

## Before opening a PR

All of these must be green (CI enforces them on Ubuntu and Windows):

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

## Ground rules

- TypeScript `strict` stays on; no `any` unless there is truly no alternative.
- Every file API change goes through `lib/fs-safe.ts` and gets an attack-input test if it touches
  path handling.
- No new runtime network destinations. Ever. The only outbound calls go to the configured Ollama
  host — that guarantee is the product.
- New parsers go behind `extractText`; new retrieval strategies behind `VectorStore`.
- Commit style: conventional-ish (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Small, logical
  commits.

New to the repo? Start with [docs/HANDOFF.md](docs/HANDOFF.md) — current state, invariants, and the gotchas that already cost us red CI runs.
