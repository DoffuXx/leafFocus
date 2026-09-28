import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import {
  ROOT_ID,
  addParagraph,
  createEmptyTree,
  getChildren,
  getChildrenForSegment,
  getPath,
  loadTree,
  saveTree,
} from './tree';
import type { ParagraphResult } from './types';

describe('createEmptyTree', () => {
  test('creates a tree with only the root node', () => {
    const tree = createEmptyTree();
    expect(tree.rootId).toBe(ROOT_ID);
    expect(Object.keys(tree.nodes)).toEqual([ROOT_ID]);
    expect(tree.nodes[ROOT_ID]?.children).toEqual([]);
    expect(tree.nodes[ROOT_ID]?.segments).toEqual([]);
  });
});

describe('addParagraph', () => {
  const result: ParagraphResult = {
    paragraph: 'Segment trees support range queries and point updates efficiently.',
    segments: ['range queries', 'point updates'],
  };

  test('adds a paragraph node as a child, tagged with the question and drill-down segment', () => {
    const tree = createEmptyTree();

    const id = addParagraph(tree, ROOT_ID, null, 'what is a segment tree?', result);

    expect(tree.nodes[ROOT_ID]?.children).toEqual([id]);
    expect(tree.nodes[id]).toMatchObject({
      parentId: ROOT_ID,
      segment: null,
      question: 'what is a segment tree?',
      paragraph: result.paragraph,
      segments: result.segments,
      children: [],
    });
  });

  test('records the segment it was drilled down from', () => {
    const tree = createEmptyTree();
    const rootId = addParagraph(tree, ROOT_ID, null, 'q1', result);

    const childId = addParagraph(tree, rootId, 'range queries', 'q2', {
      paragraph: 'Range queries sum values over an interval in log time.',
      segments: ['log time'],
    });

    expect(tree.nodes[childId]?.segment).toBe('range queries');
    expect(tree.nodes[rootId]?.children).toEqual([childId]);
  });

  test('allows multiple children off the same parent (different or repeated segments)', () => {
    const tree = createEmptyTree();
    const rootId = addParagraph(tree, ROOT_ID, null, 'q1', result);

    addParagraph(tree, rootId, 'range queries', 'q2', { paragraph: 'a', segments: ['x'] });
    addParagraph(tree, rootId, 'range queries', 'q3', { paragraph: 'b', segments: ['y'] });

    expect(tree.nodes[rootId]?.children).toHaveLength(2);
  });
});

describe('getChildren', () => {
  test('resolves child ids to their nodes', () => {
    const tree = createEmptyTree();
    const id = addParagraph(tree, ROOT_ID, null, 'q', { paragraph: 'p', segments: ['x'] });

    const children = getChildren(tree, ROOT_ID);

    expect(children).toHaveLength(1);
    expect(children[0]?.id).toBe(id);
  });
});

describe('getChildrenForSegment', () => {
  test('returns an empty array when no child was drilled down from that segment', () => {
    const tree = createEmptyTree();
    const rootId = addParagraph(tree, ROOT_ID, null, 'q1', { paragraph: 'p', segments: ['x'] });

    expect(getChildrenForSegment(tree, rootId, 'x')).toEqual([]);
  });

  test('returns all children for a segment asked more than once, in creation order', () => {
    const tree = createEmptyTree();
    const rootId = addParagraph(tree, ROOT_ID, null, 'q1', { paragraph: 'p', segments: ['x'] });

    const first = addParagraph(tree, rootId, 'x', 'q2', { paragraph: 'first', segments: ['a'] });
    const second = addParagraph(tree, rootId, 'x', 'q3', { paragraph: 'second', segments: ['b'] });

    expect(getChildrenForSegment(tree, rootId, 'x').map((n) => n.id)).toEqual([first, second]);
  });

  test('matches unanchored (null-segment) children too', () => {
    const tree = createEmptyTree();
    const id = addParagraph(tree, ROOT_ID, null, 'q1', { paragraph: 'p', segments: ['x'] });

    expect(getChildrenForSegment(tree, ROOT_ID, null).map((n) => n.id)).toEqual([id]);
  });
});

describe('getPath', () => {
  test('returns nodes from root (exclusive) down to nodeId', () => {
    const tree = createEmptyTree();
    const aId = addParagraph(tree, ROOT_ID, null, 'q1', { paragraph: 'p1', segments: ['x'] });
    const bId = addParagraph(tree, aId, 'x', 'q2', { paragraph: 'p2', segments: ['y'] });

    const path = getPath(tree, bId);

    expect(path.map((n) => n.id)).toEqual([aId, bId]);
  });

  test('returns an empty path for the root node', () => {
    const tree = createEmptyTree();
    expect(getPath(tree, ROOT_ID)).toEqual([]);
  });
});

describe('loadTree / saveTree', () => {
  const tmpFile = `${import.meta.dir}/.tree.test.tmp.json`;

  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  test('loadTree returns an empty tree when the file does not exist', () => {
    expect(loadTree(tmpFile)).toEqual(createEmptyTree());
  });

  test('saveTree then loadTree round-trips the data', () => {
    const tree = createEmptyTree();
    addParagraph(tree, ROOT_ID, null, 'q', { paragraph: 'p', segments: ['x'] });

    saveTree(tmpFile, tree);

    expect(loadTree(tmpFile)).toEqual(tree);
  });
});
