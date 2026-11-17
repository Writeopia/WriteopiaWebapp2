import { isTitle, textOf } from "~/features/editor/state/blocks";
import type { Block } from "~/features/editor/state/types";

import type { WritingAction, WritingSuggestion, WritingSuggestionsRequest } from "./api";

/**
 * The writing agent of a document (WritingAgentController.kt). Each time the number of
 * sentences of the paragraph being written changes, it asks the backend which actions the
 * writer likely wants; when a long document opens it asks once about the whole of it (a TL;DR,
 * a conclusion). A title is offered here, without the backend, to a document with text and no
 * title; a document of the root is offered a folder, and an untagged one tags.
 */

const DEBOUNCE_MS = 600;
const MINIMUM_DOCUMENT_LENGTH = 200;
const DOCUMENT_TEXT_LIMIT = 6_000;
const FOLDER_MINIMUM_DOCUMENT_LENGTH = 40;
const TAG_MINIMUM_DOCUMENT_LENGTH = 40;

/** The blocks the web editor cannot add yet: drawings and spreadsheets come with M8. */
const NOT_OFFERED: ReadonlySet<WritingAction> = new Set(["DRAWING", "SPREADSHEET"]);

/** Counts the ends of sentences: ".", "!", "?" and ":", which announces a list or a snippet. */
export function sentenceEnds(text: string): number {
  let count = 0;
  for (const char of text) if (".!?:".includes(char)) count++;
  return count;
}

/** The open document as the agent sees it. */
export type AgentDocument = {
  /** The blocks in order. */
  blocks: Block[];
  /** The block being written, if any. */
  focusId: string | null;
  inRoot: boolean;
  hasTags: boolean;
};

export type AgentState = {
  /** The block the suggestions are about. */
  blockId: string | null;
  suggestions: WritingSuggestion[];
  loading: boolean;
  offerFolder: boolean;
  offerTags: boolean;
};

type AgentOptions = {
  ask: (request: WritingSuggestionsRequest, signal: AbortSignal) => Promise<WritingSuggestion[]>;
  onChange: (state: AgentState) => void;
  debounceMs?: number;
};

export class WritingAgent {
  private document: AgentDocument | null = null;
  private fetched: { blockId: string | null; suggestions: WritingSuggestion[] } = {
    blockId: null,
    suggestions: [],
  };
  private loading = false;
  private offerTitle = false;
  private titleDeclined = false;
  private offerFolder = false;
  private folderDeclined = false;
  private offerTags = false;
  private tagsDeclined = false;
  private tagsChecked = false;
  /** The sentence ends of each paragraph seen while written. */
  private readonly sentences = new Map<string, number>();
  /** The actions taken or dismissed, by paragraph: not offered there again. */
  private readonly declined = new Map<string, Set<WritingAction>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private stopped = false;

  constructor(private readonly options: AgentOptions) {}

  /** The document as it opened. */
  open(document: AgentDocument) {
    this.document = document;
    this.refreshOffers();
    this.publish();

    const text = documentText(document.blocks);
    if (text.length < MINIMUM_DOCUMENT_LENGTH) return;
    const anchor = document.blocks.find(isTitle) ?? document.blocks[0];
    void this.ask(anchor?.id ?? null, {
      scope: "DOCUMENT_OPENED",
      documentTitle: titleOf(document.blocks),
      documentText: text,
    });
  }

  /** The document after a change. */
  update(document: AgentDocument) {
    if (this.stopped) return;
    this.document = document;
    if (this.refreshOffers()) this.publish();

    const block = document.blocks.find((each) => each.id === document.focusId);
    if (!block || isTitle(block)) return;
    const text = textOf(block);
    const count = sentenceEnds(text);
    const previous = this.sentences.get(block.id);
    this.sentences.set(block.id, count);

    // The first sight of a paragraph only records its sentences; a change asks.
    if (previous === undefined || previous === count || text.trim() === "") return;
    this.schedule(block.id);
  }

  /** Withdraws [action] from the box, as it is being applied. */
  take(action: WritingAction) {
    if (action === "DOCUMENT_TITLE") {
      this.titleDeclined = true;
      this.offerTitle = false;
    } else {
      this.decline(this.fetched.blockId, [action]);
      this.fetched = {
        ...this.fetched,
        suggestions: this.fetched.suggestions.filter((each) => each.action !== action),
      };
    }
    this.publish();
  }

  /** Hides the box: its suggestions are not offered again for the same paragraph. */
  dismiss() {
    this.decline(
      this.fetched.blockId,
      this.fetched.suggestions.map((each) => each.action),
    );
    this.fetched = { blockId: null, suggestions: [] };
    this.titleDeclined = true;
    this.offerTitle = false;
    this.declineFolder();
    this.declineTags();
  }

  declineFolder() {
    this.folderDeclined = true;
    this.offerFolder = false;
    this.publish();
  }

  declineTags() {
    this.tagsDeclined = true;
    this.offerTags = false;
    this.publish();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.request?.abort();
  }

  private decline(blockId: string | null, actions: WritingAction[]) {
    if (!blockId) return;
    const set = this.declined.get(blockId) ?? new Set();
    actions.forEach((action) => set.add(action));
    this.declined.set(blockId, set);
  }

  private schedule(blockId: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const document = this.document;
      const block = document?.blocks.find((each) => each.id === blockId);
      if (!document || !block || textOf(block).trim() === "") return;
      void this.ask(blockId, {
        scope: "WRITING",
        text: textOf(block),
        blockType: block.type.name,
        documentTitle: titleOf(document.blocks),
        documentText: documentText(document.blocks),
      });
    }, this.options.debounceMs ?? DEBOUNCE_MS);
  }

  private async ask(blockId: string | null, request: WritingSuggestionsRequest) {
    if (this.stopped) return;
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    this.loading = true;
    this.publish();

    let suggestions: WritingSuggestion[] = [];
    try {
      suggestions = await this.options.ask(request, controller.signal);
    } catch {
      // Nothing is shown when the backend cannot answer.
    }
    if (controller.signal.aborted || this.stopped) return;

    const declined = (blockId ? this.declined.get(blockId) : undefined) ?? new Set<WritingAction>();
    this.fetched = {
      blockId,
      suggestions: suggestions.filter(
        (each) =>
          !NOT_OFFERED.has(each.action) &&
          each.action !== "DOCUMENT_TITLE" &&
          !declined.has(each.action),
      ),
    };
    this.loading = false;
    this.request = null;
    this.publish();
  }

  /** Decides the offers made here. True when one changed. */
  private refreshOffers(): boolean {
    const document = this.document;
    if (!document) return false;
    const before = [this.offerTitle, this.offerFolder, this.offerTags].join();

    const body = document.blocks
      .filter((block) => !isTitle(block))
      .map(textOf)
      .join("\n");
    this.offerTitle =
      !this.titleDeclined && titleOf(document.blocks).trim() === "" && sentenceEnds(body) >= 1;

    const length = documentText(document.blocks).length;
    if (!this.folderDeclined && document.inRoot && length >= FOLDER_MINIMUM_DOCUMENT_LENGTH) {
      this.offerFolder = true;
    }
    if (!document.inRoot) this.offerFolder = false;

    if (document.hasTags) {
      this.offerTags = false;
      this.tagsChecked = true;
    } else if (!this.tagsDeclined && !this.tagsChecked && length >= TAG_MINIMUM_DOCUMENT_LENGTH) {
      this.tagsChecked = true;
      this.offerTags = true;
    }

    return before !== [this.offerTitle, this.offerFolder, this.offerTags].join();
  }

  private publish() {
    const title: WritingSuggestion[] = this.offerTitle
      ? [{ action: "DOCUMENT_TITLE", probability: 1 }]
      : [];
    this.options.onChange({
      blockId: this.fetched.blockId,
      suggestions: [...title, ...this.fetched.suggestions],
      loading: this.loading,
      offerFolder: this.offerFolder,
      offerTags: this.offerTags,
    });
  }
}

function titleOf(blocks: Block[]): string {
  const title = blocks.find(isTitle);
  return title ? textOf(title) : "";
}

/** The text of the document, the title included, cut to what the backend reads. */
function documentText(blocks: Block[]): string {
  return blocks
    .map(textOf)
    .filter((text) => text.trim() !== "")
    .join("\n")
    .slice(0, DOCUMENT_TEXT_LIMIT);
}
