import { appendFileSync } from 'node:fs';

export const LOG_FILE = '.segment-tree.log';

export interface LogEntry {
  timestamp: string;
  event: 'request' | 'response' | 'error';
  [key: string]: unknown;
}

/** JSON-lines formatting, split out so it's testable without touching the filesystem. */
export function formatLogLine(entry: Omit<LogEntry, 'timestamp'> & { timestamp?: string }): string {
  const full = { ...entry, timestamp: entry.timestamp ?? new Date().toISOString() };
  return `${JSON.stringify(full)}\n`;
}

export function appendLog(entry: Omit<LogEntry, 'timestamp'>, filePath: string = LOG_FILE): void {
  appendFileSync(filePath, formatLogLine(entry), 'utf-8');
}
