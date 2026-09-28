import { describe, expect, test } from 'bun:test';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';
import { TRAIL_MAX_CHILDREN, nodeLabel, renderLeafPlant, renderLeafTrail, type TrailLine } from './trail';
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

describe('renderLeafTrail', () => {
  test('draws one ASCII leaf per path level on a stem, current one filled in', () => {
    const { tree, path } = chain(1);
    const lines = renderLeafTrail(tree, path, 80);
    expect(text(lines)).toEqual([
      '  .^.      .^.  ',
      " /'|'\\    /#|#\\ ",
      "( '|' )  (##|##)",
      " '.|.'    '.|.' ",
      '───┴────────┴────',
      ' root      s1',
    ]);
    expect(lines[5]?.at(-1)).toEqual({ kind: 'current', text: 's1' });
  });

  test('branches the current leaf out to its children on the right', () => {
    const { tree, path } = chain(1);
    const a = addParagraph(tree, path[1] as string, 'x', 'why?', result);
    addParagraph(tree, a, 'y', 'deeper', result);
    addParagraph(tree, path[1] as string, 'x', 'how?', result);
    addParagraph(tree, path[1] as string, 'z', 'what?', result);
    expect(text(renderLeafTrail(tree, path, 80)).slice(4)).toEqual([
      '───┴────────┴─────┬── "why?" (1)',
      ' root      s1     ├── "how?"',
      '                  └── "what?"',
    ]);
  });

  test('uses a straight branch for a single child', () => {
    const { tree, path } = chain(0);
    addParagraph(tree, ROOT_ID, null, 'only', result);
    expect(text(renderLeafTrail(tree, path, 80))[4]).toBe('───┴──────── "only"');
  });

  test('folds old levels after root when the path is too wide', () => {
    const { tree, path } = chain(8);
    const lines = text(renderLeafTrail(tree, path, 45));
    expect(lines[5]).toMatch(/^ root +…\d+ +/);
    expect(lines[5]?.trimEnd().endsWith('s8')).toBe(true);
    expect(lines[4]!.length).toBeLessThanOrEqual(45 - 20);
  });

  test('caps listed children', () => {
    const tree = createEmptyTree();
    for (let i = 0; i < TRAIL_MAX_CHILDREN + 2; i++) addParagraph(tree, ROOT_ID, null, `q${i}`, result);
    const lines = text(renderLeafTrail(tree, [ROOT_ID], 80));
    expect(lines).toHaveLength(4 + TRAIL_MAX_CHILDREN + 1);
    expect(lines.at(-1)).toBe('         └── …2 more');
  });

  test('fits every line to the width', () => {
    const tree = createEmptyTree();
    addParagraph(tree, ROOT_ID, null, 'a very long question that will not fit', result);
    const lines = text(renderLeafTrail(tree, [ROOT_ID], 20));
    expect(lines[4]).toBe('───┴──────── "a ver…');
    expect(lines.every((l) => l.length <= 20)).toBe(true);
  });
});

describe('renderLeafPlant', () => {
  test('grows one leaf per tree leaf, alternating above and below a full-width stem', () => {
    expect(renderLeafPlant(3, 20)).toEqual([' \\|/     \\|/', '──┴───┬───┴─────────', '     /|\\']);
  });

  test('shows a bare stem for an empty tree', () => {
    expect(renderLeafPlant(0, 8)).toEqual(['', '────────', '']);
  });

  test('counts leaves that do not fit as +N', () => {
    const [, stem] = renderLeafPlant(10, 22);
    expect(stem).toBe('──┴───┬───┴─── +7─────');
    expect(stem).toHaveLength(22);
  });
});
