import { describe, expect, test } from 'bun:test';
import { splitParagraph } from './paragraph';

describe('splitParagraph', () => {
  test('splits plain text around matched segments in order', () => {
    const spans = splitParagraph('Segment trees support range queries and point updates.', [
      'range queries',
      'point updates',
    ]);

    expect(spans).toEqual([
      { text: 'Segment trees support ', segmentIndex: null },
      { text: 'range queries', segmentIndex: 0 },
      { text: ' and ', segmentIndex: null },
      { text: 'point updates', segmentIndex: 1 },
      { text: '.', segmentIndex: null },
    ]);
  });

  test('returns the whole paragraph as one plain span when there are no segments', () => {
    expect(splitParagraph('Just a paragraph.', [])).toEqual([{ text: 'Just a paragraph.', segmentIndex: null }]);
  });

  test('skips a segment that does not occur in the paragraph', () => {
    const spans = splitParagraph('Only this segment is here.', ['this segment', 'missing segment']);

    expect(spans).toEqual([
      { text: 'Only ', segmentIndex: null },
      { text: 'this segment', segmentIndex: 0 },
      { text: ' is here.', segmentIndex: null },
    ]);
  });

  test('matches a segment that starts at position 0', () => {
    const spans = splitParagraph('Range queries are fast.', ['Range queries']);

    expect(spans[0]).toEqual({ text: 'Range queries', segmentIndex: 0 });
  });

  test('matches each occurrence at or after the previous cursor, even if segments repeat', () => {
    const spans = splitParagraph('log time beats linear time for log time queries.', ['log time', 'log time']);

    expect(spans.filter((s) => s.segmentIndex !== null)).toHaveLength(2);
    expect(spans.map((s) => s.text).join('')).toBe('log time beats linear time for log time queries.');
  });
});
