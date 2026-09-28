import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { TreeData } from './types.js';

export const EXPORTS_DIR = '.segment-tree/exports';

/** Markdown headings stop at h6; deeper leaves reuse it. */
const MAX_HEADING_LEVEL = 6;

/** Renders the whole tree depth-first as Markdown: one heading per leaf (question), then its paragraph. */
export function treeToMarkdown(tree: TreeData): string {
  const lines: string[] = ['# leafFocus session', ''];

  const walk = (nodeId: string, depth: number): void => {
    for (const childId of tree.nodes[nodeId]?.children ?? []) {
      const node = tree.nodes[childId];
      if (!node) continue;
      const hashes = '#'.repeat(Math.min(depth + 2, MAX_HEADING_LEVEL));
      const from = node.segment ? ` _(on "${node.segment}")_` : '';
      lines.push(`${hashes} Q: ${node.question}${from}`, '', node.paragraph, '');
      walk(childId, depth + 1);
    }
  };
  walk(tree.rootId, 0);

  return lines.join('\n');
}

/** Writes the tree as `<EXPORTS_DIR>/<session id>.md` and returns that path. */
export function exportSession(treeFile: string, tree: TreeData, dir: string = EXPORTS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${basename(treeFile, '.json')}.md`);
  writeFileSync(file, treeToMarkdown(tree), 'utf-8');
  return file;
}
