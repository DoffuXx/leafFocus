# 🍃 leafFocus

> A terminal UI for exploring answers as a **tree**, not a scrollback.

Ask a question and get back **one paragraph**, split into meaningful **segments**. Cycle through the
segments, drill into any of them, and each drill-down produces its own new paragraph + segments.
The result is a branching tree of conversation you can navigate, resume, and revisit.

[![CI](https://github.com/DoffuXx/leafFocus/actions/workflows/ci.yml/badge.svg)](https://github.com/DoffuXx/leafFocus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Vibecoded](https://img.shields.io/badge/vibecoded-%E2%9C%A8-blueviolet)

![leaffocus demo: ask a question, cycle segments, drill into one](docs/demo.gif)

## Features

- **Focused answers**: one paragraph per question, no walls of text.
- **Segmented by meaning**: every paragraph is split into verbatim chunks you can highlight.
- **Drill-down branches**: ask a follow-up about any segment; it becomes a child node.
- **Persistent sessions**: every run is saved and can be resumed later (`--resume`).
- **Regenerate, delete, export**: re-ask a leaf, prune a branch, or export the session to Markdown.
- **Configurable**: choose the model and full-screen mode via a YAML file, `LEAFFOCUS_*` env vars or `.env`.
- **No API key**: uses your logged-in [`claude` CLI](https://docs.claude.com/en/docs/claude-code) in headless mode.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3 (not needed for the release binaries)
- The `claude` CLI installed, on your `PATH`, and logged in (`claude login`)

## Quick start

```bash
git clone https://github.com/DoffuXx/leafFocus.git
cd leafFocus
bun install
bun run dev
```

## Release binary

Pushing a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`) builds standalone binaries for
Linux, macOS (x64/arm64) and Windows and attaches them, with `leaffocus.example.yaml`, to a GitHub
Release. No Bun needed to run them — only the `claude` CLI. Build locally with `bun run build`
(→ `dist/leaffocus`).

## Configuration

Set in a YAML file, environment variables, or a `.env` file (Bun loads it automatically). Env vars
override the YAML file. The YAML file is the first found of `./leaffocus.yaml` (per project) and
`~/.config/leaffocus/config.yaml` (global) — copy `leaffocus.example.yaml` or `.env.example`:

```bash
cp leaffocus.example.yaml leaffocus.yaml   # or: cp .env.example .env
```

| YAML key     | Variable               | Default     | Effect                                                                                |
| ------------ | ---------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `model`      | `LEAFFOCUS_MODEL`      | CLI default | Model passed to `claude --model`, e.g. `haiku` for faster, cheaper answers             |
| `fullscreen` | `LEAFFOCUS_FULLSCREEN` | `false`     | `true` renders full-screen (alternate screen, full height); terminal restored on exit |
| `instructions` | `LEAFFOCUS_INSTRUCTIONS` | none    | Standing instructions added to every answer, e.g. `Answer in French.`                 |

One-off: `LEAFFOCUS_FULLSCREEN=true bun run dev`.

## Usage

```bash
bun run dev            # start a brand-new session (fresh tree)
bun run dev --resume   # pick a past session to continue, like `claude -r`
```

### Header

- **Vine** — one stem through the middle growing to the right like a tree branch: a veined ASCII
  leaf per level of the path from `root` to where you are (the current one filled in), alternating
  above and below the stem with its label on the outside, then one small leaf per leaf in the
  session, so it grows as your tree does (`+N` when they no longer fit), and finally the current
  leaf branching out to its next leaves (`(n)` = how many leaves each of those has). When the path
  gets too wide, old levels fold into `…N` on the stem.

### Keys

| Key                       | Action                                                 |
| ------------------------- | ------------------------------------------------------ |
| `Tab` / `↑` / `↓`         | Cycle between segments in the current paragraph        |
| `Enter` (input empty)     | Drill into the highlighted segment's existing children |
| type + `Enter`            | Ask/continue from the highlighted segment (new branch) |
| `Backspace` (input empty) | Go back up                                             |
| `q` (input empty)         | Save and quit                                          |
| `←` / `→`                 | Switch between answers from the same segment           |
| `Ctrl+T`                  | Outline: type to filter, `↑`/`↓` + `Enter` to jump     |
| `Esc` (while thinking)    | Cancel the request (your question is kept)             |
| `Ctrl+R`                  | Regenerate the current leaf (new sibling, old kept)    |
| `Ctrl+D`                  | Delete the current leaf and its subtree (asks y/n)     |
| `Ctrl+E`                  | Export the session as Markdown                         |

On an error, `Esc`/`Enter` returns with your question still typed, so `Enter` retries.

Each answer shows how long it took and what it cost next to its question; the header shows the
session total.

## How it works

1. Your question (plus the parent paragraph and the focused segment, if any) is sent to
   `claude -p` with a JSON schema forcing `{ paragraph, segments }` output.
2. The response is validated: only segments that appear **verbatim** in the paragraph are kept.
3. The result is added as a node in the tree and saved to disk.

The CLI runs with `--allowedTools ''`, so it is a plain Q&A call with no file or shell access.

## Storage

| Path                               | Contents                                          |
| ---------------------------------- | ------------------------------------------------- |
| `.segment-tree/sessions/<id>.json` | One tree per session (listed by `--resume`)       |
| `.segment-tree/exports/<id>.md`    | Markdown exports (`Ctrl+E`)                       |
| `.segment-tree.log`                | JSON-lines log of every `claude` call (debugging) |

All are git-ignored. Each log entry is a `request`, then `response` or `error`, sharing a
`requestId` (with `model` and `durationMs`). Logging is best-effort: a failed write never breaks
a request.

## Project structure

```
index.tsx           # entry point, parses --resume
src/
  claude.ts         # prompt building, CLI call, output parsing/validation
  config.ts         # LEAFFOCUS_* env configuration
  export.ts         # Markdown export
  outline.ts        # flattened/filtered tree for the Ctrl+T outline
  tree.ts           # tree data model + load/save
  session.ts        # session files + resume picker data
  paragraph.ts      # splits a paragraph into plain/segment spans for rendering
  trail.ts          # ASCII header: one vine (leaf trail + growing plant)
  log.ts            # JSON-lines debug log
  types.ts          # shared types
  ui/Root.tsx       # session picker vs. running app
  ui/App.tsx        # main Ink UI
```

## Development

```bash
bun test            # run unit tests
bun run typecheck   # tsc --noEmit
```

CI runs both on every push and pull request.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
