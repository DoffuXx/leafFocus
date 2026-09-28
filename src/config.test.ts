import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigFile, parseConfig } from './config';

describe('parseConfig', () => {
  test('defaults to CLI default model and inline (non-fullscreen) rendering', () => {
    expect(parseConfig({})).toEqual({ model: undefined, fullscreen: false, instructions: undefined });
  });

  test('reads model, fullscreen and instructions from LEAFFOCUS_* variables', () => {
    expect(
      parseConfig({ LEAFFOCUS_MODEL: ' haiku ', LEAFFOCUS_FULLSCREEN: 'TRUE', LEAFFOCUS_INSTRUCTIONS: 'Be brief.' })
    ).toEqual({ model: 'haiku', fullscreen: true, instructions: 'Be brief.' });
  });

  test('treats unrecognized fullscreen values and a blank model as unset', () => {
    expect(parseConfig({ LEAFFOCUS_MODEL: '  ', LEAFFOCUS_FULLSCREEN: 'nope' })).toEqual({
      model: undefined,
      fullscreen: false,
      instructions: undefined,
    });
  });
});

describe('parseConfig with a YAML config file', () => {
  test('uses file values when env is unset', () => {
    expect(parseConfig({}, { model: 'sonnet', fullscreen: true, instructions: 'Be brief.' })).toEqual({
      model: 'sonnet',
      fullscreen: true,
      instructions: 'Be brief.',
    });
  });

  test('env vars override file values', () => {
    expect(
      parseConfig({ LEAFFOCUS_MODEL: 'haiku', LEAFFOCUS_FULLSCREEN: 'false' }, { model: 'sonnet', fullscreen: true }),
    ).toEqual({ model: 'haiku', fullscreen: false, instructions: undefined });
  });
});

describe('loadConfigFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'leaffocus-config-'));
  const file = join(dir, 'config.yaml');

  test('returns {} when no config file exists', () => {
    expect(loadConfigFile([join(dir, 'missing.yaml')])).toEqual({});
  });

  test('reads the first existing file', () => {
    writeFileSync(file, 'model: haiku\nfullscreen: true\n');
    expect(loadConfigFile([join(dir, 'missing.yaml'), file])).toEqual({ model: 'haiku', fullscreen: true });
  });

  test('treats an empty file as no settings', () => {
    writeFileSync(file, '');
    expect(loadConfigFile([file])).toEqual({});
  });

  test('throws on a wrongly typed value', () => {
    writeFileSync(file, 'fullscreen: maybe\n');
    expect(() => loadConfigFile([file])).toThrow(/Invalid config file/);
  });
});
