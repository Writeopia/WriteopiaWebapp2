import type { StoreApi } from "zustand";

import { type StoryType, StoryTypes, Tags } from "~/core/models";
import { isTitle, newBlock, textOf, withTag } from "~/features/editor/state/blocks";
import { find, ordered, titleText } from "~/features/editor/state/reducer";
import type { EditorStore } from "~/features/editor/state/store";
import type { Block } from "~/features/editor/state/types";

import { askAi, paragraphImage, streamGenerate, type WritingAction } from "./api";
import { answerBlocks } from "./blocks";
import { commandContext, suggest } from "./runner";

/**
 * What a writing suggestion does to the document (WriteopiaActionExecutor.kt). The blocks the
 * AI writes come as a suggestion right below the paragraph, except the section heading, which
 * goes above it, the TL;DR, under the title, and the conclusion, at the end. The title is
 * written into the title block itself.
 */

type Store = StoreApi<EditorStore>;

export type ActionContext = {
  store: Store;
  /** Writes a new document and links it where the caret is. */
  addPage: () => void;
  signal?: AbortSignal;
};

const MAX_LIST_ITEMS = 10;

/** How much of the document goes with the image request, so the picture fits the text. */
const IMAGE_CONTEXT_LIMIT = 20_000;

const CODE_PROMPT =
  "The paragraph below introduces or describes a piece of code, a command or a configuration " +
  "snippet. Write that snippet, complete and ready to use, in the language or tool the " +
  "paragraph implies (use the rest of the document to decide when the paragraph doesn't say). " +
  "Answer only with the code, inside one fenced code block, with no explanation before or " +
  "after it. Comments in the code should use the language of the text.";

const LIST_PROMPT =
  "The paragraph below introduces or enumerates several items. Write those items as a bullet " +
  "list, completing the list with the items the paragraph implies. Answer only with the " +
  'items, one per line, each starting with "- ". At most ten items, each a short phrase. Use ' +
  "the language of the text.";

const CHECKLIST_PROMPT =
  "The paragraph below describes tasks or steps to complete. Write them as a checklist, one " +
  'task per line, each starting with "- ", in the order they should be done. Answer only ' +
  "with the tasks. At most ten, each a short phrase starting with a verb. Use the language " +
  "of the text.";

const TLDR_PREFIX = "TLDR: ";

const TLDR_PROMPT =
  "Write a TL;DR for the following document: at most three sentences with its key points. " +
  'Answer only with the sentences: no title, no "TL;DR" label, no Markdown. Use the language ' +
  "of the text.";

const CONCLUSION_PROMPT =
  "Write a conclusion for the following document: one or two paragraphs that wrap up its " +
  "ideas. Answer only with the conclusion, without a title. Use the language of the text.";

const HEADING_PROMPT =
  "Write a short heading, of at most eight words, for the following paragraph. Answer only " +
  "with the heading: no quotes, no Markdown, no punctuation at the end. Use the language of " +
  "the text.";

const DOCUMENT_TITLE_PROMPT =
  "Write a title for the following document, of at most eight words. Answer only with the " +
  "title: no quotes, no Markdown, no punctuation at the end. Use the language of the text.";

/** The prompt of [instructions] about [text], as the other apps write it. */
export function promptAbout(instructions: string, text: string): string {
  return `${instructions}\n\`\`\`\n${text}\n\`\`\``;
}

/** The items of a list answer: `- a`, `* a`, `1. a`, `[ ] a`; other lines are dropped. */
export function markdownList(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => /^\s*(?:[-*•]|\d+[.)])\s*(?:\[[ xX]]\s*)?(.*)$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => !!item);
}

/**
 * The code of an answer: inside its first fence, without the fence and the language, or the
 * whole answer without one. A fence closes on a line of the same character, at least as long.
 */
export function markdownCode(markdown: string): string {
  const lines = markdown.split("\n");
  const opening = (line: string) => /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
  const openIndex = lines.findIndex((line) => opening(line) !== null);
  if (openIndex < 0) return markdown.replace(/^\n+/, "").trimEnd();

  const fence = opening(lines[openIndex]!)!;
  const body = lines.slice(openIndex + 1);
  const closes = (line: string) => {
    const trimmed = line.trim();
    return trimmed.length >= fence.length && [...trimmed].every((char) => char === fence[0]);
  };
  const closeIndex = body.findIndex(closes);
  return body
    .slice(0, closeIndex < 0 ? body.length : closeIndex)
    .join("\n")
    .replace(/^\n+/, "")
    .trimEnd();
}

/** One line of an answer, cleaned of the Markdown and quotes the AI tends to add. */
export function oneLine(answer: string): string {
  const line = answer.split("\n").find((each) => each.trim() !== "") ?? "";
  return line.replace(/^[#\s"*.]+|[#\s"*.]+$/g, "");
}

function paragraphOf(store: Store, blockId: string | null): Block | null {
  if (!blockId) return null;
  return find(store.getState().state, blockId)?.block ?? null;
}

function listOf(type: StoryType) {
  return (answer: string) =>
    markdownList(answer)
      .slice(0, MAX_LIST_ITEMS)
      .map((text) =>
        newBlock(type, {
          text,
          ...(type.number === StoryTypes.CHECK_ITEM.number ? { checked: false } : {}),
        }),
      );
}

export async function applyWritingAction(
  action: WritingAction,
  blockId: string | null,
  { store, addPage, signal }: ActionContext,
): Promise<void> {
  const state = store.getState().state;
  const title = titleText(state);
  const documentText = commandContext(state).documentText;
  const paragraph = paragraphOf(store, blockId);
  const paragraphText = paragraph ? textOf(paragraph) : "";
  const afterParagraph = paragraph?.id ?? null;
  const stream = (prompt: string) => () => streamGenerate(prompt, signal);

  switch (action) {
    case "CODE_BLOCK":
      return suggest(
        store,
        { hideIds: [], afterId: afterParagraph },
        stream(
          promptAbout(
            CODE_PROMPT,
            `Title: ${title}\nParagraph: ${paragraphText}\n\nDocument:\n${documentText}`,
          ),
        ),
        (answer) => [newBlock(StoryTypes.CODE_BLOCK, { text: markdownCode(answer) })],
      );

    case "LIST":
    case "CHECK_LIST": {
      const check = action === "CHECK_LIST";
      return suggest(
        store,
        { hideIds: [], afterId: afterParagraph },
        stream(
          promptAbout(
            check ? CHECKLIST_PROMPT : LIST_PROMPT,
            `Title: ${title}\nParagraph: ${paragraphText}`,
          ),
        ),
        listOf(check ? StoryTypes.CHECK_ITEM : StoryTypes.UNORDERED_LIST_ITEM),
      );
    }

    case "SECTION_HEADING": {
      const index = paragraph ? state.order.indexOf(paragraph.position) : -1;
      const above = index > 0 ? state.blocks[state.order[index - 1]!]!.id : null;
      return suggest(
        store,
        { hideIds: [], afterId: above },
        stream(promptAbout(HEADING_PROMPT, paragraphText)),
        (answer) => [
          newBlock(StoryTypes.TEXT, {
            text: oneLine(answer),
            tags: [{ tag: Tags.H2, position: 0 }],
          }),
        ],
      );
    }

    case "TLDR": {
      const titleBlock = ordered(state).find(isTitle);
      return suggest(
        store,
        { hideIds: [], afterId: titleBlock?.id ?? null },
        stream(promptAbout(TLDR_PROMPT, documentText)),
        (answer) => [
          newBlock(StoryTypes.TEXT, {
            text: TLDR_PREFIX + answer.trim(),
            tags: [{ tag: Tags.CARD_BLOCK, position: 0 }],
          }),
        ],
      );
    }

    case "CONCLUSION":
      return suggest(
        store,
        { hideIds: [], afterId: null },
        stream(promptAbout(CONCLUSION_PROMPT, documentText)),
        answerBlocks,
      );

    case "DOCUMENT_TITLE": {
      const answer = oneLine(await askAi(promptAbout(DOCUMENT_TITLE_PROMPT, documentText), signal));
      const titleBlock = ordered(store.getState().state).find(isTitle);
      if (titleBlock && answer) {
        store
          .getState()
          .dispatch({ type: "updateBlock", id: titleBlock.id, changes: { text: answer } });
      }
      return;
    }

    case "CALLOUT":
      if (paragraph) {
        store.getState().dispatch({
          type: "updateBlock",
          id: paragraph.id,
          changes: { tags: withTag(paragraph, Tags.HIGH_LIGHT_BLOCK, true).tags },
        });
      }
      return;

    case "NEW_DOCUMENT_LINK":
      // An empty line below the paragraph takes the caret, and the link takes its place.
      store.getState().dispatch({
        type: "insertBlocks",
        blocks: [newBlock(StoryTypes.TEXT)],
        afterId: afterParagraph,
      });
      addPage();
      return;

    case "IMAGE":
      return drawParagraphImage(store, blockId, signal);

    case "DRAWING":
    case "SPREADSHEET":
      // Not offered until these blocks come to the web (M8).
      return;
  }
}

/** Suggests a picture the AI draws for the paragraph [blockId], right below it. */
export async function drawParagraphImage(
  store: Store,
  blockId: string | null,
  signal?: AbortSignal,
): Promise<void> {
  const paragraph = paragraphOf(store, blockId);
  const text = paragraph ? textOf(paragraph).trim() : "";
  if (!paragraph || !text) throw new Error("There is no paragraph to illustrate");

  const state = store.getState().state;
  const request = {
    paragraph: text,
    documentTitle: titleText(state),
    documentText: commandContext(state).documentText.slice(0, IMAGE_CONTEXT_LIMIT),
  };

  return suggest(
    store,
    { hideIds: [], afterId: paragraph.id },
    async function* () {
      yield await paragraphImage(request, signal);
    },
    (url) => [newBlock(StoryTypes.IMAGE, { text: null, url })],
  );
}
