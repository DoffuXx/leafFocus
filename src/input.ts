/**
 * Flattens a chunk of typed/pasted input to single-line text for the input box. Fast typing or a
 * paste can deliver several keys in one chunk (e.g. `"abc\r"`), and raw `\r`/`\n` in the buffer
 * garble the one-line box: line breaks and tabs become spaces, other control characters are dropped.
 */
export function toSingleLine(input: string): string {
  return input.replace(/\r\n|[\r\n\t]/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Text a keypress adds to an input buffer: `input` flattened by {@link toSingleLine}, or '' for Ctrl/Meta chords. */
export function typedText(input: string, key: { ctrl: boolean; meta: boolean }): string {
  return input && !key.ctrl && !key.meta ? toSingleLine(input) : '';
}
