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

## Usage

```bash
bun run dev            # start a brand-new session (fresh tree)
bun run dev --resume   # pick a past session to continue, like `claude -r`
```

## Header

- **Plant** — a stem across the top with one small ASCII leaf per leaf in the session, so it grows
  as your tree does (`+N` when they no longer fit).
- **Trail** — the path from `root` to where you are, drawn as a vine growing to the right: an ASCII
  leaf per level (the current one filled in) with its label below, and the current leaf branching
  out to its next leaves (`(n)` = how many leaves each of those has). When the path gets too wide,
  old levels fold into `…N`.

## Keys

- `Tab` / `↑` / `↓` — cycle between segments in the current paragraph
- `Enter` (input empty) — drill into the highlighted segment's existing children
- type + `Enter` — ask/continue from the highlighted segment (adds a new branch)
- `Backspace` (input empty) — go back up
- `q` (input empty) — save and quit

## Storage

Each run gets its own tree file under `.segment-tree/sessions/<id>.json`. `bun run dev --resume`
lists past sessions (by their first question) to pick up where you left off; a plain `bun run dev`
always starts empty. Every call to the `claude` CLI is also appended as a JSON line to
`.segment-tree.log` for debugging.
