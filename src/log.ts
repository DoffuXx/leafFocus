import { appendFileSync } from 'node:fs';

export const LOG_FILE = '.segment-tree.log';

/** Fields shared by every event of one `claude` call; `requestId` ties its lines together. */
interface BaseLogEvent {
  requestId: string;
  question: string;
}

/** One logged event, discriminated by `event`. */
export type LogEvent =
  | (BaseLogEvent & { event: 'request'; prompt: string; model: string | undefined })
  | (BaseLogEvent & { event: 'response'; stdout: string; segmentCount: number; durationMs: number })
  | (BaseLogEvent & { event: 'error'; error: string; durationMs: number });

export type LogEntry = LogEvent & { timestamp: string };

/** JSON-lines formatting, split out so it's testable without touching the filesystem. */
export function formatLogLine(entry: LogEvent & { timestamp?: string }): string {
  const full: LogEntry = { ...entry, timestamp: entry.timestamp ?? new Date().toISOString() };
  return `${JSON.stringify(full)}\n`;
}

/**
 * Appends one JSON line. Best-effort: a failed write (read-only dir, disk full) is swallowed so
 * logging can never turn a successful call into an error.
 */
export function appendLog(entry: LogEvent, filePath: string = LOG_FILE): void {
  try {
    appendFileSync(filePath, formatLogLine(entry), 'utf-8');
  } catch {
    // Intentionally ignored — the log is a debugging aid, not app state.
  }
}
