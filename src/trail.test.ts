import { describe, expect, test } from 'bun:test';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';
import { TRAIL_HEIGHT, renderLeafTrail, type TrailLine } from './trail';
import type { TreeData } from './types';

const result = { paragraph: 'p', segments: ['p'] };

/** Builds a straight chain root → n1 → … → nN, each drilled from segment `sI`. */
function chain(depth: number): { tree: TreeData; path: string[] } {
  const tree = createEmptyTree();
  const path = [ROOT_ID];
  for (let i = 1; i <= depth; i++) {
    path.push(addParagraph(tree, path[path.length - 1] as string, `s${i}`, `q${i}`, result));
  }
  return { tree, path };
}

/** Joins each line's parts into plain text. */
const text = (lines: TrailLine[]): string[] => lines.map((l) => l.map((p) => p.text).join(''));

/** Row index of the stem in a rendered trail. */
const STEM = 2;

describe('renderLeafTrail', () => {
  test('is a bare dotted stem at root with no leaves', () => {
    const lines = renderLeafTrail(createEmptyTree(), [ROOT_ID], 10);
    expect(text(lines)).toEqual([' '.repeat(10), ' '.repeat(10), '●─╌╌╌╌╌╌╌╌', ' '.repeat(10), ' '.repeat(10)]);
    expect(lines[STEM]?.[0]).toEqual({ kind: 'current', text: '●─' });
  });

  test('appends every leaf in order, alternating above and below one stem, current filled in', () => {
    const { tree, path } = chain(2);
    addParagraph(tree, ROOT_ID, null, 'other', result);
    const lines = renderLeafTrail(tree, path, 16);
    expect(text(lines)).toEqual([
      '  /^\\   /^\\     ',
      '  \\|/   \\|/     ',
      '●──┴──┬──┴─╌╌╌╌╌',
      '     /#\\        ',
      '     \\#/        ',
    ]);
    const kinds = (row: TrailLine) => row.filter((p) => p.text.trim()).map((p) => p.kind);
    expect(kinds(lines[0] as TrailLine)).toEqual(['leaf', 'other']);
    expect(kinds(lines[3] as TrailLine)).toEqual(['current']);
  });

  test('keeps a fixed width and height', () => {
    const { tree, path } = chain(40);
    const lines = text(renderLeafTrail(tree, path, 30));
    expect(lines).toHaveLength(TRAIL_HEIGHT);
    expect(lines.every((l) => l.length === 30)).toBe(true);
  });

  test('slides the view to keep the current leaf in sight, counting hidden leaves', () => {
    const { tree, path } = chain(40);
    expect(text(renderLeafTrail(tree, path, 30))[STEM]).toMatch(/^…33─.*┬─╌+$/);
    expect(text(renderLeafTrail(tree, path.slice(0, 2), 30))[STEM]).toMatch(/^●─.*─\+33 *$/);
  });
});
