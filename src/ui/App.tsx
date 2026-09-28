import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
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
import { filterOutline, flattenTree } from '../outline.js';
import { splitParagraph } from '../paragraph.js';
import type { TreeData, TreeNode, Usage } from '../types.js';

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

  /**
   * Asks `question` under `parentId` and opens the new leaf at `[...basePath, newId]`.
   * Buffer and focus are only cleared on success, so after an error the question can be retried.
   */
  async function submitQuestion(question: string, parentId: string, segment: string | null, basePath: string[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setMode('loading');
    try {
      const parentNode = tree.nodes[parentId];
      const context = parentId === ROOT_ID ? null : { paragraph: parentNode.paragraph, segment };
      const result = await getParagraph(context, question, controller.signal);

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
        setOutline({ query: outline.query + input, cursor: 0 });
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
        setBuffer((b) => b + input);
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
      setBuffer((b) => b + input);
    }
  });

  const breadcrumbLabel = (id: string): string => {
    if (id === ROOT_ID) return 'root';
    const node = tree.nodes[id];
    if (!node) return '?';
    return node.segment ?? node.question.slice(0, 24);
  };
  const breadcrumb = path.map(breadcrumbLabel).join(' > ');
  const leafHere = currentNode?.children.length ?? 0;
  const leafTotal = countLeaves(tree);
  const sessionCost = totalCost(tree);

  const Header = () => (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        LeafFocus
      </Text>
      <Text dimColor>
        {breadcrumb}
        {leafHere > 0 ? ` · ${leafCountLabel(leafHere)} here` : ''}
        {leafTotal > 0 ? ` · ${leafCountLabel(leafTotal)} total` : ''}
        {sessionCost > 0 ? ` · $${sessionCost.toFixed(4)} session` : ''}
      </Text>
    </Box>
  );

  if (mode === 'loading') {
    return (
      <Box flexDirection="column">
        <Header />
        <Text>
          <Spinner /> Thinking… <Text dimColor>(Esc to cancel)</Text>
        </Text>
      </Box>
    );
  }

  if (mode === 'error') {
    return (
      <Box flexDirection="column">
        <Header />
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <Text dimColor>Esc/Enter to go back (your question is kept) · q to quit.</Text>
      </Box>
    );
  }

  if (confirmingDelete) {
    const subtreeSize = currentNode ? removeNode(structuredClone(tree), currentNodeId) : 0;
    return (
      <Box flexDirection="column">
        <Header />
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">
            Delete this leaf ({leafCountLabel(subtreeSize)} incl. everything under it)? y to confirm, any other key to
            cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (outline) {
    const start = Math.max(0, Math.min(outline.cursor - Math.floor(OUTLINE_WINDOW / 2), outlineMatches.length - OUTLINE_WINDOW));
    const visible = outlineMatches.slice(start, start + OUTLINE_WINDOW);
    return (
      <Box flexDirection="column">
        <Header />
        <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
          <Text bold>
            Outline — type to filter · ↑/↓ + Enter jump · Esc close ({outlineMatches.length}/{leafTotal})
          </Text>
          <Text>
            {'/ '}
            {outline.query}
            <Text inverse> </Text>
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
      </Box>
    );
  }

  if (pickingChildren) {
    return (
      <Box flexDirection="column">
        <Header />
        <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
          <Text bold>Multiple leaves here — pick one (↑/↓ + Enter, Esc to cancel):</Text>
          {pickingChildren.map((n, i) => (
            <Text key={n.id} color={i === pickCursor ? 'green' : undefined}>
              {i === pickCursor ? '> ' : '  '}
              {n.question.slice(0, 60)}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (focusMode && highlightedSegment) {
    return (
      <Box flexDirection="column">
        <Header />
        <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold color="cyan">
            {highlightedSegment}
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Tab/↑↓ retarget segment · type + Enter ask about it · Esc back to conversation</Text>
          <Box borderStyle="round" paddingX={1}>
            <Text>
              {'> '}
              {buffer}
              <Text inverse> </Text>
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  const spans = splitParagraph(currentNode?.paragraph ?? '', segments);

  return (
    <Box flexDirection="column">
      <Header />
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
        <Text dimColor>
          Tab/↑↓ cycle segment (cyan=new, green=1 leaf, yellow=multiple) · Enter focuses/reopens ·
          type + Enter ask generally · Backspace back (box empty) · ←/→ other answers · Ctrl+T outline · Ctrl+R
          regenerate · Ctrl+D delete · Ctrl+E export · q quit (box empty)
        </Text>
        {notice ? <Text color="green">{notice}</Text> : null}
        <Box borderStyle="round" paddingX={1}>
          <Text>
            {'> '}
            {buffer}
            <Text inverse> </Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
