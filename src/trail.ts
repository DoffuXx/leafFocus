import { ROOT_ID, getChildren } from './tree.js';
import type { TreeData } from './types.js';

/** Max children branched out from the current leaf before the rest become `…N more`. */
export const TRAIL_MAX_CHILDREN = 5;
/** Max columns for one path label, so a single long segment can't eat the whole trail. */
export const TRAIL_LABEL_MAX = 18;
/** Columns kept free on the right for child labels before the path starts folding. */
export const TRAIL_CHILD_ROOM = 20;

/**
 * Drawn above the stem for each leaf on the path, midrib and veins included; the current one is
 * filled in. Style adapted from the veined leaf at https://www.asciiart.eu/plants/leaf.
 */
const LEAF_ART = ['  .^.  ', " /'|'\\ ", "( '|' )", " '.|.' "];
const CURRENT_LEAF_ART = ['  .^.  ', ' /#|#\\ ', '(##|##)', " '.|.' "];
const LEAF_ART_WIDTH = 7;
const COLUMN_GAP = 2;
/** Rows: 4 of leaf art, the stem, the labels. */
const STEM_ROW = 4;
const LABEL_ROW = 5;

/** Header plant leaves alternate above and below the stem, one every PLANT_LEAF_SPACING columns. */
const PLANT_LEAF_UP = '\\|/';
const PLANT_LEAF_DOWN = '/|\\';
const PLANT_LEAF_SPACING = 4;

/** `stem` = connectors and the way here, `leaf` = leaf art on the path, `current` = where you are, `child` = the next leaves. */
export type TrailPartKind = 'stem' | 'leaf' | 'current' | 'child';

export interface TrailPart {
  kind: TrailPartKind;
  text: string;
}

/** One terminal row, as colored parts in reading order. */
export type TrailLine = TrailPart[];

/** One path level laid out as a column: leaf art above the stem, label below. */
interface Column {
  kind: 'path' | 'current' | 'fold';
  label: string;
  x: number;
  width: number;
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

/** Lays out the visible path left to right; `hidden` levels after root become one `…N` column. */
function layoutColumns(tree: TreeData, ids: string[], hidden: number): Column[] {
  const columns: Column[] = [];
  let x = 0;
  const add = (kind: Column['kind'], label: string) => {
    const width = kind === 'fold' ? label.length : Math.max(LEAF_ART_WIDTH, label.length);
    columns.push({ kind, label, x, width });
    x += width + COLUMN_GAP;
  };
  ids.forEach((id, i) => {
    if (hidden > 0 && i === 1) add('fold', `…${hidden}`);
    add(i === ids.length - 1 ? 'current' : 'path', fit(nodeLabel(tree, id), TRAIL_LABEL_MAX));
  });
  return columns;
}

/** Columns the path takes, including the bit of stem after the last leaf. */
function pathWidth(columns: Column[]): number {
  const last = columns[columns.length - 1] as Column;
  return last.x + last.width + 1;
}

/**
 * The path (root → current) drawn as a vine growing to the right: an ASCII leaf per level above
 * the stem, its label below, and the current leaf branching out to its children. Old levels fold
 * into `…N` so it fits `width`.
 */
export function renderLeafTrail(tree: TreeData, path: string[], width: number): TrailLine[] {
  let hidden = 0;
  let columns = layoutColumns(tree, path, 0);
  // fold the oldest levels after root until the path leaves room for the children
  while (path.length - hidden > 2 && pathWidth(columns) > width - TRAIL_CHILD_ROOM) {
    hidden++;
    columns = layoutColumns(tree, [path[0] as string, ...path.slice(hidden + 1)], hidden);
  }

  const currentId = path[path.length - 1] as string;
  const children = tree.nodes[currentId] ? getChildren(tree, currentId) : [];
  const branches = children.slice(0, TRAIL_MAX_CHILDREN).map((child): TrailPart => {
    const count = child.children.length > 0 ? ` (${child.children.length})` : '';
    return { kind: 'child', text: `"${child.question}"${count}` };
  });
  const overflow = children.length - branches.length;
  if (overflow > 0) branches.push({ kind: 'stem', text: `…${overflow} more` });

  const rows: TrailLine[] = Array.from({ length: Math.max(LABEL_ROW + 1, STEM_ROW + branches.length) }, () => []);
  const lengths = rows.map(() => 0);
  /** Appends `text` to row `r` starting at column `x`, padding the gap with spaces. */
  const put = (r: number, x: number, kind: TrailPartKind, text: string) => {
    const gap = x - (lengths[r] as number);
    if (gap > 0) rows[r]?.push({ kind: 'stem', text: ' '.repeat(gap) });
    rows[r]?.push({ kind, text });
    lengths[r] = Math.max(x, lengths[r] as number) + text.length;
  };

  const stem = Array.from({ length: pathWidth(columns) }, () => '─');
  for (const col of columns) {
    const center = col.x + Math.floor(col.width / 2);
    put(LABEL_ROW, col.x + Math.floor((col.width - col.label.length) / 2), col.kind === 'current' ? 'current' : 'stem', col.label);
    if (col.kind === 'fold') continue;
    const art = col.kind === 'current' ? CURRENT_LEAF_ART : LEAF_ART;
    art.forEach((line, r) => put(r, center - 3, col.kind === 'current' ? 'current' : 'leaf', line));
    stem[center] = '┴';
  }
  put(STEM_ROW, 0, 'stem', stem.join(''));

  // every branch is 5 columns wide, with ┬ ├ └ lined up in the same column
  branches.forEach((branch, i) => {
    const connector =
      branches.length === 1 ? '──── ' : i === 0 ? '─┬── ' : i === branches.length - 1 ? ' └── ' : ' ├── ';
    const r = STEM_ROW + i;
    put(r, pathWidth(columns), 'stem', connector);
    put(r, pathWidth(columns) + connector.length, branch.kind, branch.text);
  });

  return rows.map((row) => clipParts(row, width));
}

/**
 * A vine across `width` with one small ASCII leaf per leaf in the tree, alternating above and
 * below the stem, so it grows as the tree does. Leaves that don't fit are counted as `+N`.
 */
export function renderLeafPlant(leafCount: number, width: number): string[] {
  const fits = Math.max(0, Math.floor((width - 6) / PLANT_LEAF_SPACING));
  const shown = leafCount <= fits ? leafCount : Math.max(0, fits - 1);
  const above = Array.from({ length: width }, () => ' ');
  const stem = Array.from({ length: width }, () => '─');
  const below = Array.from({ length: width }, () => ' ');
  /** Writes `text` into `row` starting at column `x`. */
  const draw = (row: string[], x: number, text: string) => [...text].forEach((ch, j) => (row[x + j] = ch));

  for (let i = 0; i < shown; i++) {
    const x = 2 + i * PLANT_LEAF_SPACING;
    const up = i % 2 === 0;
    draw(up ? above : below, x - 1, up ? PLANT_LEAF_UP : PLANT_LEAF_DOWN);
    stem[x] = up ? '┴' : '┬';
  }
  if (shown < leafCount) draw(stem, 2 + shown * PLANT_LEAF_SPACING, ` +${leafCount - shown}`);

  return [above, stem, below].map((row) => row.slice(0, width).join('').trimEnd());
}
