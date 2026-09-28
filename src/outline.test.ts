import { describe, expect, test } from 'bun:test';
import { filterOutline, flattenTree } from './outline';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';

function sampleTree() {
  const tree = createEmptyTree();
  const a = addParagraph(tree, ROOT_ID, null, 'what is a segment tree?', {
    paragraph: 'Segment trees support range queries.',
    segments: ['range queries'],
  });
  const b = addParagraph(tree, a, 'range queries', 'how fast?', { paragraph: 'Log time.', segments: ['Log time'] });
  const c = addParagraph(tree, ROOT_ID, null, 'what is a heap?', { paragraph: 'A priority queue.', segments: ['A'] });
  return { tree, a, b, c };
}

describe('flattenTree', () => {
  test('lists leaves depth-first with their depth', () => {
    const { tree, a, b, c } = sampleTree();

    expect(flattenTree(tree).map((e) => [e.node.id, e.depth])).toEqual([
      [a, 0],
      [b, 1],
      [c, 0],
    ]);
  });

  test('is empty for an empty tree', () => {
    expect(flattenTree(createEmptyTree())).toEqual([]);
  });
});

describe('filterOutline', () => {
  test('keeps everything for a blank query', () => {
    const entries = flattenTree(sampleTree().tree);
    expect(filterOutline(entries, '  ')).toEqual(entries);
  });

  test('matches question, segment or paragraph case-insensitively', () => {
    const { tree, a, b, c } = sampleTree();
    const entries = flattenTree(tree);

    expect(filterOutline(entries, 'HEAP').map((e) => e.node.id)).toEqual([c]);
    expect(filterOutline(entries, 'range queries').map((e) => e.node.id)).toEqual([a, b]);
    expect(filterOutline(entries, 'log time').map((e) => e.node.id)).toEqual([b]);
  });
});
