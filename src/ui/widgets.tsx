import { Box, Text } from 'ink';

/** A key and what it does, e.g. `['Ctrl+T', 'outline']`. */
export type KeyHint = readonly [key: string, label: string];

/** One wrapping line of key hints: keys stand out, labels stay dim. Falsy entries are skipped so callers can show hints conditionally. */
export function KeyHints({ hints }: { hints: ReadonlyArray<KeyHint | false | null | undefined> }) {
  const shown = hints.filter((h): h is KeyHint => Boolean(h));
  return (
    <Text wrap="wrap">
      {shown.map(([key, label], i) => (
        <Text key={key}>
          {i > 0 ? <Text dimColor> · </Text> : null}
          <Text bold color="cyan">
            {key}
          </Text>
          <Text dimColor> {label}</Text>
        </Text>
      ))}
    </Text>
  );
}

/** Bordered prompt with a block cursor; shows `placeholder` while empty. */
export function InputBox({ value, placeholder }: { value: string; placeholder: string }) {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text>
        <Text color="cyan">{'> '}</Text>
        {value}
        <Text inverse> </Text>
        {value ? null : <Text dimColor>{placeholder}</Text>}
      </Text>
    </Box>
  );
}
