import { describe, expect, it } from "vitest";

import { type SpanInfo, Spans } from "~/core/models";

import {
  adjustSpans,
  isFullyCovered,
  linkAt,
  removeSpan,
  setLink,
  sliceSpans,
  splitLines,
  toggleSpan,
} from "./spans";

const bold = (start: number, end: number): SpanInfo => ({
  start,
  end,
  span: Spans.BOLD,
  extra: null,
});
const link = (start: number, end: number, url = "https://writeopia.io"): SpanInfo => ({
  start,
  end,
  span: Spans.LINK,
  extra: url,
});

describe("adjustSpans", () => {
  it("extends a span when typing inside it", () => {
    expect(adjustSpans([bold(0, 5)], "hello", "helXlo", 4)).toEqual([bold(0, 6)]);
  });

  it("extends a span when typing at its end", () => {
    expect(adjustSpans([bold(0, 5)], "hello", "hello!", 6)).toEqual([bold(0, 6)]);
  });

  it("does not extend a link typed at its end", () => {
    expect(adjustSpans([link(0, 5)], "hello", "hello!", 6)).toEqual([link(0, 5)]);
  });

  it("moves a span when typing before it, even at its start", () => {
    expect(adjustSpans([bold(2, 5)], "hello", "XXhello", 2)).toEqual([bold(4, 7)]);
    expect(adjustSpans([bold(2, 5)], "hello", "heXllo", 3)).toEqual([bold(3, 6)]);
  });

  it("uses the caret to tell where a repeated character was typed", () => {
    // "a" typed at 0 of "aa" reads like "a" typed at 2 without the caret.
    expect(adjustSpans([bold(0, 2)], "aa", "aaa", 1)).toEqual([bold(1, 3)]);
    expect(adjustSpans([bold(0, 2)], "aa", "aaa", 3)).toEqual([bold(0, 3)]);
  });

  it("shrinks spans when their characters are deleted and drops empty ones", () => {
    expect(adjustSpans([bold(0, 5)], "hello", "heo", 2)).toEqual([bold(0, 3)]);
    expect(adjustSpans([bold(1, 3)], "hello", "hlo", 1)).toEqual([]);
  });

  it("keeps the spans after a deletion in place", () => {
    expect(adjustSpans([bold(4, 6)], "hello world", "hlo world", 1)).toEqual([bold(2, 4)]);
  });
});

describe("toggleSpan", () => {
  it("adds a span to a range without it", () => {
    expect(toggleSpan([], Spans.BOLD, 1, 3)).toEqual([bold(1, 3)]);
  });

  it("removes the span when the whole range has it, splitting it", () => {
    expect(toggleSpan([bold(0, 10)], Spans.BOLD, 3, 6)).toEqual([bold(0, 3), bold(6, 10)]);
  });

  it("merges with the spans of the same kind it touches", () => {
    expect(toggleSpan([bold(0, 3), bold(6, 8)], Spans.BOLD, 3, 6)).toEqual([bold(0, 8)]);
  });

  it("covers a range only partly formatted", () => {
    expect(toggleSpan([bold(0, 3)], Spans.BOLD, 2, 6)).toEqual([bold(0, 6)]);
  });

  it("replaces the other highlight colors on the range", () => {
    const yellow = { start: 0, end: 10, span: Spans.HIGHLIGHT_YELLOW, extra: null };
    expect(toggleSpan([yellow], Spans.HIGHLIGHT_GREEN, 2, 4)).toEqual([
      { ...yellow, end: 2 },
      { ...yellow, start: 4 },
      { start: 2, end: 4, span: Spans.HIGHLIGHT_GREEN, extra: null },
    ]);
  });

  it("does nothing on an empty range", () => {
    expect(toggleSpan([bold(0, 2)], Spans.BOLD, 1, 1)).toEqual([bold(0, 2)]);
  });
});

describe("span helpers", () => {
  it("tells whether a range is covered by spans of a kind", () => {
    expect(isFullyCovered([bold(0, 2), bold(2, 5)], Spans.BOLD, 1, 5)).toBe(true);
    expect(isFullyCovered([bold(0, 2), bold(3, 5)], Spans.BOLD, 1, 5)).toBe(false);
  });

  it("removes a span from a range", () => {
    expect(removeSpan([bold(0, 5)], Spans.BOLD, 1, 2)).toEqual([bold(0, 1), bold(2, 5)]);
  });

  it("sets and removes links, never merging them", () => {
    const spans = setLink([link(0, 3, "https://a.io")], "https://b.io", 3, 6);
    expect(spans).toEqual([link(0, 3, "https://a.io"), link(3, 6, "https://b.io")]);
    expect(setLink(spans, null, 0, 6)).toEqual([]);
    expect(linkAt(spans, 4)?.extra).toBe("https://b.io");
  });

  it("slices and splits spans with their text", () => {
    expect(sliceSpans([bold(2, 8)], 4, 10)).toEqual([bold(0, 4)]);
    expect(splitLines("ab\ncd", [bold(1, 4)])).toEqual([
      { text: "ab", spans: [bold(1, 2)] },
      { text: "cd", spans: [bold(0, 1)] },
    ]);
  });
});
