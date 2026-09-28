import { describe, expect, test } from 'bun:test';
import { toSingleLine } from './input';

describe('toSingleLine', () => {
  test('keeps plain text as is', () => {
    expect(toSingleLine('hello world')).toBe('hello world');
  });

  test('turns line breaks and tabs into spaces', () => {
    expect(toSingleLine('abc\r')).toBe('abc ');
    expect(toSingleLine('line one\r\nline two\nthree\tfour')).toBe('line one line two three four');
  });

  test('drops other control characters', () => {
    expect(toSingleLine('a\u0007b\u007fc')).toBe('abc');
  });
});
