import { describe, expect, test } from 'bun:test';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';
import { TRAIL_MAX_CHILDREN, TRAIL_PLANT_MAX, nodeLabel, renderLeafTrail, type TrailLine } from './trail';
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

describe('nodeLabel', () => {
  test('uses root, then segment, then question', () => {
    const tree = createEmptyTree();
    const top = addParagraph(tree, ROOT_ID, null, 'first question', result);
    const deep = addParagraph(tree, top, 'seg', 'q', result);
    expect(nodeLabel(tree, ROOT_ID)).toBe('root');
    expect(nodeLabel(tree, top)).toBe('first question');
    expect(nodeLabel(tree, deep)).toBe('seg');
  });
});

/** Row index of the stem in a rendered trail. */
const STEM = 5;

describe('renderLeafTrail', () => {
  test('alternates path leaves above and below one stem, then one small leaf per tree leaf', () => {
    const { tree, path } = chain(1);
    const lines = renderLeafTrail(tree, path, 80);
    expect(text(lines)).toEqual([
      ' root',
      '  .^.  ',
      " /\\|/\\ ",
      '(\\\\|//)',
      '  \\|/             \\|/',
      '───┴────────┬──────┴─',
      '           /|\\  ',
      '         (##|##)',
      '          \\#|#/ ',
      "           'v'  ",
      '           s1',
    ]);
    expect(lines.at(-1)?.at(-1)).toEqual({ kind: 'current', text: 's1' });
  });

  test('keeps only the upper half when no leaf hangs below the stem', () => {
    expect(text(renderLeafTrail(createEmptyTree(), [ROOT_ID], 80))).toHaveLength(STEM + 1);
  });

  test('branches the current leaf out to its children on the right', () => {
    const { tree, path } = chain(1);
    const a = addParagraph(tree, path[1] as string, 'x', 'why?', result);
    addParagraph(tree, a, 'y', 'deeper', result);
    addParagraph(tree, path[1] as string, 'x', 'how?', result);
    addParagraph(tree, path[1] as string, 'z', 'what?', result);
    expect(text(renderLeafTrail(tree, path, 80)).slice(STEM, STEM + 3)).toEqual([
      '───┴────────┬──────┴───┬───┴───┬───┴──┬── "why?" (1)',
      '           /|\\        /|\\     /|\\     ├── "how?"',
      '         (##|##)                      └── "what?"',
    ]);
  });

  test('uses a straight branch for a single child', () => {
    const { tree, path } = chain(0);
    addParagraph(tree, ROOT_ID, null, 'only', result);
    expect(text(renderLeafTrail(tree, path, 80))[STEM]).toBe('───┴──────┴───── "only"');
  });

  test('folds old levels after root onto the stem when the path is too wide', () => {
    const { tree, path } = chain(8);
    const lines = text(renderLeafTrail(tree, path, 80));
    expect(lines[STEM]).toMatch(/^───┴─────…\d+─────┬/);
    expect(lines[0]).toMatch(/ s8$/);
    expect(lines[STEM]!.length).toBeLessThanOrEqual(80 - 20);
  });

  test('caps listed children', () => {
    const tree = createEmptyTree();
    for (let i = 0; i < TRAIL_MAX_CHILDREN + 2; i++) addParagraph(tree, ROOT_ID, null, `q${i}`, result);
    const lines = text(renderLeafTrail(tree, [ROOT_ID], 80));
    expect(lines).toHaveLength(STEM + TRAIL_MAX_CHILDREN + 1);
    expect(lines.at(-1)).toBe('                                     └── …2 more');
  });

  test('fits every line to the width', () => {
    const tree = createEmptyTree();
    addParagraph(tree, ROOT_ID, null, 'a very long question that will not fit', result);
    const lines = text(renderLeafTrail(tree, [ROOT_ID], 20));
    expect(lines[STEM]).toBe('───┴──────┴───── "a…');
    expect(lines.every((l) => l.length <= 20)).toBe(true);
  });

  test('counts tree leaves beyond the plant cap as +N on the stem', () => {
    const { tree, path } = chain(TRAIL_PLANT_MAX + 3);
    expect(text(renderLeafTrail(tree, path, 200))[STEM]).toMatch(/┬─ \+3─$/);
  });
});
