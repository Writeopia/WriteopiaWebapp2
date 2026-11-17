import { type SpanInfo, Spans, type StoryStep, StoryTypes, type Tag, Tags } from "~/core/models";

import { headingLevel, newBlock } from "./blocks";
import type { Block } from "./types";

/**
 * Blocks as Markdown and back: what a copy puts in text/plain (DocumentToMarkdown.kt) and what
 * a paste of plain text becomes (the line commands, and InlineMarkdownParser.kt for the
 * inline formats).
 */

// ---------------------------------------------------------------------------------------------
// To Markdown

const MARKERS: [string, string][] = [
  [Spans.BOLD, "**"],
  [Spans.ITALIC, "*"],
];

/** The text with bold, italic and links written as Markdown. */
export function inlineMarkdown(text: string, spans: readonly SpanInfo[]): string {
  const opens = new Map<number, string[]>();
  const closes = new Map<number, string[]>();
  const add = (map: Map<number, string[]>, at: number, value: string) =>
    map.set(at, [...(map.get(at) ?? []), value]);

  for (const [span, marker] of MARKERS) {
    for (const info of spans.filter((s) => s.span === span && s.start < s.end)) {
      add(opens, info.start, marker);
      add(closes, info.end, marker);
    }
  }
  for (const info of spans.filter((s) => s.span === Spans.LINK && s.start < s.end && s.extra)) {
    add(opens, info.start, "[");
    add(closes, info.end, `](${info.extra})`);
  }

  let out = "";
  for (let index = 0; index <= text.length; index++) {
    out += [...(closes.get(index) ?? [])].reverse().join("");
    out += (opens.get(index) ?? []).join("");
    if (index < text.length) out += text[index];
  }
  return out;
}

function line(step: StoryStep): string | null {
  const text = inlineMarkdown(step.text ?? "", step.spans);
  const level = headingLevel(step);
  const heading = level ? `${"#".repeat(level)} ` : "";

  switch (step.type.number) {
    case StoryTypes.TITLE.number:
      return `# ${step.text ?? ""}`;
    case StoryTypes.TEXT.number:
      return heading + text;
    case StoryTypes.CHECK_ITEM.number:
      return `${step.checked ? "[x]" : "[]"} ${text}`;
    case StoryTypes.UNORDERED_LIST_ITEM.number:
      return `- ${text}`;
    case StoryTypes.CODE_BLOCK.number:
      return "```\n" + (step.text ?? "") + "\n```";
    case StoryTypes.DIVIDER.number:
      return "---";
    case StoryTypes.IMAGE.number:
      return step.url ? `![](${step.url})` : null;
    case StoryTypes.LINK_CARD.number: {
      const url = step.url ?? "";
      return `[${step.text?.trim() ? step.text : url}](${url})`;
    }
    case StoryTypes.DOCUMENT_LINK.number:
      return step.documentLink?.title ?? step.text ?? null;
    case StoryTypes.EQUATION.number:
      return step.text?.trim() ? `$$${step.text.trim()}$$` : null;
    case StoryTypes.DRAWING.number:
      return null;
    default:
      return step.text;
  }
}

export function toMarkdown(steps: readonly StoryStep[]): string {
  return steps
    .map(line)
    .filter((value): value is string => value !== null)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------
// From Markdown

const LINE_PREFIXES: {
  pattern: RegExp;
  block: (rest: string, match: RegExpMatchArray) => Block;
}[] = [
  { pattern: /^(#{1,4}) (.*)$/, block: (_, m) => heading(m[1]!.length, m[2]!) },
  {
    pattern: /^(?:[-*] )?\[( |x|X)?\] ?(.*)$/,
    block: (_, m) => withInline(StoryTypes.CHECK_ITEM, m[2]!, { checked: !!m[1]?.trim() }),
  },
  { pattern: /^[-*+] (.*)$/, block: (_, m) => withInline(StoryTypes.UNORDERED_LIST_ITEM, m[1]!) },
  {
    pattern: /^(?:-{3,}|\*{3,}|_{3,})$/,
    block: () => newBlock(StoryTypes.DIVIDER, { text: null }),
  },
  {
    pattern: /^!\[[^\]]*\]\((\S+?)\)$/,
    block: (_, m) => newBlock(StoryTypes.IMAGE, { text: null, url: m[1]! }),
  },
];

const HEADING_TAGS: Tag[] = [Tags.H1, Tags.H2, Tags.H3, Tags.H4];

function heading(level: number, text: string): Block {
  const block = withInline(StoryTypes.TEXT, text);
  return { ...block, tags: [{ tag: HEADING_TAGS[level - 1]!, position: 0 }] };
}

function withInline(
  type: (typeof StoryTypes)[keyof typeof StoryTypes],
  text: string,
  fields: Partial<Block> = {},
): Block {
  const parsed = parseInline(text);
  return newBlock(type, { text: parsed.text, spans: parsed.spans, ...fields });
}

/**
 * Blocks for a pasted text, one per line: headings, lists, checkboxes, dividers, images and
 * fenced code. Other lines, empty ones too, are paragraphs.
 */
export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length; index++) {
    const current = lines[index]!;

    if (current.trimStart().startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index]!.trimStart().startsWith("```")) {
        code.push(lines[index]!);
        index++;
      }
      blocks.push(newBlock(StoryTypes.CODE_BLOCK, { text: code.join("\n") }));
      continue;
    }

    const prefix = LINE_PREFIXES.map((entry) => ({
      entry,
      match: current.match(entry.pattern),
    })).find(({ match }) => match !== null);
    blocks.push(
      prefix ? prefix.entry.block(current, prefix.match!) : withInline(StoryTypes.TEXT, current),
    );
  }

  return blocks;
}

const INLINE =
  /\*\*(?!\*)(.+?)\*\*|(?<![*\w])\*(?![*\s])(.+?)(?<![*\s])\*(?!\*)|\[([^\]]+)\]\((\S+?)\)|(https?:\/\/[^\s)]+)/g;

/** Bold, italic, Markdown links and bare addresses of a line, as spans. */
export function parseInline(source: string): { text: string; spans: SpanInfo[] } {
  const spans: SpanInfo[] = [];
  let text = "";
  let last = 0;

  for (const match of source.matchAll(INLINE)) {
    text += source.slice(last, match.index);
    last = match.index + match[0].length;
    const start = text.length;

    if (match[1] !== undefined || match[2] !== undefined) {
      const inner = parseInline(match[1] ?? match[2]!);
      spans.push(
        ...inner.spans.map((info) => ({
          ...info,
          start: info.start + start,
          end: info.end + start,
        })),
      );
      text += inner.text;
      spans.push({
        start,
        end: text.length,
        span: match[1] !== undefined ? Spans.BOLD : Spans.ITALIC,
        extra: null,
      });
    } else if (match[3] !== undefined) {
      text += match[3];
      spans.push({ start, end: text.length, span: Spans.LINK, extra: match[4]! });
    } else {
      text += match[5]!;
      spans.push({ start, end: text.length, span: Spans.LINK, extra: match[5]! });
    }
  }

  text += source.slice(last);
  return { text, spans };
}
