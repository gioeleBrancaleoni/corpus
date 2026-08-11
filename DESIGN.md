# DESIGN.md — Corpus

**Mood:** a quiet institutional reading room — moss on wet stone, mineral and calm. Trustworthy, unhurried, precise.

**Strategy:** Restrained. Pure white surface (dark: pure near-black), one moss-green primary carrying actions/selection/citations, slate-teal accent for status and links, ≤10% color on screen.

## Tokens (OKLCH, defined in `app/globals.css`)

| Role | Light | Dark |
|---|---|---|
| `--bg` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `--surface` | `oklch(0.967 0.003 160)` | `oklch(0.205 0.004 160)` |
| `--ink` | `oklch(0.21 0.012 160)` | `oklch(0.93 0.005 160)` |
| `--muted` | `oklch(0.47 0.015 160)` | `oklch(0.71 0.01 160)` |
| `--primary` | `oklch(0.50 0.115 160)` | `oklch(0.72 0.115 160)` |
| `--accent` | `oklch(0.68 0.10 215)` | `oklch(0.75 0.10 215)` |
| `--line` | `oklch(0.90 0.004 160)` | `oklch(0.30 0.004 160)` |
| `--danger` | `oklch(0.55 0.19 25)` | `oklch(0.70 0.17 25)` |

White text on primary/accent fills (Helmholtz-Kohlrausch). Status colors: indexed = primary, stale = amber `oklch(0.75 0.14 80)`, error = danger.

## Typography

System sans only (`ui-sans-serif, system-ui, …`) — no external or bundled display fonts (privacy: zero fetches, even at build). Mono for code/paths: `ui-monospace, SFMono-Regular, Menlo, Consolas`. Fixed rem scale, ratio 1.2: 12 / 13 (UI default) / 14 body / 17 / 20 / 24. Weight contrast over size where possible.

## Layout

Three-pane grid: Library 260px | center flexible | Sources 300px. Panels separated by 1px `--line`, panel headers 40px. Sidebars collapse below 1024px (Library becomes overlay; Sources stacks under chat). Density is welcome in the tree and sources; prose (viewer md, chat answers) capped at 72ch.

## Motion

150–250ms, ease-out; state changes only (dialog, tab switch, streaming caret, progress). No page-load choreography. `prefers-reduced-motion` honored everywhere.

## Components

Buttons: solid primary (white text), quiet secondary (surface + line border), ghost icon buttons. All controls share 6px radius, visible `:focus-visible` ring (`--accent`, 2px offset). Every interactive component ships default/hover/focus/active/disabled/loading states. Empty states teach the 3 setup steps. Skeletons over spinners for panel loads.
