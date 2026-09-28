import { ROOT_ID } from './tree.js';
import type { TreeData } from './types.js';

/**
 * One small leaf per tree leaf, 3 columns wide, alternating above and below the stem: pointed tip,
 * veined blade and a petiole on the stem. The current one is filled in.
 */
const LEAF_UP = ['/^\\', '\\|/'];
const LEAF_DOWN = ['/|\\', '\\v/'];
const CURRENT_LEAF_UP = ['/#\\', '\\#/'];
const CURRENT_LEAF_DOWN = ['/#\\', '\\#/'];
/** Columns between two leaves; alternating sides lets them sit this close without touching. */
const LEAF_SPACING = 3;

/** Fixed rows: two of upper leaves, the stem, two of lower leaves. */
export const TRAIL_HEIGHT = 5;
const STEM_ROW = 2;

/** `stem` = the vine, `leaf` = a leaf on the path to where you are, `current` = where you are, `other` = any other leaf. */
export type TrailPartKind = 'stem' | 'leaf' | 'current' | 'other';

export interface TrailPart {
  kind: TrailPartKind;
  text: string;
}

/** One terminal row, as colored parts in reading order. */
export type TrailLine = TrailPart[];

/** A grid of cells, one char and kind each, flattened into same-kind parts per row. */
function toLines(cells: TrailPart[][]): TrailLine[] {
  return cells.map((row) =>
    row.reduce<TrailLine>((parts, cell) => {
      const last = parts[parts.length - 1];
      if (last?.kind === cell.kind) last.text += cell.text;
      else parts.push({ ...cell });
      return parts;
    }, [])
  );
}

/**
 * The whole session as one vine of fixed size (`width` × {@link TRAIL_HEIGHT}) growing left to right:
 * every leaf is appended in the order it was asked, alternating above and below the stem, with the
 * path to the current leaf highlighted and a dotted stem left to grow on. When the leaves don't fit,
 * the view slides to keep the current one in sight, with `…N` / `+N` counting the leaves cut off.
 */
export function renderLeafTrail(tree: TreeData, path: string[], width: number): TrailLine[] {
  const ids = Object.keys(tree.nodes).filter((id) => id !== ROOT_ID);
  const currentId = path[path.length - 1] as string;
  const onPath = new Set(path);
  const currentIndex = ids.indexOf(currentId);

  // room for the `…N─` / `─+N` markers on both ends, then as many leaves as fit
  const marker = `…${ids.length}─`.length;
  const capacity = Math.max(1, Math.floor((width - 2 * marker) / LEAF_SPACING));
  const start =
    ids.length <= capacity ? 0 : Math.min(ids.length - capacity, Math.max(0, currentIndex - capacity + 1));
  const end = Math.min(ids.length, start + capacity);

  const cells: TrailPart[][] = Array.from({ length: TRAIL_HEIGHT }, () =>
    Array.from({ length: width }, (): TrailPart => ({ kind: 'stem', text: ' ' }))
  );
  /** Writes `text` into row `r` from column `x`, dropping what falls outside the width. */
  const put = (r: number, x: number, kind: TrailPartKind, text: string) =>
    [...text].forEach((ch, j) => {
      const cell = cells[r]?.[x + j];
      if (cell) Object.assign(cell, { kind, text: ch });
    });

  // stem: root (or the hidden count), the vine, then dots to grow on (or the count past the view)
  const head = start > 0 ? `…${start}─` : '●─';
  put(STEM_ROW, 0, path.length === 1 ? 'current' : 'stem', head);
  const tailX = head.length + (end - start) * LEAF_SPACING;
  put(STEM_ROW, head.length, 'stem', '─'.repeat(Math.max(0, tailX - head.length)));
  put(STEM_ROW, tailX, 'stem', end < ids.length ? `─+${ids.length - end}` : '╌'.repeat(Math.max(0, width - tailX)));

  ids.slice(start, end).forEach((id, i) => {
    const index = start + i;
    const up = index % 2 === 0; // by overall index, so leaves keep their side while the view slides
    const current = id === currentId;
    const kind: TrailPartKind = current ? 'current' : onPath.has(id) ? 'leaf' : 'other';
    const art = current ? (up ? CURRENT_LEAF_UP : CURRENT_LEAF_DOWN) : up ? LEAF_UP : LEAF_DOWN;
    const center = head.length + i * LEAF_SPACING + 1;
    art.forEach((line, r) => put(up ? r : STEM_ROW + 1 + r, center - 1, kind, line));
    put(STEM_ROW, center, kind, up ? '┴' : '┬');
  });

  return toLines(cells);
}
