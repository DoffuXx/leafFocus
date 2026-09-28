import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import {
  ROOT_ID,
  addParagraph,
  countLeaves,
  getChildrenForSegment,
  getPath,
  getSiblings,
  loadTree,
  removeNode,
  saveTree,
  totalCost,
} from '../tree.js';
import { getParagraph } from '../claude.js';
import { exportSession } from '../export.js';
import { toSingleLine } from '../input.js';
import { filterOutline, flattenTree } from '../outline.js';
import { splitParagraph } from '../paragraph.js';
import { renderLeafTrail, type TrailPartKind } from '../trail.js';
import type { TreeData, TreeNode, Usage } from '../types.js';
import { InputBox, KeyHints } from './widgets.js';

type Mode = 'browsing' | 'loading' | 'error';

/** Max outline rows shown at once; the list scrolls with the cursor. */
const OUTLINE_WINDOW = 15;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const ASCII_LEAF = [
  '⠠⡄⠀⠀⠀⠀⠀⠀⠀⣀⣀⠀⠀⠀⠀⠀',
  '⠀⠈⢶⣤⣤⣴⣾⣿⣿⣿⣿⣿⣿⣶⣄⠀',
  '⠀⠀⠀⣷⣄⡀⢉⣛⣛⡛⠋⠁⠀⠉⠛⠃',
  '⠀⠀⠀⣹⡌⢏⠻⣿⣿⣿⣷⣦⡀⠀⠀⠀',
  '⠀⠀⠀⣿⣿⡌⣇⠙⢿⣿⣿⣿⣿⣆⠀⠀',
  '⠀⠀⠀⣿⣿⡇⣿⣷⣄⠈⠉⠛⠻⠿⣧⠀',
  '⠀⠀⠀⠘⣿⠁⣿⣿⣿⣧⠀⠀⠀⠀⠈⠳',
  '⠀⠀⠀⠀⠹⠀⢹⣿⣿⣿⣧⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⡄⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠙⢿⣿⣿⣇⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⡀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⡇⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠃⠀⠀⠀',
].join('\n');

/** Trail colors: stem dim, leaves on your path green, other leaves dim green, where you are stands out. */
const TRAIL_STYLE: Record<TrailPartKind, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  stem: { dimColor: true },
  leaf: { color: 'green' },
  current: { color: 'cyan', bold: true },
  other: { color: 'green', dimColor: true },
};

export function leafCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'leaf' : 'leaves'}`;
}

/** e.g. `4.2s · $0.0031` */
function formatUsage(usage: Usage): string {
  return `${(usage.durationMs / 1000).toFixed(1)}s · $${usage.costUsd.toFixed(4)}`;
}

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

/** Segment color by how many leaves already exist under it: none / one / several. */
function segmentColor(leafCount: number): string {
  if (leafCount === 0) return 'cyan';
  if (leafCount === 1) return 'green';
  return 'yellow';
}

export default function App({ treeFile }: { treeFile: string }) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const [tree, setTree] = useState<TreeData>(() => loadTree(treeFile));
  const [path, setPath] = useState<string[]>([ROOT_ID]);
  const [segmentCursor, setSegmentCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('browsing');
  const [focusMode, setFocusMode] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** One-line status message (e.g. export path), cleared on the next keypress. */
  const [notice, setNotice] = useState<string | null>(null);
  const [pickingChildren, setPickingChildren] = useState<TreeNode[] | null>(null);
  const [pickCursor, setPickCursor] = useState(0);
  /** True while waiting for y/n to delete the current leaf (Ctrl+D). */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Ctrl+T outline: filter text + selected row, or null when closed. */
  const [outline, setOutline] = useState<{ query: string; cursor: number } | null>(null);
  /** Question of the in-flight `claude` call, shown while loading. */
  const [pendingQuestion, setPendingQuestion] = useState('');
  /** Segments of the in-flight answer streamed so far (preview until the call completes). */
  const [streamedSegments, setStreamedSegments] = useState<string[]>([]);
  /** Aborts the in-flight `claude` call (Esc while loading). */
  const abortRef = useRef<AbortController | null>(null);

  const currentNodeId = path[path.length - 1] as string;
  const currentNode = tree.nodes[currentNodeId];
  const segments = currentNode?.segments ?? [];
  const highlightedSegment = segments[segmentCursor] ?? null;
  const leafCounts = segments.map((s) => getChildrenForSegment(tree, currentNodeId, s).length);
  const siblings = getSiblings(tree, currentNodeId);
  const outlineMatches = outline ? filterOutline(flattenTree(tree), outline.query) : [];

  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  useEffect(() => {
    const saveOnInterrupt = () => {
      if (countLeaves(treeRef.current) > 0) saveTree(treeFile, treeRef.current);
      process.exit(0);
    };
    process.on('SIGINT', saveOnInterrupt);
    return () => {
      process.off('SIGINT', saveOnInterrupt);
    };
  }, [treeFile]);
  // Ctrl+C unmounts the app mid-request: kill the `claude` child, or the process hangs until it finishes.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Asks `question` under `parentId` and opens the new leaf at `[...basePath, newId]`.
   * Buffer and focus are only cleared on success, so after an error the question can be retried.
   */
  async function submitQuestion(question: string, parentId: string, segment: string | null, basePath: string[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPendingQuestion(question);
    setStreamedSegments([]);
    setMode('loading');
    try {
      const parentNode = tree.nodes[parentId];
      const context = parentId === ROOT_ID ? null : { paragraph: parentNode.paragraph, segment };
      const result = await getParagraph(context, question, controller.signal, setStreamedSegments);

      const next: TreeData = structuredClone(tree);
      const newId = addParagraph(next, parentId, segment, question, result);
      setTree(next);
      saveTree(treeFile, next);

      setPath([...basePath, newId]);
      setSegmentCursor(0);
      setFocusMode(false);
      setBuffer('');
      setMode('browsing');
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice('Cancelled — your question is kept');
        setMode('browsing');
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setMode('error');
    } finally {
      abortRef.current = null;
    }
  }

  /** Opens `nodeId` with its full path from root (used by the outline jump and sibling switching). */
  function openNode(nodeId: string): void {
    setPath([ROOT_ID, ...getPath(tree, nodeId).map((n) => n.id)]);
    setSegmentCursor(0);
    setFocusMode(false);
  }

  /** Switches to the previous/next leaf asked from the same segment (e.g. regenerated answers), wrapping around. */
  function switchSibling(step: 1 | -1): void {
    if (siblings.length < 2) return;
    const index = siblings.findIndex((n) => n.id === currentNodeId);
    const next = siblings[(index + step + siblings.length) % siblings.length];
    if (next) openNode(next.id);
  }

  function goBack() {
    if (path.length <= 1) return;
    const leavingId = path[path.length - 1] as string;
    const leavingSegment = tree.nodes[leavingId]?.segment;
    setPath((p) => p.slice(0, -1));
    const parentId = path[path.length - 2] as string;
    const parentSegments = tree.nodes[parentId]?.segments ?? [];
    const restoredIndex = leavingSegment ? parentSegments.indexOf(leavingSegment) : -1;
    setSegmentCursor(restoredIndex >= 0 ? restoredIndex : 0);
  }

  /** Enters the single existing leaf for `segment`, or opens a picker when there are several. */
  function tryEnterChild(segment: string | null): void {
    const matches = getChildrenForSegment(tree, currentNodeId, segment);
    if (matches.length === 0) return;
    if (matches.length === 1) {
      setPath((p) => [...p, matches[0].id]);
      setSegmentCursor(0);
      setFocusMode(false);
      return;
    }
    setPickingChildren(matches);
    setPickCursor(0);
  }

  /** Re-asks the current leaf's question from its parent, adding a sibling leaf (the old one is kept). */
  function regenerate(): void {
    if (!currentNode || currentNodeId === ROOT_ID || !currentNode.parentId) return;
    void submitQuestion(currentNode.question, currentNode.parentId, currentNode.segment, path.slice(0, -1));
  }

  /** Deletes the current leaf and its subtree, then goes back up to its parent. */
  function deleteCurrent(): void {
    const next: TreeData = structuredClone(tree);
    const removed = removeNode(next, currentNodeId);
    goBack();
    setTree(next);
    saveTree(treeFile, next);
    setNotice(`Deleted ${leafCountLabel(removed)}`);
  }

  useInput((input, key) => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
      if (input === 'y') deleteCurrent();
      return;
    }
    if (mode === 'error') {
      if (input === 'q') exit();
      else if (key.escape || key.return) setMode('browsing');
      return;
    }
    if (mode === 'loading') {
      if (key.escape) abortRef.current?.abort();
      return;
    }
    setNotice(null);

    if (outline) {
      if (key.escape) {
        setOutline(null);
      } else if (key.upArrow) {
        setOutline({ ...outline, cursor: Math.max(0, outline.cursor - 1) });
      } else if (key.downArrow) {
        setOutline({ ...outline, cursor: Math.max(0, Math.min(outlineMatches.length - 1, outline.cursor + 1)) });
      } else if (key.return) {
        const chosen = outlineMatches[outline.cursor];
        if (chosen) openNode(chosen.node.id);
        setOutline(null);
      } else if (key.backspace || key.delete) {
        setOutline({ query: outline.query.slice(0, -1), cursor: 0 });
      } else if (input && !key.ctrl && !key.meta) {
        setOutline({ query: outline.query + toSingleLine(input), cursor: 0 });
      }
      return;
    }

    if (pickingChildren) {
      if (key.upArrow) {
        setPickCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow) {
        setPickCursor((c) => Math.min(pickingChildren.length - 1, c + 1));
      } else if (key.return) {
        const chosen = pickingChildren[pickCursor];
        if (chosen) {
          setPath((p) => [...p, chosen.id]);
          setSegmentCursor(0);
          setFocusMode(false);
        }
        setPickingChildren(null);
      } else if (key.escape) {
        setPickingChildren(null);
      }
      return;
    }

    if (key.ctrl && input === 'e') {
      setNotice(`Exported to ${exportSession(treeFile, tree)}`);
      return;
    }
    if (key.ctrl && input === 'r') {
      regenerate();
      return;
    }
    if (key.ctrl && input === 'd') {
      if (currentNodeId !== ROOT_ID) setConfirmingDelete(true);
      return;
    }
    if (key.ctrl && input === 't') {
      setOutline({ query: '', cursor: 0 });
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      switchSibling(key.rightArrow ? 1 : -1);
      return;
    }

    if (key.tab || key.upArrow || key.downArrow) {
      if (segments.length === 0) return;
      const forward = key.downArrow || (key.tab && !key.shift);
      setSegmentCursor((c) =>
        forward ? (c + 1) % segments.length : (c - 1 + segments.length) % segments.length
      );
      return;
    }

    if (focusMode) {
      if (key.return) {
        if (buffer.trim()) {
          void submitQuestion(buffer.trim(), currentNodeId, highlightedSegment, path);
        } else if (highlightedSegment) {
          tryEnterChild(highlightedSegment);
        }
        return;
      }
      if (key.escape || (key.backspace && buffer.length === 0)) {
        setFocusMode(false);
        setBuffer('');
        return;
      }
      if (key.backspace || key.delete) {
        setBuffer((b) => b.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setBuffer((b) => b + toSingleLine(input));
      }
      return;
    }

    // conversation view
    if (key.return) {
      if (buffer.trim()) {
        void submitQuestion(buffer.trim(), currentNodeId, null, path);
      } else if (highlightedSegment) {
        setFocusMode(true);
      } else {
        // no segment to focus (e.g. root) — fall straight through to any existing unanchored leaf
        tryEnterChild(null);
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (buffer.length > 0) {
        setBuffer((b) => b.slice(0, -1));
      } else {
        goBack();
      }
      return;
    }
    if (key.escape) {
      if (buffer.length > 0) {
        setBuffer('');
      } else {
        goBack();
      }
      return;
    }
    if (input === 'q' && buffer.length === 0) {
      if (countLeaves(tree) > 0) saveTree(treeFile, tree);
      exit();
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setBuffer((b) => b + toSingleLine(input));
    }
  });

  const isRoot = currentNodeId === ROOT_ID;
  const leafHere = currentNode?.children.length ?? 0;
  const leafTotal = countLeaves(tree);
  const sessionCost = totalCost(tree);
  const trail = renderLeafTrail(tree, path, columns);

  const header = (
    <Box flexDirection="column" marginBottom={1} width={columns}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          leafFocus
        </Text>
        <Text dimColor>
          {leafHere > 0 ? `${leafCountLabel(leafHere)} here · ` : ''}
          {leafCountLabel(leafTotal)} total
          {sessionCost > 0 ? ` · $${sessionCost.toFixed(4)} session` : ''}
        </Text>
      </Box>
      {trail.map((line, i) => (
        <Text key={i}>
          {line.map((part, j) => (
            <Text key={j} {...TRAIL_STYLE[part.kind]}>
              {part.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );

  if (mode === 'loading') {
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor wrap="truncate-end">
          Q: {pendingQuestion}
        </Text>
        {streamedSegments.length > 0 ? (
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text>
              {streamedSegments.map((s, i) => (
                <Text key={i}>
                  {i > 0 ? ' ' : ''}
                  <Text underline color={segmentColor(0)}>
                    {s}
                  </Text>
                </Text>
              ))}
            </Text>
          </Box>
        ) : null}
        <Text>
          <Spinner /> {streamedSegments.length > 0 ? `Writing… (${streamedSegments.length} segments)` : 'Thinking…'}
        </Text>
        <KeyHints hints={[['Esc', 'cancel']]} />
      </Box>
    );
  }

  if (mode === 'error') {
    return (
      <Box flexDirection="column">
        {header}
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <KeyHints hints={[['Esc/Enter', 'back (your question is kept)'], ['q', 'quit']]} />
      </Box>
    );
  }

  if (confirmingDelete) {
    const subtreeSize = currentNode ? removeNode(structuredClone(tree), currentNodeId) : 0;
    return (
      <Box flexDirection="column">
        {header}
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">Delete this leaf ({leafCountLabel(subtreeSize)} incl. everything under it)?</Text>
        </Box>
        <KeyHints hints={[['y', 'delete'], ['any other key', 'cancel']]} />
      </Box>
    );
  }

  if (outline) {
    const start = Math.max(0, Math.min(outline.cursor - Math.floor(OUTLINE_WINDOW / 2), outlineMatches.length - OUTLINE_WINDOW));
    const visible = outlineMatches.slice(start, start + OUTLINE_WINDOW);
    return (
      <Box flexDirection="column">
        {header}
        <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
          <Text bold color="magenta">
            Outline <Text dimColor>({outlineMatches.length}/{leafTotal})</Text>
          </Text>
          <Text>
            <Text color="magenta">{'/ '}</Text>
            {outline.query}
            <Text inverse> </Text>
            {outline.query ? null : <Text dimColor>type to filter</Text>}
          </Text>
          {visible.map(({ node, depth }, i) => {
            const selected = start + i === outline.cursor;
            return (
              <Text key={node.id} color={selected ? 'green' : undefined} wrap="truncate-end">
                {selected ? '> ' : '  '}
                {'  '.repeat(depth)}
                {node.segment ? <Text dimColor>[{node.segment}] </Text> : null}
                {node.question}
              </Text>
            );
          })}
          {outlineMatches.length === 0 ? <Text dimColor>(no matching leaves)</Text> : null}
        </Box>
        <KeyHints hints={[['↑/↓', 'select'], ['Enter', 'jump'], ['Esc', 'close']]} />
      </Box>
    );
  }

  if (pickingChildren) {
    return (
      <Box flexDirection="column">
        {header}
        <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
          <Text bold color="yellow">
            {pickingChildren.length} leaves on this segment — pick one
          </Text>
          {pickingChildren.map((n, i) => (
            <Text key={n.id} color={i === pickCursor ? 'green' : undefined} wrap="truncate-end">
              {i === pickCursor ? '> ' : '  '}
              {n.question}
            </Text>
          ))}
        </Box>
        <KeyHints hints={[['↑/↓', 'select'], ['Enter', 'open'], ['Esc', 'cancel']]} />
      </Box>
    );
  }

  if (focusMode && highlightedSegment) {
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor>
          Segment {segmentCursor + 1}/{segments.length}
          {leafCounts[segmentCursor] ? ` · ${leafCountLabel(leafCounts[segmentCursor] ?? 0)}` : ''}
        </Text>
        <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold color="cyan">
            {highlightedSegment}
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <InputBox value={buffer} placeholder="Ask about this segment…" />
          <KeyHints
            hints={[
              ['Tab/↑↓', 'retarget'],
              ['Enter', buffer.trim() ? 'ask' : 'open leaf'],
              ['Esc', 'back'],
            ]}
          />
        </Box>
      </Box>
    );
  }

  const spans = splitParagraph(currentNode?.paragraph ?? '', segments);

  return (
    <Box flexDirection="column">
      {header}
      {currentNode?.question ? (
        <Text dimColor>
          Q: {currentNode.question}
          {siblings.length > 1
            ? ` · answer ${siblings.findIndex((n) => n.id === currentNodeId) + 1}/${siblings.length} (←/→)`
            : ''}
          {currentNode.usage ? ` · ${formatUsage(currentNode.usage)}` : ''}
        </Text>
      ) : null}
      {currentNode?.paragraph ? (
        <Box borderStyle="round" paddingX={1}>
          <Text>
            {spans.map((s, i) => (
              <Text
                key={i}
                underline={s.segmentIndex !== null}
                color={s.segmentIndex !== null ? segmentColor(leafCounts[s.segmentIndex] ?? 0) : undefined}
                inverse={s.segmentIndex === segmentCursor}
              >
                {s.text}
              </Text>
            ))}
          </Text>
        </Box>
      ) : (
        <Box borderStyle="round" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text color="green">{ASCII_LEAF}</Text>
          <Text dimColor>(nothing here yet — type your question below)</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        {notice ? <Text color="green">✓ {notice}</Text> : null}
        <InputBox value={buffer} placeholder={currentNode?.paragraph ? 'Ask a follow-up…' : 'Ask a question…'} />
        <KeyHints
          hints={[
            segments.length > 0 && ['Tab/↑↓', 'segment'],
            segments.length > 0 && ['Enter', 'focus'],
            (buffer.length > 0 || path.length > 1) && ['Esc', buffer ? 'clear' : 'back'],
            siblings.length > 1 && ['←/→', 'other answers'],
            ['Ctrl+T', 'outline'],
            !isRoot && ['Ctrl+R', 'regenerate'],
            !isRoot && ['Ctrl+D', 'delete'],
            ['Ctrl+E', 'export'],
            !buffer && ['q', 'quit'],
          ]}
        />
        {segments.length > 0 ? (
          <Text dimColor>
            <Text color={segmentColor(0)}>■</Text> new <Text color={segmentColor(1)}>■</Text> 1 leaf{' '}
            <Text color={segmentColor(2)}>■</Text> several
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
