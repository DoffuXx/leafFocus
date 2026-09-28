import { describe, expect, test } from 'bun:test';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';
import { TRAIL_MAX_CHILDREN, TRAIL_MAX_DEPTH, nodeLabel, renderLeafTrail } from './trail';
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
  test('draws the path one level deeper per step and marks the current leaf', () => {
    const { tree, path } = chain(2);
    expect(renderLeafTrail(tree, path, 80)).toEqual([
      { kind: 'path', text: '○ root' },
      { kind: 'path', text: '└─ ○ s1' },
      { kind: 'current', text: '   └─ ● s2' },
    ]);
  });

  test('expands the current leaf with its children and their leaf counts', () => {
    const { tree, path } = chain(1);
    const a = addParagraph(tree, path[1] as string, 'x', 'why?', result);
    addParagraph(tree, a, 'y', 'deeper', result);
    addParagraph(tree, path[1] as string, 'x', 'how?', result);
    expect(renderLeafTrail(tree, path, 80).slice(2)).toEqual([
      { kind: 'child', text: '   ├─ "why?" (1)' },
      { kind: 'child', text: '   └─ "how?"' },
    ]);
  });

  test('collapses the middle of a deep path', () => {
    const { tree, path } = chain(TRAIL_MAX_DEPTH + 2);
    const lines = renderLeafTrail(tree, path, 80);
    expect(lines[1]).toEqual({ kind: 'more', text: '┆  …3 more' });
    expect(lines.filter((l) => l.kind !== 'more')).toHaveLength(TRAIL_MAX_DEPTH);
    expect(lines[lines.length - 1]?.kind).toBe('current');
  });

  test('caps listed children', () => {
    const tree = createEmptyTree();
    for (let i = 0; i < TRAIL_MAX_CHILDREN + 2; i++) addParagraph(tree, ROOT_ID, null, `q${i}`, result);
    const lines = renderLeafTrail(tree, [ROOT_ID], 80);
    expect(lines.filter((l) => l.kind === 'child')).toHaveLength(TRAIL_MAX_CHILDREN);
    expect(lines[lines.length - 1]).toEqual({ kind: 'more', text: '└─ …2 more' });
  });

  test('fits every line to the width', () => {
    const tree = createEmptyTree();
    addParagraph(tree, ROOT_ID, null, 'a very long question that will not fit', result);
    const lines = renderLeafTrail(tree, [ROOT_ID], 12);
    expect(lines[1]?.text).toBe('└─ "a very …');
    expect(lines.every((l) => l.text.length <= 12)).toBe(true);
  });
});
