import { type Span, type SpanInfo, Spans } from "~/core/models";

/**
 * The inline formats of a text (bold, links, highlights...) as offsets into it, kept attached
 * to the right characters while the text changes. Offsets are UTF-16 code units, the length
 * of a JavaScript and a Kotlin string alike. A port of SpansHandler of the Swift app, with
 * the expansion rule of the Kotlin SDK (SpanInfo.expandable).
 */

export const HIGHLIGHTS: readonly Span[] = [
  Spans.HIGHLIGHT_YELLOW,
  Spans.HIGHLIGHT_GREEN,
  Spans.HIGHLIGHT_RED,
];

function span(start: number, end: number, kind: string, extra: string | null = null): SpanInfo {
  return { start, end, span: kind, extra };
}

/** Text typed right at the end of a span joins it, except for links. */
function expandable(info: SpanInfo): boolean {
  return info.span !== Spans.LINK;
}

/**
 * The spans after [oldText] became [newText]. The edit is found as the part between the
 * common prefix and the common suffix. Text typed inside a span, or at the end of one that
 * expands, joins it; text typed at its start does not. Deleted characters shrink the spans
 * that covered them, and spans left empty are dropped.
 */
export function adjustSpans(
  spans: SpanInfo[],
  oldText: string,
  newText: string,
  /**
   * Where the caret is after the edit, when known. It tells where repeated characters were
   * typed: "a" typed before "a" or after it reads the same.
   */
  cursor?: number,
): SpanInfo[] {
  if (spans.length === 0 || oldText === newText) return spans;

  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  ) {
    prefix++;
  }
  if (cursor !== undefined) {
    prefix = Math.max(0, Math.min(prefix, cursor - Math.max(0, newText.length - oldText.length)));
  }

  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  // The edit replaced [prefix, oldEditEnd) of the old text with [prefix, newEditEnd).
  const oldEditEnd = oldText.length - suffix;
  const newEditEnd = newText.length - suffix;
  const delta = newText.length - oldText.length;
  const isInsertion = oldEditEnd === prefix;

  const mapStart = (index: number) => {
    if (index < prefix) return index;
    // Text typed right at the start of a span stays outside of it.
    if (index >= oldEditEnd) return index + delta;
    return prefix;
  };

  const mapEnd = (info: SpanInfo) => {
    const index = info.end;
    if (index < prefix) return index;
    if (index === prefix) return isInsertion && expandable(info) ? index + delta : index;
    if (index >= oldEditEnd) return index + delta;
    return newEditEnd;
  };

  return spans.flatMap((info) => {
    const start = mapStart(info.start);
    const end = mapEnd(info);
    return start < end ? [{ ...info, start, end }] : [];
  });
}

/** The spans of [start, end) of a text, moved to start at 0: the spans of a piece of it. */
export function sliceSpans(spans: SpanInfo[], start: number, end: number): SpanInfo[] {
  return spans.flatMap((info) => {
    const from = Math.max(info.start, start);
    const to = Math.min(info.end, end);
    return from < to ? [{ ...info, start: from - start, end: to - start }] : [];
  });
}

/** [spans] moved [offset] characters to the right. */
export function shiftSpans(spans: SpanInfo[], offset: number): SpanInfo[] {
  return offset === 0
    ? spans
    : spans.map((info) => ({ ...info, start: info.start + offset, end: info.end + offset }));
}

/** Splits a text at every line break, each line with the spans inside it. */
export function splitLines(text: string, spans: SpanInfo[]): { text: string; spans: SpanInfo[] }[] {
  let offset = 0;
  return text.split("\n").map((line) => {
    const lineSpans = sliceSpans(spans, offset, offset + line.length);
    offset += line.length + 1;
    return { text: line, spans: lineSpans };
  });
}

/** Whether every character of [start, end) has a span of [kind]. */
export function isFullyCovered(
  spans: SpanInfo[],
  kind: string,
  start: number,
  end: number,
): boolean {
  if (start >= end) return false;

  let covered = start;
  for (const info of spans.filter((s) => s.span === kind).sort((a, b) => a.start - b.start)) {
    if (info.start > covered) break;
    covered = Math.max(covered, info.end);
    if (covered >= end) return true;
  }
  return false;
}

/** Removes [kind] from [start, end), cutting the spans that go beyond the range. */
export function removeSpan(
  spans: SpanInfo[],
  kind: string,
  start: number,
  end: number,
): SpanInfo[] {
  if (start >= end) return spans;

  return spans.flatMap((info) => {
    if (info.span !== kind || info.end <= start || info.start >= end) return [info];
    const pieces: SpanInfo[] = [];
    if (info.start < start) pieces.push({ ...info, end: start });
    if (info.end > end) pieces.push({ ...info, start: end });
    return pieces;
  });
}

/**
 * The formatting buttons: when the whole range already has [kind] it is removed from the
 * range; otherwise the range gets it, merged with the spans of the same kind it touches. A
 * highlight color replaces the other colors on the range.
 */
export function toggleSpan(
  spans: SpanInfo[],
  kind: string,
  start: number,
  end: number,
): SpanInfo[] {
  if (start >= end) return spans;
  if (isFullyCovered(spans, kind, start, end)) return removeSpan(spans, kind, start, end);

  let others = spans.filter((info) => info.span !== kind);
  if ((HIGHLIGHTS as readonly string[]).includes(kind)) {
    for (const color of HIGHLIGHTS) {
      if (color !== kind) others = removeSpan(others, color, start, end);
    }
  }

  let mergedStart = start;
  let mergedEnd = end;
  const untouched: SpanInfo[] = [];
  for (const info of spans.filter((s) => s.span === kind)) {
    if (info.end >= start && info.start <= end) {
      mergedStart = Math.min(mergedStart, info.start);
      mergedEnd = Math.max(mergedEnd, info.end);
    } else {
      untouched.push(info);
    }
  }

  return [...others, ...untouched, span(mergedStart, mergedEnd, kind)];
}

/**
 * Links [start, end) to [url], replacing the links that were there; null removes them. Links
 * are not merged with their neighbours: they may point somewhere else.
 */
export function setLink(
  spans: SpanInfo[],
  url: string | null,
  start: number,
  end: number,
): SpanInfo[] {
  if (start >= end) return spans;
  const without = removeSpan(spans, Spans.LINK, start, end);
  return url === null ? without : [...without, span(start, end, Spans.LINK, url)];
}

/** The link under [offset] (inside it or at its end), if any. */
export function linkAt(spans: SpanInfo[], offset: number): SpanInfo | null {
  return (
    spans.find((info) => info.span === Spans.LINK && info.start <= offset && offset <= info.end) ??
    null
  );
}

/** Whether the whole text of a block of [length] characters has [kind]. */
export function coversAll(spans: SpanInfo[], kind: string, length: number): boolean {
  return isFullyCovered(spans, kind, 0, length);
}
