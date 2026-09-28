import type { TreeData, TreeNode } from './types.js';

export interface OutlineEntry {
  node: TreeNode;
  /** 0 for top-level questions, +1 per drill-down. */
  depth: number;
}

/** Every leaf in depth-first (reading) order with its depth — the whole session as an indented outline. */
export function flattenTree(tree: TreeData): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const walk = (nodeId: string, depth: number): void => {
    for (const childId of tree.nodes[nodeId]?.children ?? []) {
      const node = tree.nodes[childId];
      if (!node) continue;
      entries.push({ node, depth });
      walk(childId, depth + 1);
    }
  };
  walk(tree.rootId, 0);
  return entries;
}

/** Case-insensitive match of `query` against each leaf's question, source segment and paragraph. Blank keeps all. */
export function filterOutline(entries: OutlineEntry[], query: string): OutlineEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(({ node }) =>
    [node.question, node.segment ?? '', node.paragraph].some((text) => text.toLowerCase().includes(q))
  );
}
