import type { Usage } from '../types.js';

/** e.g. `1 leaf`, `3 leaves` */
export function leafCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'leaf' : 'leaves'}`;
}

/** e.g. `4.2s · $0.0031` */
export function formatUsage(usage: Usage): string {
  return `${(usage.durationMs / 1000).toFixed(1)}s · $${usage.costUsd.toFixed(4)}`;
}

/** Segment color by how many leaves already exist under it: none / one / several. */
export function segmentColor(leafCount: number): string {
  if (leafCount === 0) return 'cyan';
  if (leafCount === 1) return 'green';
  return 'yellow';
}
