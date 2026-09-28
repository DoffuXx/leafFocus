import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { ROOT_ID, addParagraph, getChildrenForSegment, loadTree, saveTree } from '../tree.js';
import { getParagraph } from '../claude.js';
import { splitParagraph } from '../paragraph.js';
import { renderLeafTrail, type TrailPartKind } from '../trail.js';
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

/** Compact leaf drawn at the left of the header, beside the trail. */
const LEAF_BANNER = [
  '      .--.  ',
  '    .\'  _/| ',
  '   /  _/  | ',
  '  | _/   /  ',
  '  |/  _.\'   ',
  '  /--\'      ',
];
const BANNER_WIDTH = Math.max(...LEAF_BANNER.map((l) => l.length));

/** Trail line color: where you came from is dim, where you are stands out, what's below is green. */
const TRAIL_STYLE: Record<TrailPartKind, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  path: { dimColor: true },
  current: { color: 'cyan', bold: true },
  child: { color: 'green' },
};

function leafCountLabel(count: number): string {
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
  const [pickingChildren, setPickingChildren] = useState<TreeNode[] | null>(null);
  const [pickCursor, setPickCursor] = useState(0);

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
      if (Object.keys(treeRef.current.nodes).length > 1) saveTree(treeFile, treeRef.current);
      process.exit(0);
    };
    process.on('SIGINT', saveOnInterrupt);
    return () => {
      process.off('SIGINT', saveOnInterrupt);
    };
  }, [treeFile]);

  async function submitQuestion(question: string, parentId: string, segment: string | null) {
    setMode('loading');
    setFocusMode(false);
    setBuffer('');
    try {
      const parentNode = tree.nodes[parentId];
      const context = parentId === ROOT_ID ? null : { paragraph: parentNode.paragraph, segment };
      const result = await getParagraph(context, question);

      const next: TreeData = structuredClone(tree);
      const newId = addParagraph(next, parentId, segment, question, result);
      setTree(next);
      saveTree(treeFile, next);

      setPath((p) => [...p, newId]);
      setSegmentCursor(0);
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

  useInput((input, key) => {
    if (mode === 'error') {
      if (input === 'q') exit();
      return;
    }
    if (mode !== 'browsing') return;

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
          void submitQuestion(buffer.trim(), currentNodeId, highlightedSegment);
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
        void submitQuestion(buffer.trim(), currentNodeId, null);
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
      if (Object.keys(tree.nodes).length > 1) saveTree(treeFile, tree);
      exit();
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setBuffer((b) => b + input);
    }
  });

  const leafHere = currentNode?.children.length ?? 0;
  const leafTotal = Object.keys(tree.nodes).length - 1;
  // banner + 2-col gap take the left side; the trail gets the rest of the width
  const trail = renderLeafTrail(tree, path, columns - BANNER_WIDTH - 2);

  const Header = () => (
    <Box flexDirection="column" marginBottom={1} width={columns}>
      <Box>
        <Text color="green">{LEAF_BANNER.join('\n')}</Text>
        <Box flexDirection="column" marginLeft={2} flexGrow={1}>
          <Box justifyContent="space-between">
            <Text bold color="cyan">
              LeafFocus
            </Text>
            <Text dimColor>
              {leafHere > 0 ? `${leafCountLabel(leafHere)} here · ` : ''}
              {leafCountLabel(leafTotal)} total
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
      </Box>
      <Text dimColor>{'─'.repeat(columns)}</Text>
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
        <Text dimColor>Press q to quit.</Text>
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
          type + Enter ask generally · Backspace back (box empty) · q quit (box empty)
        </Text>
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
