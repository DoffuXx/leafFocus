import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigFile, parseConfig } from './config';

describe('parseConfig', () => {
  test('defaults to CLI default model and inline (non-fullscreen) rendering', () => {
    expect(parseConfig({})).toEqual({ model: undefined, fullscreen: false });
  });

  test('reads model and fullscreen from LEAFFOCUS_* variables', () => {
    expect(parseConfig({ LEAFFOCUS_MODEL: ' haiku ', LEAFFOCUS_FULLSCREEN: 'TRUE' })).toEqual({
      model: 'haiku',
      fullscreen: true,
    });
  });

  test('treats unrecognized fullscreen values and a blank model as unset', () => {
    expect(parseConfig({ LEAFFOCUS_MODEL: '  ', LEAFFOCUS_FULLSCREEN: 'nope' })).toEqual({
      model: undefined,
      fullscreen: false,
    });
  });
});

describe('parseConfig with a YAML config file', () => {
  test('uses file values when env is unset', () => {
    expect(parseConfig({}, { model: 'sonnet', fullscreen: true })).toEqual({ model: 'sonnet', fullscreen: true });
  });

  test('env vars override file values', () => {
    expect(
      parseConfig({ LEAFFOCUS_MODEL: 'haiku', LEAFFOCUS_FULLSCREEN: 'false' }, { model: 'sonnet', fullscreen: true }),
    ).toEqual({ model: 'haiku', fullscreen: false });
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
