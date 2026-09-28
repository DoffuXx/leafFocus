import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { countLeaves, loadTree } from './tree.js';

export const SESSIONS_DIR = '.segment-tree/sessions';

/** Creates the sessions dir if needed and returns a fresh, unused session file path. */
export function newSessionFile(dir: string = SESSIONS_DIR): string {
  mkdirSync(dir, { recursive: true });
  return join(dir, `${randomUUID()}.json`);
}

export interface SessionSummary {
  file: string;
  updatedAt: Date;
  title: string;
  leafCount: number;
}

/**
 * Past sessions with at least one question asked, newest first — for a `claude -r`-style picker.
 * Unreadable files (e.g. corrupt JSON) are skipped so one bad file can't crash the picker.
 */
export function listSessions(dir: string = SESSIONS_DIR): SessionSummary[] {
  if (!existsSync(dir)) return [];

  const summaries = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = join(dir, f);
      try {
        const tree = loadTree(file);
        const firstChildId = tree.nodes[tree.rootId]?.children[0];
        const title = firstChildId ? tree.nodes[firstChildId]?.question || '(untitled)' : null;
        return title ? { file, updatedAt: statSync(file).mtime, title, leafCount: countLeaves(tree) } : null;
      } catch {
        return null;
      }
    })
    .filter((s): s is SessionSummary => s !== null);

  return summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
