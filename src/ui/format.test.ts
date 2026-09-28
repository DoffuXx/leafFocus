import { describe, expect, test } from 'bun:test';
import { formatUsage, leafCountLabel, segmentColor } from './format';

describe('leafCountLabel', () => {
  test('singular vs plural', () => {
    expect(leafCountLabel(1)).toBe('1 leaf');
    expect(leafCountLabel(0)).toBe('0 leaves');
    expect(leafCountLabel(3)).toBe('3 leaves');
  });
});

describe('formatUsage', () => {
  test('seconds with one decimal, cost with four', () => {
    expect(formatUsage({ durationMs: 4210, costUsd: 0.00314 })).toBe('4.2s · $0.0031');
  });
});

describe('segmentColor', () => {
  test('none / one / several leaves', () => {
    expect(segmentColor(0)).toBe('cyan');
    expect(segmentColor(1)).toBe('green');
    expect(segmentColor(5)).toBe('yellow');
  });
});
