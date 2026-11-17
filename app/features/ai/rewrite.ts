import { type StoryType, StoryTypes, type Tag, Tags } from "~/core/models";
import { hasTag, headingLevel, isTitle, newBlock, textOf } from "~/features/editor/state/blocks";
import { parseInline } from "~/features/editor/state/markdown";
import type { Block } from "~/features/editor/state/types";

/**
 * A rewrite of the document by the AI, for a command typed with nothing selected
 * (DocumentRewrite.kt). The region goes to the AI as Markdown, one paragraph per line, and comes
 * back whole, rewritten; [Rewrite.parse] turns the answer into blocks again.
 *
 * Blocks the AI cannot write (images, spreadsheets, drawings…) are not sent: a
 * `[[writeopia-block-N]]` line stands for each, and the block itself comes back untouched where
 * the answer leaves the line. The title is never part of the region. A long document is cut to
 * the paragraphs around the cursor that fit the limit; the rest stays as it is.
 */

/** The Markdown sent to the AI is at most this long. */
export const MARKDOWN_LIMIT = 20_000;

export type Rewrite = {
  /** The ids of the blocks of the region, in order. */
  ids: string[];
  markdown: string;
  /** The blocks the AI does not see, in their order. */
  keptInOrder: Block[];
  /** The answer, possibly still incomplete, as blocks; the kept blocks are the originals. */
  parse: (answer: string) => { blocks: Block[]; pending: Block[] };
};

const PLACEHOLDER = /^\[\[writeopia-block-(\d+)]]$/;
const CHECK_ITEM = /^(?:[-*]\s*)?\[([ xX]?)]\s?(.*)$/;
const DIVIDER = /^-{3,}$/;

/** The types the AI rewrites. Everything else is a kept block, which it does not see. */
const REWRITABLE: ReadonlySet<number> = new Set(
  (["TEXT", "CHECK_ITEM", "UNORDERED_LIST_ITEM", "CODE_BLOCK", "AI_ANSWER", "DIVIDER"] as const).map(
    (key) => StoryTypes[key].number,
  ),
);

function placeholder(number: number): string {
  return `[[writeopia-block-${number}]]`;
}

function markdownOf(block: Block): string[] {
  const text = textOf(block);
  if (!REWRITABLE.has(block.type.number)) return [placeholder(0)];
  if (block.type.number === StoryTypes.DIVIDER.number) return ["---"];
  if (block.type.number === StoryTypes.CODE_BLOCK.number || hasTag(block, Tags.CODE_BLOCK)) {
    return ["```", ...text.split("\n"), "```"];
  }
  if (block.type.number === StoryTypes.CHECK_ITEM.number) {
    return [`- [${block.checked ? "x" : " "}] ${text}`];
  }
  if (block.type.number === StoryTypes.UNORDERED_LIST_ITEM.number) return [`- ${text}`];
  const level = headingLevel(block);
  if (level) return [`${"#".repeat(level)} ${text}`];
  return [text.replace(/\n/g, " ")];
}

/**
 * The rewrite of [ordered] (the blocks in document order) around the block at [cursor], or null
 * when there is nothing to rewrite. The whole document but the title when it fits [limit], else
 * the paragraphs around the cursor that do.
 */
export function buildRewrite(
  ordered: readonly Block[],
  cursor: string | null,
  limit: number = MARKDOWN_LIMIT,
): Rewrite | null {
  const entries = ordered.filter((block) => !isTitle(block) && !block.ephemeral);
  if (entries.length === 0) return null;

  const lines = entries.map(markdownOf);
  const sizes = lines.map((each) => each.reduce((sum, line) => sum + line.length + 1, 0));

  let low = 0;
  let high = entries.length - 1;

  if (sizes.reduce((sum, size) => sum + size, 0) > limit) {
    const found =
      cursor === null ? -1 : entries.findIndex((block) => block.position >= cursor);
    const center = found >= 0 ? found : entries.length - 1;
    // A paragraph alone over the limit would reach the AI cut, and come back cut.
    if (sizes[center]! > limit) return null;
    low = center;
    high = center;
    let size = sizes[center]!;
    let growBefore = true;

    for (;;) {
      const before = low - 1;
      const after = high + 1;
      const canBefore = before >= 0 && size + sizes[before]! <= limit;
      const canAfter = after < entries.length && size + sizes[after]! <= limit;

      if (growBefore && canBefore) {
        low = before;
        size += sizes[before]!;
      } else if (canAfter) {
        high = after;
        size += sizes[after]!;
      } else if (canBefore) {
        low = before;
        size += sizes[before]!;
      } else {
        break;
      }
      growBefore = !growBefore;
    }
  }

  const region = entries.slice(low, high + 1);
  const kept = new Map<number, Block>();
  const markdown: string[] = [];
  region.forEach((block, index) => {
    if (REWRITABLE.has(block.type.number)) {
      markdown.push(...lines[low + index]!);
    } else {
      const number = kept.size + 1;
      kept.set(number, block);
      markdown.push(placeholder(number));
    }
  });

  return {
    ids: region.map((block) => block.id),
    markdown: markdown.join("\n"),
    keptInOrder: [...kept.values()],
    parse: (answer) => parseAnswer(answer, kept),
  };
}

function parseAnswer(answer: string, kept: ReadonlyMap<number, Block>) {
  const lines = answer.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  const blocks: Block[] = [];
  const used = new Set<number>();
  let code: string[] | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (code === null) {
        code = [];
      } else {
        blocks.push(newBlock(StoryTypes.CODE_BLOCK, { text: code.join("\n") }));
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }

    const match = PLACEHOLDER.exec(trimmed);
    if (match) {
      const number = Number(match[1]);
      const block = kept.get(number);
      // A block stands once in the document, whatever the answer repeats.
      if (block && !used.has(number)) {
        used.add(number);
        blocks.push(block);
      }
      continue;
    }

    blocks.push(parseLine(trimmed));
  }

  // A fence still open while the answer streams shows its code as it comes.
  if (code !== null) blocks.push(newBlock(StoryTypes.CODE_BLOCK, { text: code.join("\n") }));

  const pending = [...kept.entries()]
    .filter(([number]) => !used.has(number))
    .map(([, block]) => block);
  return { blocks, pending };
}

const HEADINGS: [string, Tag][] = [
  ["#### ", Tags.H4],
  ["### ", Tags.H3],
  ["## ", Tags.H2],
  ["# ", Tags.H1],
];

function parseLine(trimmed: string): Block {
  if (trimmed === "") return newBlock(StoryTypes.TEXT);
  if (DIVIDER.test(trimmed)) return newBlock(StoryTypes.DIVIDER, { text: null });

  for (const [prefix, tag] of HEADINGS) {
    if (trimmed.startsWith(prefix)) {
      return {
        ...inline(StoryTypes.TEXT, trimmed.slice(prefix.length).trim()),
        tags: [{ tag, position: 0 }],
      };
    }
  }

  const check = CHECK_ITEM.exec(trimmed);
  if (check) {
    return {
      ...inline(StoryTypes.CHECK_ITEM, check[2]!.trim()),
      checked: check[1]!.toLowerCase() === "x",
    };
  }
  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    return inline(StoryTypes.UNORDERED_LIST_ITEM, trimmed.slice(2).trim());
  }
  return inline(StoryTypes.TEXT, trimmed);
}

function inline(type: StoryType, text: string): Block {
  const parsed = parseInline(text);
  return newBlock(type, { text: parsed.text, spans: parsed.spans });
}
