import { ROOT_ID, getChildren } from './tree.js';
import type { TreeData } from './types.js';

/** Max path levels drawn before the middle is collapsed into a `┆ …N more` line. */
export const TRAIL_MAX_DEPTH = 6;
/** Max children listed under the current leaf before the rest become `…N more`. */
export const TRAIL_MAX_CHILDREN = 5;

/** `path` = a node on the way down, `current` = where you are, `child` = a leaf under current, `more` = collapsed lines. */
export type TrailLineKind = 'path' | 'current' | 'child' | 'more';

export interface TrailLine {
  kind: TrailLineKind;
  text: string;
}

/** Short label for a node: the segment it was drilled from, else its question. */
export function nodeLabel(tree: TreeData, id: string): string {
  if (id === ROOT_ID) return 'root';
  const node = tree.nodes[id];
  if (!node) return '?';
  return node.segment ?? node.question;
}

/** Cuts `text` to `width` columns, ending with `…` when cut. */
function fit(text: string, width: number): string {
  if (width <= 0) return '';
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

/**
 * ASCII tree of `path` (root → current), one level deeper per step, with the current leaf
 * expanded to show its children. Deep paths collapse their middle; every line fits `width`.
 */
export function renderLeafTrail(tree: TreeData, path: string[], width: number): TrailLine[] {
  const hidden = Math.max(0, path.length - TRAIL_MAX_DEPTH);
  // keep root + the last (MAX_DEPTH - 1) levels; the ones between become one `more` line
  const shown = hidden > 0 ? [path[0] as string, ...path.slice(hidden + 1)] : path;
  const lines: TrailLine[] = [];

  shown.forEach((id, level) => {
    const indent = level === 0 ? '' : `${'   '.repeat(level - 1)}└─ `;
    const isCurrent = level === shown.length - 1;
    if (hidden > 0 && level === 1) {
      lines.push({ kind: 'more', text: fit(`┆  …${hidden} more`, width) });
    }
    lines.push({
      kind: isCurrent ? 'current' : 'path',
      text: fit(`${indent}${isCurrent ? '●' : '○'} ${nodeLabel(tree, id)}`, width),
    });
  });

  const currentId = path[path.length - 1] as string;
  const children = tree.nodes[currentId] ? getChildren(tree, currentId) : [];
  const listed = children.slice(0, TRAIL_MAX_CHILDREN);
  const overflow = children.length - listed.length;
  const childIndent = '   '.repeat(shown.length - 1);

  listed.forEach((child, i) => {
    const branch = i === listed.length - 1 && overflow === 0 ? '└─' : '├─';
    const count = child.children.length > 0 ? ` (${child.children.length})` : '';
    lines.push({ kind: 'child', text: fit(`${childIndent}${branch} "${child.question}"${count}`, width) });
  });
  if (overflow > 0) {
    lines.push({ kind: 'more', text: fit(`${childIndent}└─ …${overflow} more`, width) });
  }

  return lines;
}
