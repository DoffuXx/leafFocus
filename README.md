# 🍃 leaffocus

> A terminal UI for exploring answers as a **tree**, not a scrollback.

Ask a question and get back **one paragraph**, split into meaningful **segments**. Cycle through the
segments, drill into any of them, and each drill-down produces its own new paragraph + segments.
The result is a branching tree of conversation you can navigate, resume, and revisit.

[![CI](https://github.com/DoffuXx/leafFocus/actions/workflows/ci.yml/badge.svg)](https://github.com/DoffuXx/leafFocus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Features

- **Focused answers**: one paragraph per question, no walls of text.
- **Segmented by meaning**: every paragraph is split into verbatim chunks you can highlight.
- **Drill-down branches**: ask a follow-up about any segment; it becomes a child node.
- **Persistent sessions**: every run is saved and can be resumed later (`--resume`).
- **No API key**: uses your logged-in [`claude` CLI](https://docs.claude.com/en/docs/claude-code) in headless mode.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- The `claude` CLI installed, on your `PATH`, and logged in (`claude login`)

## Quick start

```bash
git clone https://github.com/DoffuXx/leafFocus.git
cd leafFocus
bun install
bun run dev
```

## Usage

```bash
bun run dev            # start a brand-new session (fresh tree)
bun run dev --resume   # pick a past session to continue, like `claude -r`
```

### Keys

| Key                       | Action                                                 |
| ------------------------- | ------------------------------------------------------ |
| `Tab` / `↑` / `↓`         | Cycle between segments in the current paragraph        |
| `Enter` (input empty)     | Drill into the highlighted segment's existing children |
| type + `Enter`            | Ask/continue from the highlighted segment (new branch) |
| `Backspace` (input empty) | Go back up                                             |
| `q` (input empty)         | Save and quit                                          |

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
| `.segment-tree.log`                | JSON-lines log of every `claude` call (debugging) |

Both are git-ignored.

## Project structure

```
index.tsx           # entry point, parses --resume
src/
  claude.ts         # prompt building, CLI call, output parsing/validation
  tree.ts           # tree data model + load/save
  session.ts        # session files + resume picker data
  paragraph.ts      # splits a paragraph into plain/segment spans for rendering
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
