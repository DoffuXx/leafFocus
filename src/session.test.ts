import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { listSessions, newSessionFile } from './session';
import { ROOT_ID, addParagraph, createEmptyTree, saveTree } from './tree';

const tmpDir = `${import.meta.dir}/.session.test.tmp`;

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('newSessionFile', () => {
  test('creates the dir and returns a unique .json path inside it', () => {
    const a = newSessionFile(tmpDir);
    const b = newSessionFile(tmpDir);

    expect(existsSync(tmpDir)).toBe(true);
    expect(dirname(a)).toBe(tmpDir);
    expect(a).toEndWith('.json');
    expect(a).not.toBe(b);
  });
});

describe('listSessions', () => {
  /** Saves a session whose first question is `question` (none if null), with its mtime set to `mtime` (seconds). */
  const saveSession = (question: string | null, mtime: number): string => {
    const file = newSessionFile(tmpDir);
    const tree = createEmptyTree();
    if (question !== null) addParagraph(tree, ROOT_ID, null, question, { paragraph: 'p', segments: ['p'] });
    saveTree(file, tree);
    utimesSync(file, mtime, mtime);
    return file;
  };

  test('returns an empty list when the dir does not exist', () => {
    expect(listSessions(tmpDir)).toEqual([]);
  });

  test('lists sessions newest first, titled by their first question, with leaf counts', () => {
    const older = saveSession('first question', 1_000);
    const newer = saveSession('second question', 2_000);

    expect(listSessions(tmpDir).map(({ file, title, leafCount }) => ({ file, title, leafCount }))).toEqual([
      { file: newer, title: 'second question', leafCount: 1 },
      { file: older, title: 'first question', leafCount: 1 },
    ]);
  });

  test('skips sessions with no question asked', () => {
    saveSession(null, 1_000);

    expect(listSessions(tmpDir)).toEqual([]);
  });

  test("falls back to '(untitled)' for an empty first question", () => {
    saveSession('', 1_000);

    expect(listSessions(tmpDir)[0]?.title).toBe('(untitled)');
  });

  test('skips unreadable or non-tree session files instead of failing the whole list', () => {
    const good = saveSession('good question', 1_000);
    writeFileSync(newSessionFile(tmpDir), '{ not json');
    writeFileSync(newSessionFile(tmpDir), '{}');
    writeFileSync(newSessionFile(tmpDir), 'null');

    expect(listSessions(tmpDir).map((s) => s.file)).toEqual([good]);
  });
});
