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
