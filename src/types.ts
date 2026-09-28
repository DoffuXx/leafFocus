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
  /** What the call that produced this paragraph cost. Absent on root and on sessions saved before usage tracking. */
  usage?: Usage;
}

export interface TreeData {
  nodes: Record<string, TreeNode>;
  rootId: string;
}

/** Per-call usage reported by the `claude` CLI's result event. */
export interface Usage {
  durationMs: number;
  costUsd: number;
}

export interface ParagraphResult {
  paragraph: string;
  segments: string[];
  /** Absent when the CLI didn't report it. */
  usage?: Usage;
}
