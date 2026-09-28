import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ParagraphResult, TreeData, TreeNode } from './types.js';

export const ROOT_ID = 'root';

export function createEmptyTree(): TreeData {
  const root: TreeNode = {
    id: ROOT_ID,
    parentId: null,
    segment: null,
    question: '',
    paragraph: '',
    segments: [],
    children: [],
  };
  return { nodes: { [ROOT_ID]: root }, rootId: ROOT_ID };
}

/** Adds one paragraph node as a child of parentId, drilled down from `segment` (null for a fresh top-level question). */
export function addParagraph(
  tree: TreeData,
  parentId: string,
  segment: string | null,
  question: string,
  result: ParagraphResult
): string {
  const id = randomUUID();
  tree.nodes[id] = {
    id,
    parentId,
    segment,
    question,
    paragraph: result.paragraph,
    segments: result.segments,
    children: [],
    ...(result.usage ? { usage: result.usage } : {}),
  };
  tree.nodes[parentId].children.push(id);
  return id;
}

export function getChildren(tree: TreeData, nodeId: string): TreeNode[] {
  return tree.nodes[nodeId].children.map((id) => tree.nodes[id]);
}

/** All children of `nodeId` drilled down from `segment` (null for unanchored children), in creation order. */
export function getChildrenForSegment(tree: TreeData, nodeId: string, segment: string | null): TreeNode[] {
  return getChildren(tree, nodeId).filter((n) => n.segment === segment);
}

/** Removes `nodeId` and its whole subtree, unlinking it from its parent. Returns how many nodes were removed. */
export function removeNode(tree: TreeData, nodeId: string): number {
  const node = tree.nodes[nodeId];
  if (!node || nodeId === tree.rootId) return 0;

  if (node.parentId) {
    const siblings = tree.nodes[node.parentId].children;
    siblings.splice(siblings.indexOf(nodeId), 1);
  }
  let removed = 0;
  const drop = (id: string): void => {
    for (const childId of tree.nodes[id]?.children ?? []) drop(childId);
    delete tree.nodes[id];
    removed++;
  };
  drop(nodeId);
  return removed;
}

/** Number of leaves (every node except the root) in the tree. */
export function countLeaves(tree: TreeData): number {
  return Object.keys(tree.nodes).length - 1;
}

/** Leaves sharing `nodeId`'s parent and source segment (includes the node itself), in creation order. */
export function getSiblings(tree: TreeData, nodeId: string): TreeNode[] {
  const node = tree.nodes[nodeId];
  if (!node?.parentId) return [];
  return getChildrenForSegment(tree, node.parentId, node.segment);
}

/** Sum of recorded per-call cost across the tree, in USD. */
export function totalCost(tree: TreeData): number {
  return Object.values(tree.nodes).reduce((sum, n) => sum + (n.usage?.costUsd ?? 0), 0);
}

/** Nodes from (but excluding) root down to nodeId, root -> ... -> nodeId. */
export function getPath(tree: TreeData, nodeId: string): TreeNode[] {
  const path: TreeNode[] = [];
  let current: TreeNode | undefined = tree.nodes[nodeId];
  while (current && current.id !== tree.rootId) {
    path.unshift(current);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path;
}

export function loadTree(filePath: string): TreeData {
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as TreeData;
  }
  return createEmptyTree();
}

export function saveTree(filePath: string, tree: TreeData): void {
  writeFileSync(filePath, JSON.stringify(tree, null, 2), 'utf-8');
}
