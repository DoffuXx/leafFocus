import { describe, expect, test } from 'bun:test';
import { parseCli } from './cli';
import { parseConfig } from './config';

describe('parseCli', () => {
  test('defaults to no flags set', () => {
    expect(parseCli([])).toEqual({
      help: false,
      version: false,
      resume: false,
      overrides: { model: undefined, fullscreen: undefined, instructions: undefined },
    });
  });

  test('reads long and short flags', () => {
    expect(parseCli(['-r', '-m', 'haiku', '--fullscreen', '--instructions', 'Be brief.'])).toEqual({
      help: false,
      version: false,
      resume: true,
      overrides: { model: 'haiku', fullscreen: true, instructions: 'Be brief.' },
    });
    expect(parseCli(['-h', '-v'])).toMatchObject({ help: true, version: true });
  });

  test('throws on unknown flags and missing values', () => {
    expect(() => parseCli(['--nope'])).toThrow();
    expect(() => parseCli(['--model'])).toThrow();
  });
});

describe('parseConfig with flags', () => {
  test('flags override env vars and file values', () => {
    expect(
      parseConfig(
        { LEAFFOCUS_MODEL: 'haiku', LEAFFOCUS_FULLSCREEN: 'false' },
        { model: 'sonnet', instructions: 'File.' },
        { model: 'opus', fullscreen: true, instructions: 'Flag.' }
      )
    ).toEqual({ model: 'opus', fullscreen: true, instructions: 'Flag.' });
  });

  test('unset flags fall through', () => {
    expect(parseConfig({ LEAFFOCUS_MODEL: 'haiku' }, {}, { model: undefined })).toMatchObject({ model: 'haiku' });
  });
});
