import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildClaudeArgs, buildPrompt, extractPartialSegments, getParagraph, parseParagraphOutput } from './claude';

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
    expect(buildClaudeArgs('hi', { model: 'haiku', instructions: undefined }).slice(-2)).toEqual(['--model', 'haiku']);
  });

  test('omits --model when no model is set', () => {
    expect(buildClaudeArgs('hi', { model: undefined, instructions: undefined })).not.toContain('--model');
  });

  test('appends instructions to the system prompt', () => {
    const args = buildClaudeArgs('hi', { model: undefined, instructions: 'Answer in French.' });
    const systemPrompt = args[args.indexOf('--append-system-prompt') + 1];

    expect(systemPrompt).toContain('Respond only with the requested JSON');
    expect(systemPrompt).toEndWith('Answer in French.');
  });

  test('runs a fast, tool-less, streamed JSON-output call with room for the structured-output turn', () => {
    const args = buildClaudeArgs('hi', undefined);
    const flag = (name: string): string | undefined => args[args.indexOf(name) + 1];

    expect(args.slice(0, 2)).toEqual(['-p', 'hi']);
    expect(flag('--output-format')).toBe('stream-json');
    expect(args).toContain('--verbose');
    expect(args).toContain('--include-partial-messages');
    expect(flag('--max-turns')).toBe('3');
    expect(flag('--tools')).toBe('');
    expect(flag('--effort')).toBe('low');
    expect(args).toContain('--strict-mcp-config');
  });
});

describe('parseParagraphOutput', () => {
  test('reads segments from structured_output and joins them into the paragraph', () => {
    const stdout = JSON.stringify([
      { type: 'system', subtype: 'init' },
      {
        type: 'result',
        is_error: false,
        structured_output: { segments: ['Segment trees support range queries', ' and point updates. '] },
      },
    ]);

    expect(parseParagraphOutput(stdout)).toEqual({
      paragraph: 'Segment trees support range queries and point updates.',
      segments: ['Segment trees support range queries', 'and point updates.'],
    });
  });

  test('reads duration and cost from the result event when reported', () => {
    const stdout = JSON.stringify([
      {
        type: 'result',
        is_error: false,
        duration_ms: 4200,
        total_cost_usd: 0.0031,
        structured_output: { segments: ['Range queries.'] },
      },
    ]);

    expect(parseParagraphOutput(stdout).usage).toEqual({ durationMs: 4200, costUsd: 0.0031 });
  });

  test('falls back to parsing the JSON in `result` when structured_output is absent', () => {
    const stdout = JSON.stringify([
      { type: 'result', is_error: false, result: JSON.stringify({ segments: ['Segment trees support range queries.'] }) },
    ]);

    expect(parseParagraphOutput(stdout)).toEqual({
      paragraph: 'Segment trees support range queries.',
      segments: ['Segment trees support range queries.'],
    });
  });

  test('accepts a single result object (newer CLI versions) instead of an event array', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, structured_output: { segments: ['Range queries.'] } });

    expect(parseParagraphOutput(stdout).paragraph).toBe('Range queries.');
  });

  test('throws when the payload does not match the segments schema', () => {
    const stdout = JSON.stringify([{ type: 'result', is_error: false, structured_output: { segments: [] } }]);

    expect(() => parseParagraphOutput(stdout)).toThrow();
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

describe('parseParagraphOutput (stream-json)', () => {
  test('reads the result event from JSON lines', () => {
    const stdout = [
      { type: 'system', subtype: 'init' },
      { type: 'stream_event', event: { type: 'content_block_delta' } },
      { type: 'result', is_error: false, structured_output: { segments: ['One.', 'Two.'] } },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n');

    expect(parseParagraphOutput(`${stdout}\n`)).toEqual({ paragraph: 'One. Two.', segments: ['One.', 'Two.'] });
  });
});

describe('extractPartialSegments', () => {
  test('returns nothing before the array opens', () => {
    expect(extractPartialSegments('')).toEqual([]);
    expect(extractPartialSegments('{"segm')).toEqual([]);
  });

  test('includes closed segments and the still-open one', () => {
    expect(extractPartialSegments('{"segments": ["A leaf is", "It us')).toEqual(['A leaf is', 'It us']);
  });

  test('decodes escapes and drops an escape cut off mid-stream', () => {
    expect(extractPartialSegments('{"segments": ["say \\"hi\\" \\u00e9')).toEqual(['say "hi" é']);
    expect(extractPartialSegments('{"segments": ["tab\\')).toEqual(['tab']);
    expect(extractPartialSegments('{"segments": ["x \\u00')).toEqual(['x']);
  });

  test('stops at the end of the array', () => {
    expect(extractPartialSegments('{"segments": ["a", "b"], "x": ["c"]}')).toEqual(['a', 'b']);
  });
});

describe('getParagraph', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leaffocus-'));
  const originalPath = process.env.PATH;
  afterAll(() => {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  });

  test('decodes multibyte characters split across stdout chunks', async () => {
    // Fake `claude` writing its result a few bytes at a time, cutting through multibyte characters.
    const line = `${JSON.stringify({ type: 'result', is_error: false, structured_output: { segments: ['日本語のテスト。', '🌱 ok'] } })}\n`;
    const script = join(dir, 'claude');
    writeFileSync(
      script,
      `#!/usr/bin/env bun\nconst b = Buffer.from(${JSON.stringify(line)});\n` +
        'for (let i = 0; i < b.length; i += 5) { process.stdout.write(b.subarray(i, i + 5)); await Bun.sleep(2); }\n'
    );
    chmodSync(script, 0o755);
    process.env.PATH = `${dir}:${originalPath}`;

    const result = await getParagraph(null, 'q');
    expect(result.paragraph).toBe('日本語のテスト。 🌱 ok');
  });
});
