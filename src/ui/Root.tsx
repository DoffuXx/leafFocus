import { useState, type ReactNode } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import App, { leafCountLabel } from './App.js';
import { config } from '../config.js';
import { listSessions, newSessionFile, type SessionSummary } from '../session.js';

type Phase = 'picking' | 'running';

/** `resume: true` mirrors `claude -r` — show past sessions to pick from instead of starting fresh. */
export default function Root({ resume }: { resume: boolean }) {
  const [sessions] = useState<SessionSummary[]>(() => (resume ? listSessions() : []));
  const [phase, setPhase] = useState<Phase>(resume && sessions.length > 0 ? 'picking' : 'running');
  const [cursor, setCursor] = useState(0);
  const [sessionFile, setSessionFile] = useState<string | null>(() =>
    phase === 'running' ? newSessionFile() : null
  );
  const { rows } = useWindowSize();

  /** In fullscreen mode, stretch the UI to the terminal's full height (tracks resizes). */
  const frame = (content: ReactNode) =>
    config.fullscreen ? (
      <Box flexDirection="column" height={rows}>
        {content}
      </Box>
    ) : (
      content
    );

  useInput((input, key) => {
    if (phase !== 'picking') return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(sessions.length - 1, c + 1));
    } else if (key.return) {
      setSessionFile(sessions[cursor]?.file ?? newSessionFile());
      setPhase('running');
    } else if (key.escape || input === 'q') {
      setSessionFile(newSessionFile());
      setPhase('running');
    }
  });

  if (phase === 'picking') {
    return frame(
      <Box flexDirection="column">
        <Text bold>Resume a session — ↑/↓ + Enter to pick, Esc for a new one:</Text>
        {sessions.map((s, i) => (
          <Text key={s.file} color={i === cursor ? 'green' : undefined}>
            {i === cursor ? '> ' : '  '}
            {s.updatedAt.toLocaleString()} — {s.title} <Text dimColor>({leafCountLabel(s.leafCount)})</Text>
          </Text>
        ))}
      </Box>
    );
  }

  return frame(sessionFile ? <App treeFile={sessionFile} /> : null);
}
