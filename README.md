# leaffocus

Ask the AI something and get back one paragraph, fully segmented by meaning. Cycle between segments,
drill into any of them, and each drill-down gets its own new paragraph + segments — a tree of
conversation, not a flat scrollback.

## Setup

```bash
bun install
bun run dev
```

Requires the `claude` CLI installed, on your `PATH`, and logged in (`claude login`) — no API key
needed in this app itself, it shells out to the CLI in headless mode (`claude -p`).

## Release binary

Pushing a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`) builds standalone binaries for
Linux, macOS (x64/arm64) and Windows and attaches them, with `leaffocus.example.yaml`, to a GitHub
Release. No Bun needed to run them — only the `claude` CLI. Build locally with `bun run build`
(→ `dist/leaffocus`).

## Configuration

Set in a YAML file, environment variables, or a `.env` file (Bun loads it automatically). Env vars
override the YAML file. The YAML file is the first found of `./leaffocus.yaml` (per project) and
`~/.config/leaffocus/config.yaml` (global) — copy `leaffocus.example.yaml`:

| YAML key     | Variable               | Default     | Effect                                                                                |
| ------------ | ---------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `model`      | `LEAFFOCUS_MODEL`      | CLI default | Model passed to `claude --model`, e.g. `haiku` for faster, cheaper answers             |
| `fullscreen` | `LEAFFOCUS_FULLSCREEN` | `false`     | `true` renders full-screen (alternate screen, full height); terminal restored on exit |

One-off: `LEAFFOCUS_FULLSCREEN=true bun run dev`.

## Usage

```bash
bun run dev            # start a brand-new session (fresh tree)
bun run dev --resume   # pick a past session to continue, like `claude -r`
```

## Keys

- `Tab` / `↑` / `↓` — cycle between segments in the current paragraph
- `Enter` (input empty) — drill into the highlighted segment's existing children
- type + `Enter` — ask/continue from the highlighted segment (adds a new branch)
- `Backspace` (input empty) — go back up
- `q` (input empty) — save and quit
- `Ctrl+R` — regenerate the current leaf (re-asks its question; the new answer is added as a sibling, the old one is kept)
- `Ctrl+D` — delete the current leaf and everything under it (asks y/n first)
- `Ctrl+E` — export the whole session as Markdown to `.segment-tree/exports/<id>.md`
- On an error: `Esc`/`Enter` returns with your question still typed, so `Enter` retries

## Storage

Each run gets its own tree file under `.segment-tree/sessions/<id>.json`. `bun run dev --resume`
lists past sessions (by their first question) to pick up where you left off; a plain `bun run dev`
always starts empty. Every call to the `claude` CLI is also appended as JSON lines to
`.segment-tree.log` for debugging: `request`, then `response` or `error`, sharing a `requestId`
(with `model` and `durationMs`). Logging is best-effort — a failed write never breaks a request.
