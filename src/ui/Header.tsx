import { Box, Text } from 'ink';
import { countLeaves, totalCost } from '../tree.js';
import { renderLeafTrail, type TrailPartKind } from '../trail.js';
import type { TreeData } from '../types.js';
import { leafCountLabel } from './format.js';

/** Trail colors: stem and past labels are dim, leaves green, where you are stands out. */
const TRAIL_STYLE: Record<TrailPartKind, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  stem: { dimColor: true },
  leaf: { color: 'green' },
  current: { color: 'cyan', bold: true },
  child: { color: 'green' },
};

/** Title + leaf/cost stats, then the leaf trail from root to the current node (`path`). */
export function Header({ tree, path, columns }: { tree: TreeData; path: string[]; columns: number }) {
  const leafHere = tree.nodes[path[path.length - 1] as string]?.children.length ?? 0;
  const sessionCost = totalCost(tree);
  return (
    <Box flexDirection="column" marginBottom={1} width={columns}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          leafFocus
        </Text>
        <Text dimColor>
          {leafHere > 0 ? `${leafCountLabel(leafHere)} here · ` : ''}
          {leafCountLabel(countLeaves(tree))} total
          {sessionCost > 0 ? ` · $${sessionCost.toFixed(4)} session` : ''}
        </Text>
      </Box>
      {renderLeafTrail(tree, path, columns).map((line, i) => (
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
}
