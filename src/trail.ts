import { ROOT_ID, getChildren } from './tree.js';
import type { TreeData } from './types.js';

/** Max children branched out from the current leaf before the rest become `…N more`. */
export const TRAIL_MAX_CHILDREN = 5;
/** Max columns for one path label, so a single long segment can't eat the whole trail. */
export const TRAIL_LABEL_MAX = 18;
/** Columns kept free on the right for child labels before the path starts collapsing. */
export const TRAIL_CHILD_ROOM = 20;

/** `path` = the way here (and connectors), `current` = where you are, `child` = the next leaves. */
export type TrailPartKind = 'path' | 'current' | 'child';

export interface TrailPart {
  kind: TrailPartKind;
  text: string;
}

/** One terminal row of the trail, as colored parts in reading order. */
export type TrailLine = TrailPart[];

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

function partsWidth(parts: TrailPart[]): number {
  return parts.reduce((sum, p) => sum + p.text.length, 0);
}

/** Cuts a row of parts to `width` columns, keeping each part's kind. */
function clipParts(parts: TrailPart[], width: number): TrailPart[] {
  const out: TrailPart[] = [];
  let left = width;
  for (const part of parts) {
    if (left <= 0) break;
    const text = part.text.length <= left ? part.text : fit(part.text, left);
    out.push({ kind: part.kind, text });
    left -= text.length;
  }
  return out;
}

/** `○ root ── …N ── ○ a ── ● b` — the visible path, `hidden` = levels folded after root. */
function pathParts(tree: TreeData, ids: string[], hidden: number): TrailPart[] {
  const parts: TrailPart[] = [];
  ids.forEach((id, i) => {
    if (i > 0) parts.push({ kind: 'path', text: ' ── ' });
    if (hidden > 0 && i === 1) parts.push({ kind: 'path', text: `…${hidden} ── ` });
    const isCurrent = i === ids.length - 1;
    const label = fit(nodeLabel(tree, id), TRAIL_LABEL_MAX);
    parts.push({ kind: isCurrent ? 'current' : 'path', text: `${isCurrent ? '●' : '○'} ${label}` });
  });
  return parts;
}

/**
 * Horizontal ASCII tree: the path (root → current) grows left to right, and the current leaf
 * branches out to its children on the right. Old levels fold into `…N` so it fits `width`.
 */
export function renderLeafTrail(tree: TreeData, path: string[], width: number): TrailLine[] {
  let hidden = 0;
  let head = pathParts(tree, path, 0);
  // fold the oldest levels after root until the path leaves room for the children
  while (path.length - hidden > 2 && partsWidth(head) > width - TRAIL_CHILD_ROOM) {
    hidden++;
    head = pathParts(tree, [path[0] as string, ...path.slice(hidden + 1)], hidden);
  }

  const currentId = path[path.length - 1] as string;
  const children = tree.nodes[currentId] ? getChildren(tree, currentId) : [];
  const rows = children.slice(0, TRAIL_MAX_CHILDREN).map((child): TrailPart => {
    const count = child.children.length > 0 ? ` (${child.children.length})` : '';
    return { kind: 'child', text: `"${child.question}"${count}` };
  });
  const overflow = children.length - rows.length;
  if (overflow > 0) rows.push({ kind: 'path', text: `…${overflow} more` });

  if (rows.length === 0) return [clipParts(head, width)];

  const headWidth = partsWidth(head);
  return rows.map((row, i) => {
    // every branch is 5 columns wide, with ┬ ├ └ lined up in the same column
    const branch = rows.length === 1 ? ' ─── ' : i === 0 ? ' ─┬─ ' : i === rows.length - 1 ? '  └─ ' : '  ├─ ';
    const lead = i === 0 ? head : [{ kind: 'path' as const, text: ' '.repeat(headWidth) }];
    return clipParts([...lead, { kind: 'path', text: branch }, row], width);
  });
}
