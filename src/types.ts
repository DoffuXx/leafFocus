export interface TreeNode {
  id: string;
  parentId: string | null;
  /** The segment (verbatim substring of the parent's paragraph) this node was drilled down from. Null for root and for a fresh top-level question. */
  segment: string | null;
  /** The question that produced this node's paragraph. */
  question: string;
  paragraph: string;
  /** Consecutive verbatim chunks of `paragraph`, in reading order, partitioning it by meaning/context. */
  segments: string[];
  children: string[];
}

export interface TreeData {
  nodes: Record<string, TreeNode>;
  rootId: string;
}

export interface ParagraphResult {
  paragraph: string;
  segments: string[];
}
