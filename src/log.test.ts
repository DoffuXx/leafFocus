import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { appendLog, formatLogLine } from './log';

describe('formatLogLine', () => {
  test('serializes the entry as a single JSON line', () => {
    const line = formatLogLine({ timestamp: '2026-09-27T00:00:00.000Z', event: 'request', question: 'hi' });

    expect(line).toBe('{"timestamp":"2026-09-27T00:00:00.000Z","event":"request","question":"hi"}\n');
  });

  test('fills in a timestamp when one is not provided', () => {
    const line = formatLogLine({ event: 'error', error: 'boom' });
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
    appendLog({ event: 'request', question: 'first' }, tmpFile);
    appendLog({ event: 'response', question: 'first', segmentCount: 2 }, tmpFile);

    const lines = readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'request', question: 'first' });
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({ event: 'response', segmentCount: 2 });
  });
});
