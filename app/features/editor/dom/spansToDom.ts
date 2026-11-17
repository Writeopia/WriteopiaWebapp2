import { type SpanInfo, Spans } from "~/core/models";

/**
 * A text and its spans as the HTML inside a block, and back. The HTML is built the same way
 * every time from the same input, so the editor can tell whether the page still shows the
 * state by comparing it with innerHTML, and leave the DOM (and the caret) alone when it does.
 */

/** A range drawn over the text without being part of it: a match of the search. */
export type Decoration = { start: number; end: number; active: boolean };

const FORMAT_ORDER = [
  Spans.BOLD,
  Spans.ITALIC,
  Spans.UNDERLINE,
  Spans.HIGHLIGHT_YELLOW,
  Spans.HIGHLIGHT_GREEN,
  Spans.HIGHLIGHT_RED,
  Spans.COMMENT,
] as const;

const TAGS: Record<(typeof FORMAT_ORDER)[number], { open: string; close: string }> = {
  [Spans.BOLD]: { open: "<strong>", close: "</strong>" },
  [Spans.ITALIC]: { open: "<em>", close: "</em>" },
  [Spans.UNDERLINE]: { open: "<u>", close: "</u>" },
  [Spans.HIGHLIGHT_YELLOW]: { open: '<span class="wr-hl-yellow">', close: "</span>" },
  [Spans.HIGHLIGHT_GREEN]: { open: '<span class="wr-hl-green">', close: "</span>" },
  [Spans.HIGHLIGHT_RED]: { open: '<span class="wr-hl-red">', close: "</span>" },
  [Spans.COMMENT]: { open: '<span class="wr-comment">', close: "</span>" },
};

/** As innerHTML writes text back, so the two compare. */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\u00a0/g, "&nbsp;");
}

/** Only web and mail addresses become a link that can be opened. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url, "https://invalid.invalid");
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function spansToHtml(
  text: string,
  spans: readonly SpanInfo[],
  decorations: readonly Decoration[] = [],
): string {
  const length = text.length;
  const clamp = (value: number) => Math.max(0, Math.min(length, value));
  const valid = spans.filter((info) => clamp(info.start) < clamp(info.end));
  const marks = decorations.filter((mark) => clamp(mark.start) < clamp(mark.end));

  const cuts = new Set([0, length]);
  for (const info of valid) cuts.add(clamp(info.start)).add(clamp(info.end));
  for (const mark of marks) cuts.add(clamp(mark.start)).add(clamp(mark.end));
  const points = [...cuts].sort((a, b) => a - b);

  let html = "";
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!;
    const end = points[index + 1]!;
    if (start === end) continue;

    const covers = (info: { start: number; end: number }) =>
      clamp(info.start) <= start && clamp(info.end) >= end;
    const active = new Set(valid.filter(covers).map((info) => info.span));
    const link = valid.find((info) => info.span === Spans.LINK && covers(info));
    const mark = marks.find(covers);

    let open = "";
    let close = "";
    if (link) {
      const href = safeHref(link.extra ?? "");
      open += href ? `<a href="${escapeAttribute(href)}" class="wr-link">` : '<a class="wr-link">';
      close = "</a>" + close;
    }
    if (mark) {
      open += mark.active ? '<mark class="wr-match wr-match-active">' : '<mark class="wr-match">';
      close = "</mark>" + close;
    }
    for (const format of FORMAT_ORDER) {
      if (active.has(format)) {
        open += TAGS[format].open;
        close = TAGS[format].close + close;
      }
    }
    html += open + escapeText(text.slice(start, end)) + close;
  }

  // A last empty line only shows with something after it.
  if (text.endsWith("\n")) html += "<br>";
  return html;
}

/** The text a block shows: line breaks are text, the trailing <br> is not. */
export function textFromDom(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\u00a0/g, " ");
}
