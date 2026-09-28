import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

/** One row of a picker list: `> ` and green when selected, indented otherwise; truncated to one line. */
export function SelectRow({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <Text color={selected ? 'green' : undefined} wrap="truncate-end">
      {selected ? '> ' : '  '}
      {children}
    </Text>
  );
}

export function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}
