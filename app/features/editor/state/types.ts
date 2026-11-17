import type { SpanInfo, StoryStep, StoryType } from "~/core/models";

/**
 * The document as the editor holds it: the steps of the wire format, keyed by their position
 * (a rank), like the Map<String, StoryStep> of WriteopiaStateManager.
 */

/** A step in the editor. */
export type Block = StoryStep & {
  /**
   * Only on this screen: never saved nor sent (an image still uploading). The other apps
   * mark the same steps by their type (loading, skeleton).
   */
  ephemeral?: boolean;
};

/** The caret, or the selected text when start < end, inside the text block with [id]. */
export type Caret = { id: string; start: number; end: number };

/**
 * How the last change touched the document. Typing in one block is grouped in the history;
 * anything else is a change of structure.
 */
export type LastEdit =
  | { kind: "nothing" }
  | { kind: "line"; id: string }
  | { kind: "structure" };

/** A "/" command being typed: where its slash is and what was typed after it. */
export type SlashInput = { id: string; slashIndex: number; filter: string; highlight: number };

export type EditorState = {
  documentId: string;
  /** The positions, sorted. */
  order: string[];
  /** The blocks by position. */
  blocks: Record<string, Block>;
  focus: Caret | null;
  /**
   * Grows each time the caret must be moved by the editor rather than by the browser: after
   * a split, a merge, an undo. The block with the focus applies it to the page.
   */
  focusRequest: number;
  /** Blocks selected as a whole (drag box, Shift+arrows), by id. */
  selectedIds: ReadonlySet<string>;
  lastEdit: LastEdit;
  slash: SlashInput | null;
  readOnly: boolean;
};

export type { SpanInfo, StoryStep, StoryType };
