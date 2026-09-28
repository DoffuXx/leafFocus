import { describe, expect, test } from 'bun:test';
import { parseConfig } from './config';

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
