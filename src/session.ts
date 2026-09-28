import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { countLeaves, loadTree } from './tree.js';

export const SESSIONS_DIR = '.segment-tree/sessions';

/** Creates the sessions dir if needed and returns a fresh, unused session file path. */
export function newSessionFile(): string {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  return join(SESSIONS_DIR, `${randomUUID()}.json`);
}

export interface SessionSummary {
  file: string;
  updatedAt: Date;
  title: string;
  leafCount: number;
}

/** Past sessions with at least one question asked, newest first — for a `claude -r`-style picker. */
export function listSessions(): SessionSummary[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const summaries = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = join(SESSIONS_DIR, f);
      const tree = loadTree(file);
      const firstChildId = tree.nodes[tree.rootId]?.children[0];
      const title = firstChildId ? tree.nodes[firstChildId]?.question || '(untitled)' : null;
      return title ? { file, updatedAt: statSync(file).mtime, title, leafCount: countLeaves(tree) } : null;
    })
    .filter((s): s is SessionSummary => s !== null);

  return summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
