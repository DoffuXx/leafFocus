# Contributing to leafFocus

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

## Code conventions

These describe how the existing code is written; new code should read the same.

### Layout

- `src/*.ts` — pure logic, one concern per module (`tree.ts`, `paragraph.ts`, `config.ts`, …).
- `src/ui/*.tsx` — Ink/React components only; keep logic out of them and call into `src/*.ts`.
- `src/types.ts` — shared data shapes (`TreeNode`, `TreeData`, …). Module-local types stay in their module.
- Tests live next to the code as `src/<module>.test.ts`, using `bun:test`.

### TypeScript

- Strict mode is on; `bun run typecheck` must pass. Avoid `any` and non-null `!` — narrow instead.
- Explicit parameter and return types on exported functions.
- `interface` for object shapes, `type` for unions/aliases (e.g. `type Mode = 'browsing' | 'loading' | 'error'`).
- Validate external input (config files, CLI JSON) with `zod` and derive the type via `z.infer`.
- Prefer named exports; `default` export only for top-level UI components (`App`, `Root`).

### Imports

- Relative imports use the `.js` extension: `import { getPath } from './tree.js'`.
- Node built-ins use the `node:` prefix: `import { readFileSync } from 'node:fs'`.
- Type-only imports use `import type` (or inline `type`), required by `verbatimModuleSyntax`.
- Order: runtime/external packages, then local modules.

### Formatting

- 2-space indent, single quotes, semicolons, trailing commas in multiline literals.
- Aim for lines ≤ 120 characters.

### Naming

- `camelCase` for functions and variables, `PascalCase` for types and components.
- `UPPER_SNAKE_CASE` for module-level constants (`ROOT_ID`, `CONFIG_PATHS`).
- Functions are verbs (`addParagraph`, `removeNode`); booleans read as predicates.

### Functions and state

- Keep it simple: small, pure, testable functions (see `paragraph.ts`, `tree.ts`).
- Do I/O at the edges (`claude.ts`, `session.ts`, `log.ts`) so the core stays pure.
- Throw `Error` with a message that says what failed and where; catch only where you can recover or report it.

### Comments

- JSDoc (`/** … */`) on exported functions, types, and non-obvious fields.
- Explain *why*, not *what*; a short line comment for guards and workarounds
  (e.g. `// guard: splice(-1, 1) would drop the last sibling instead`).
- Match the style of surrounding code.

### Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `docs:`, `chore:`, `test:`, `refactor:`.
- Imperative, lowercase summary, e.g. `fix: guard removeNode against wrong-sibling splice`.
