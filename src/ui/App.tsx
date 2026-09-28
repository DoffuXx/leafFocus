import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { ROOT_ID, addParagraph, countLeaves, getChildrenForSegment, loadTree, removeNode, saveTree } from '../tree.js';
import { getParagraph } from '../claude.js';
import { exportSession } from '../export.js';
import { splitParagraph } from '../paragraph.js';
import { renderLeafPlant, renderLeafTrail, type TrailPartKind } from '../trail.js';
import type { TreeData, TreeNode } from '../types.js';

type Mode = 'browsing' | 'loading' | 'error';

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

/** Trail colors: stem and past labels are dim, leaves green, where you are stands out. */
const TRAIL_STYLE: Record<TrailPartKind, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  stem: { dimColor: true },
  leaf: { color: 'green' },
  current: { color: 'cyan', bold: true },
  child: { color: 'green' },
};

export function leafCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'leaf' : 'leaves'}`;
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

  const currentNodeId = path[path.length - 1] as string;
  const currentNode = tree.nodes[currentNodeId];
  const segments = currentNode?.segments ?? [];
  const highlightedSegment = segments[segmentCursor] ?? null;
  const leafCounts = segments.map((s) => getChildrenForSegment(tree, currentNodeId, s).length);

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
    setMode('loading');
    try {
      const parentNode = tree.nodes[parentId];
      const context = parentId === ROOT_ID ? null : { paragraph: parentNode.paragraph, segment };
      const result = await getParagraph(context, question);

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
      setError(err instanceof Error ? err.message : String(err));
      setMode('error');
    }
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
    if (mode !== 'browsing') return;
    setNotice(null);

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

  const leafHere = currentNode?.children.length ?? 0;
  const leafTotal = countLeaves(tree);
  const plant = renderLeafPlant(leafTotal, columns);
  const trail = renderLeafTrail(tree, path, columns);

  const Header = () => (
    <Box flexDirection="column" marginBottom={1} width={columns}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          LeafFocus
        </Text>
        <Text dimColor>
          {leafHere > 0 ? `${leafCountLabel(leafHere)} here · ` : ''}
          {leafCountLabel(leafTotal)} total
        </Text>
      </Box>
      <Text color="green">{plant.slice(0, -1).join('\n')}</Text>
      <Text dimColor>{plant[plant.length - 1]}</Text>
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
        <Header />
        <Text>
          <Spinner /> Thinking…
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
      {currentNode?.question ? <Text dimColor>Q: {currentNode.question}</Text> : null}
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
          type + Enter ask generally · Backspace back (box empty) · Ctrl+R regenerate · Ctrl+D delete · Ctrl+E
          export · q quit (box empty)
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
