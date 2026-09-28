import { describe, expect, test } from 'bun:test';
import { toSingleLine, typedText } from './input';

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

describe('typedText', () => {
  const plain = { ctrl: false, meta: false };

  test('returns flattened input for plain keys', () => {
    expect(typedText('ab\r', plain)).toBe('ab ');
  });

  test('ignores Ctrl/Meta chords', () => {
    expect(typedText('e', { ctrl: true, meta: false })).toBe('');
    expect(typedText('x', { ctrl: false, meta: true })).toBe('');
  });
});
