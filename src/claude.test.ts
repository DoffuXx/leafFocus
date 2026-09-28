import { describe, expect, test } from 'bun:test';
import { buildClaudeArgs, buildPrompt, parseParagraphOutput } from './claude';

describe('buildPrompt', () => {
  test('sends just the question when there is no parent context', () => {
    const prompt = buildPrompt(null, 'what is a segment tree?');

    expect(prompt).toContain('Q: what is a segment tree?');
    expect(prompt).toContain('single flowing paragraph');
    expect(prompt).not.toContain('Context paragraph:');
  });

  test('includes the parent paragraph and focus segment, not a full ancestor chain', () => {
    const prompt = buildPrompt(
      { paragraph: 'Segment trees support range queries efficiently.', segment: 'range queries' },
      'how efficient exactly?'
    );

    expect(prompt).toContain('Context paragraph: Segment trees support range queries efficiently.');
    expect(prompt).toContain('Focus segment: "range queries"');
    expect(prompt).toContain('Q: how efficient exactly?');
  });

  test('omits the focus segment line when segment is null', () => {
    const prompt = buildPrompt({ paragraph: 'Some paragraph.', segment: null }, 'follow up');

    expect(prompt).toContain('Context paragraph: Some paragraph.');
    expect(prompt).not.toContain('Focus segment:');
  });
});

describe('buildClaudeArgs', () => {
  test('passes --model when a model is given', () => {
    expect(buildClaudeArgs('hi', 'haiku').slice(-2)).toEqual(['--model', 'haiku']);
  });

  test('omits --model when no model is set', () => {
    expect(buildClaudeArgs('hi', '')).not.toContain('--model');
  });

  test('runs a tool-less, JSON-output call with room for the structured-output turn', () => {
    const args = buildClaudeArgs('hi', undefined);
    const flag = (name: string): string | undefined => args[args.indexOf(name) + 1];

    expect(args.slice(0, 2)).toEqual(['-p', 'hi']);
    expect(flag('--output-format')).toBe('json');
    expect(flag('--max-turns')).toBe('3');
    expect(flag('--allowedTools')).toBe('');
  });
});

describe('parseParagraphOutput', () => {
  test('reads paragraph + segments from structured_output on the result event', () => {
    const stdout = JSON.stringify([
      { type: 'system', subtype: 'init' },
      {
        type: 'result',
        is_error: false,
        structured_output: {
          paragraph: 'Segment trees support range queries and point updates.',
          segments: ['range queries', 'point updates'],
        },
      },
    ]);

    expect(parseParagraphOutput(stdout)).toEqual({
      paragraph: 'Segment trees support range queries and point updates.',
      segments: ['range queries', 'point updates'],
    });
  });

  test('falls back to parsing the JSON in `result` when structured_output is absent', () => {
    const stdout = JSON.stringify([
      {
        type: 'result',
        is_error: false,
        result: JSON.stringify({ paragraph: 'Segment trees support range queries.', segments: ['range queries'] }),
      },
    ]);

    expect(parseParagraphOutput(stdout)).toEqual({
      paragraph: 'Segment trees support range queries.',
      segments: ['range queries'],
    });
  });

  test('throws when the payload does not match the paragraph schema', () => {
    const stdout = JSON.stringify([
      { type: 'result', is_error: false, structured_output: { paragraph: '', segments: [] } },
    ]);

    expect(() => parseParagraphOutput(stdout)).toThrow();
  });

  test('drops segments that are not verbatim substrings of the paragraph', () => {
    const stdout = JSON.stringify([
      {
        type: 'result',
        is_error: false,
        structured_output: {
          paragraph: 'Segment trees support range queries.',
          segments: ['range queries', 'a paraphrased segment not in the text'],
        },
      },
    ]);

    expect(parseParagraphOutput(stdout).segments).toEqual(['range queries']);
  });

  test('throws when none of the segments are verbatim substrings', () => {
    const stdout = JSON.stringify([
      {
        type: 'result',
        is_error: false,
        structured_output: { paragraph: 'Segment trees support range queries.', segments: ['nope'] },
      },
    ]);

    expect(() => parseParagraphOutput(stdout)).toThrow('verbatim');
  });

  test('throws when no result event is present', () => {
    const stdout = JSON.stringify([{ type: 'system', subtype: 'init' }]);

    expect(() => parseParagraphOutput(stdout)).toThrow('did not contain a result event');
  });

  test('throws with the CLI error message when is_error is true', () => {
    const stdout = JSON.stringify([{ type: 'result', is_error: true, result: 'boom' }]);

    expect(() => parseParagraphOutput(stdout)).toThrow('boom');
  });
});
