# Contributing to leaffocus

Thanks for your interest! Bug reports, ideas, and pull requests are all welcome.

## Reporting issues

Open an [issue](https://github.com/DoffuXx/leafFocus/issues) with:

- what you did, what you expected, and what happened
- your OS, Bun version (`bun --version`), and `claude` CLI version (`claude --version`)
- relevant lines from `.segment-tree.log`, if any (remove anything private)

## Development setup

```bash
git clone https://github.com/DoffuXx/leafFocus.git
cd leafFocus
bun install
bun run dev
```

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused: one fix or feature per PR.
3. Add or update tests for logic changes (`src/*.test.ts`).
4. Make sure checks pass locally:
   ```bash
   bun run typecheck
   bun test
   ```
5. Describe **what** changed and **why** in the PR description.

## Code style

- TypeScript with explicit types on exported functions.
- Keep it simple: prefer small, pure, testable functions (see `paragraph.ts`, `tree.ts`).
- Document non-obvious behavior with a short JSDoc comment explaining *why*.
- Match the style of surrounding code.
