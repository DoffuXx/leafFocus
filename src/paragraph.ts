export interface ParagraphSpan {
  text: string;
  /** Index into the segments array this span highlights, or null for plain text. */
  segmentIndex: number | null;
}

/**
 * Splits a paragraph into plain/segment spans for rendering, matching each segment (in order)
 * at its first occurrence at or after the previous match. Segments not found are skipped.
 */
export function splitParagraph(paragraph: string, segments: string[]): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  let cursor = 0;

  for (const [i, segment] of segments.entries()) {
    const idx = paragraph.indexOf(segment, cursor);
    if (idx === -1) continue;
    if (idx > cursor) spans.push({ text: paragraph.slice(cursor, idx), segmentIndex: null });
    spans.push({ text: segment, segmentIndex: i });
    cursor = idx + segment.length;
  }
  if (cursor < paragraph.length) spans.push({ text: paragraph.slice(cursor), segmentIndex: null });

  return spans;
}
