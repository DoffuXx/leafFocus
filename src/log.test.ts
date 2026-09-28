import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { appendLog, formatLogLine } from './log';

describe('formatLogLine', () => {
  test('serializes the entry as a single JSON line', () => {
    const line = formatLogLine({
      timestamp: '2026-09-27T00:00:00.000Z',
      event: 'request',
      requestId: 'r1',
      question: 'hi',
      prompt: 'Q: hi',
      model: 'haiku',
    });

    expect(line).toBe(
      '{"timestamp":"2026-09-27T00:00:00.000Z","event":"request","requestId":"r1","question":"hi","prompt":"Q: hi","model":"haiku"}\n'
    );
  });

  test('fills in a timestamp when one is not provided', () => {
    const line = formatLogLine({ event: 'error', requestId: 'r1', question: 'hi', error: 'boom', durationMs: 5 });
    const parsed = JSON.parse(line);

    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.event).toBe('error');
    expect(parsed.error).toBe('boom');
  });
});

describe('appendLog', () => {
  const tmpFile = `${import.meta.dir}/.log.test.tmp.log`;

  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  test('appends one JSON line per call to the given file', () => {
    appendLog({ event: 'request', requestId: 'r1', question: 'first', prompt: 'Q: first', model: undefined }, tmpFile);
    appendLog(
      { event: 'response', requestId: 'r1', question: 'first', stdout: '[]', segmentCount: 2, durationMs: 10 },
      tmpFile
    );

    const lines = readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'request', requestId: 'r1', question: 'first' });
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({ event: 'response', requestId: 'r1', segmentCount: 2, durationMs: 10 });
  });

  test('never throws when the log file cannot be written', () => {
    const unwritable = `${import.meta.dir}/missing-dir/nested.log`;

    expect(() =>
      appendLog({ event: 'error', requestId: 'r1', question: 'q', error: 'boom', durationMs: 1 }, unwritable)
    ).not.toThrow();
  });
});
