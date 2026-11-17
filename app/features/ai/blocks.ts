import { StoryTypes } from "~/core/models";
import { textOf } from "~/features/editor/state/blocks";
import { parseMarkdown } from "~/features/editor/state/markdown";
import type { Block } from "~/features/editor/state/types";

/**
 * An answer of the AI as blocks: the Markdown parser of paste, without the blank lines the AI
 * puts between paragraphs. A code fence still open while the answer streams shows its code so
 * far.
 */
export function answerBlocks(markdown: string): Block[] {
  return parseMarkdown(markdown.trim()).filter(
    (block) => !(block.type.number === StoryTypes.TEXT.number && textOf(block).trim() === ""),
  );
}
