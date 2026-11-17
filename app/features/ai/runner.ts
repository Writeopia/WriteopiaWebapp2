import type { StoreApi } from "zustand";

import { isTextBlock, isTitle, textOf } from "~/features/editor/state/blocks";
import { find, ordered } from "~/features/editor/state/reducer";
import type { EditorStore } from "~/features/editor/state/store";
import type { Block, EditorState } from "~/features/editor/state/types";

import {
  type AiCommandIntent,
  aiFailure,
  commandIntent,
  type QuickAction,
  streamCommand,
  streamQuickAction,
} from "./api";
import { answerBlocks } from "./blocks";
import { buildRewrite } from "./rewrite";

/**
 * Runs the AI on the open document (AiCommandService.kt, PromptService.kt): the answer streams
 * in as a suggestion, which the writer keeps or discards. When the AI fails or is stopped, the
 * suggestion goes and the document is as it was.
 */

type Store = StoreApi<EditorStore>;

/** The text that goes with a command: the selected lines, if any, and the document (AiCommandContext.kt). */
export function commandContext(state: EditorState) {
  const blocks = ordered(state).filter((block) => !block.ephemeral && !block.hidden);
  const selected = blocks.filter(
    (block) => state.selectedIds.has(block.id) && textOf(block).trim() !== "",
  );
  return {
    selectedIds: selected.map((block) => block.id),
    selectedText: selected.map(textOf).join("\n"),
    // The title is sent on its own.
    documentText: documentText(blocks),
  };
}

function documentText(blocks: Block[]): string {
  return blocks
    .filter((block) => !isTitle(block) && textOf(block).trim() !== "")
    .map(textOf)
    .join("\n");
}

/**
 * Streams [answers] into a suggestion that replaces [hideIds] and goes after [afterId]. Ends
 * with the suggestion shown and done, or with no suggestion and the error thrown.
 */
export async function suggest(
  store: Store,
  where: { hideIds: string[]; afterId: string | null },
  answers: () => AsyncIterable<string>,
  toBlocks: (answer: string) => Block[] = answerBlocks,
): Promise<void> {
  const { dispatch } = store.getState();
  dispatch({ type: "suggestBegin", ...where });
  if (!store.getState().state.suggestion) throw new Error("The document cannot take an answer");

  try {
    let blocks: Block[] = [];
    for await (const answer of answers()) {
      blocks = toBlocks(answer);
      dispatch({ type: "suggestUpdate", blocks });
    }
    if (!blocks.some((block) => !isTextBlock(block) || textOf(block).trim() !== "")) {
      throw new Error("The AI answered nothing");
    }
    dispatch({ type: "suggestDone" });
  } catch (error) {
    dispatch({ type: "suggestDiscard" });
    throw error;
  }
}

/**
 * A command typed by the writer. The backend decides first whether it adds to the document,
 * replaces the selected lines, or rewrites the document when nothing is selected.
 */
export async function runCommand(
  store: Store,
  command: string,
  documentTitle: string,
  signal?: AbortSignal,
): Promise<void> {
  const state = store.getState().state;
  const context = commandContext(state);
  const request = {
    command,
    selectedText: context.selectedText,
    documentTitle,
    documentText: context.documentText,
  };

  let intent: AiCommandIntent;
  try {
    // Adding never loses text, so it is what happens when the backend cannot decide.
    intent = (await commandIntent(request, signal)) ?? "ADD";
  } catch (error) {
    if (signal?.aborted || aiFailure(error) !== "other") throw error;
    intent = "ADD";
  }
  signal?.throwIfAborted();

  const lastSelected = context.selectedIds[context.selectedIds.length - 1] ?? null;

  if (intent === "ADD") {
    return suggest(store, { hideIds: [], afterId: lastSelected }, () =>
      streamCommand({ ...request, intent: "ADD" }, signal),
    );
  }

  if (intent === "REPLACE" && context.selectedIds.length > 0) {
    return suggest(store, { hideIds: context.selectedIds, afterId: lastSelected }, () =>
      streamCommand({ ...request, intent: "REPLACE" }, signal),
    );
  }

  // An edit with nothing selected is about the document: it comes back whole, rewritten.
  const current = store.getState().state;
  const cursor = current.focus ? (find(current, current.focus.id)?.position ?? null) : null;
  const rewrite = buildRewrite(ordered(current), cursor);
  if (!rewrite) throw new Error("There is nothing to rewrite in the document");

  return suggest(
    store,
    { hideIds: rewrite.ids, afterId: rewrite.ids[rewrite.ids.length - 1]! },
    () =>
      streamCommand(
        { ...request, selectedText: "", documentText: rewrite.markdown, intent: "REWRITE" },
        signal,
      ),
    (answer) => {
      const parsed = rewrite.parse(answer);
      return [...parsed.blocks, ...parsed.pending];
    },
  );
}

export type QuickActionTarget = "document" | "selection";

/** A quick action about the document or the selected lines; the answer goes after that text. */
export async function runQuickAction(
  store: Store,
  action: QuickAction,
  target: QuickActionTarget,
  signal?: AbortSignal,
): Promise<void> {
  const context = commandContext(store.getState().state);
  const text = target === "document" ? context.documentText : context.selectedText;
  if (!text.trim()) throw new Error("There is no text to work on");

  const afterId =
    target === "selection" ? (context.selectedIds[context.selectedIds.length - 1] ?? null) : null;
  return suggest(store, { hideIds: [], afterId }, () => streamQuickAction(action, text, signal));
}
