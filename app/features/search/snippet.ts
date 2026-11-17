/**
 * The snippet of a search result (SearchSnippet.kt): the text of the step the query was found
 * in, cut around the first word that matched, with the matches marked.
 */

export const SNIPPET_MAX_LENGTH = 90;
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 64;

/** The words of a query, lowercased, as the backend's full-text search splits them (FtsQuery.kt). */
export function queryTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== "")
    .map((token) => token.slice(0, MAX_TOKEN_LENGTH).toLowerCase())
    .slice(0, MAX_TOKENS);
}

export type Range = { start: number; end: number };

/** Where a word of [query] occurs in [text], ignoring case, sorted, without overlaps. */
export function matchRanges(text: string, query: string): Range[] {
  const lower = text.toLowerCase();
  const ranges: Range[] = [];

  for (const token of queryTokens(query)) {
    let index = lower.indexOf(token);
    while (index >= 0) {
      ranges.push({ start: index, end: index + token.length });
      index = lower.indexOf(token, index + 1);
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/**
 * [text] cut to about [maxLength] characters around the first match, with an ellipsis on the
 * sides that were cut. The whole text when it is short.
 */
export function snippetWindow(text: string, query: string, maxLength = SNIPPET_MAX_LENGTH): string {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const hit = matchRanges(clean, query)[0]?.start ?? 0;
  const start = Math.max(hit - Math.floor(maxLength / 3), 0);
  const end = Math.min(start + maxLength, clean.length);
  const from = end === clean.length ? Math.max(end - maxLength, 0) : start;

  return (from > 0 ? "…" : "") + clean.slice(from, end).trim() + (end < clean.length ? "…" : "");
}

/** [text] as plain and matched pieces, to draw the matches in bold. */
export function highlightPieces(text: string, query: string): { text: string; match: boolean }[] {
  const pieces: { text: string; match: boolean }[] = [];
  let at = 0;
  for (const range of matchRanges(text, query)) {
    if (range.start > at) pieces.push({ text: text.slice(at, range.start), match: false });
    pieces.push({ text: text.slice(range.start, range.end), match: true });
    at = range.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), match: false });
  return pieces;
}
