import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { exportSession, treeToMarkdown } from './export';
import { ROOT_ID, addParagraph, createEmptyTree } from './tree';

describe('treeToMarkdown', () => {
  test('renders only the title for an empty tree', () => {
    expect(treeToMarkdown(createEmptyTree())).toBe('# leafFocus session\n');
  });

  test('nests drill-downs one heading level deeper and notes the source segment', () => {
    const tree = createEmptyTree();
    const a = addParagraph(tree, ROOT_ID, null, 'what is a segment tree?', {
      paragraph: 'Segment trees support range queries.',
      segments: ['range queries'],
    });
    addParagraph(tree, a, 'range queries', 'how fast?', { paragraph: 'Log time.', segments: ['Log time'] });

    expect(treeToMarkdown(tree)).toBe(
      [
        '# leafFocus session',
        '',
        '## Q: what is a segment tree?',
        '',
        'Segment trees support range queries.',
        '',
        '### Q: how fast? _(on "range queries")_',
        '',
        'Log time.',
        '',
      ].join('\n')
    );
  });
});

describe('exportSession', () => {
  const tmpDir = `${import.meta.dir}/.export.test.tmp`;

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  test('writes <session id>.md into the exports dir', () => {
    const tree = createEmptyTree();
    addParagraph(tree, ROOT_ID, null, 'q', { paragraph: 'p', segments: ['p'] });

    const file = exportSession('.segment-tree/sessions/abc.json', tree, tmpDir);

    expect(file).toBe(`${tmpDir}/abc.md`);
    expect(readFileSync(file, 'utf-8')).toContain('## Q: q');
  });
});
