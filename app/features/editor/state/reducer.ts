import { generateId } from "~/core/id";
import {
  type Document,
  isUiOnlyStoryType,
  type Span,
  type StoryStep,
  type StoryType,
  StoryTypes,
  type Tag,
  tagCarriesOver,
} from "~/core/models";
import { RANK_FIRST, rankBefore, rankBetween } from "~/core/rank/rank";

import {
  hasTag,
  isCodeBlock,
  isErasableTag,
  isListLike,
  isTextBlock,
  isTitle,
  lineBreakType,
  newBlock,
  textOf,
  withHeading,
  withTag,
  withType,
} from "./blocks";
import { detectSlash, lineCommandAt, type LineCommandEffect, type SlashCommand } from "./commands";
import { isPastedLink } from "./links";
import {
  adjustSpans,
  coversAll,
  HIGHLIGHTS,
  isFullyCovered,
  removeSpan,
  setLink,
  shiftSpans,
  sliceSpans,
  splitLines,
  toggleSpan,
} from "./spans";
import type { Block, Caret, EditorState } from "./types";

/**
 * Every change of the document goes through here: (state, action) => state, with no side
 * effect but the random part of new ranks. A port of ContentHandler and WriteopiaManager of
 * the SDK, and of ContentManager.swift.
 */

export type Action =
  | { type: "load"; document: Document; readOnly: boolean }
  | { type: "setReadOnly"; readOnly: boolean }
  /** The text of a block as the page has it now, with the caret after the edit. */
  | { type: "input"; id: string; text: string; cursor: number }
  /** Replaces [start, end) of a block's text with [text]: typing done by the editor. */
  | { type: "insertText"; id: string; start: number; end: number; text: string }
  /** Enter. */
  | { type: "split"; id: string; start: number; end: number }
  /** Backspace with the caret at the start of a block. */
  | { type: "eraseAtStart"; id: string }
  /** Delete with the caret at the end of a block. */
  | { type: "deleteAtEnd"; id: string }
  | { type: "focus"; focus: Caret | null; request?: boolean }
  | { type: "toggleSpan"; span: Span }
  | { type: "setLink"; id: string; start: number; end: number; url: string | null }
  | { type: "toggleType"; storyType: StoryType }
  | { type: "toggleTag"; tag: Tag }
  | { type: "toggleHeading"; tag: Tag }
  | { type: "check"; id: string; checked: boolean }
  /**
   * Adds [blocks] after the block with [afterId] (the focused one when undefined, the end
   * when there is none). An empty paragraph there is replaced by them.
   */
  | { type: "insertBlocks"; blocks: Block[]; afterId?: string | null; focusEnd?: boolean }
  /** Puts [blocks] in the place of the text selected in [caret], splitting its block. */
  | { type: "pasteBlocks"; caret: Caret; blocks: Block[] }
  | { type: "updateBlock"; id: string; changes: Partial<Block> }
  | { type: "removeBlock"; id: string }
  /** New ids for blocks whose ids the server will not take again. */
  | { type: "renewIds"; ids: string[] }
  /** Moves the blocks to right after the block with [afterId]; null puts them first. */
  | { type: "move"; ids: string[]; afterId: string | null }
  | { type: "select"; ids: string[] }
  | { type: "selectAll" }
  | { type: "extendSelection"; up: boolean }
  | { type: "deleteSelected" }
  | { type: "clickAtEnd" }
  | { type: "serverUpdate"; steps: StoryStep[]; deletedIds: string[]; keepIds: ReadonlySet<string> }
  | { type: "slashHighlight"; offset: number; count: number }
  | { type: "slashClose" }
  | { type: "slashPick"; command: SlashCommand; now: Date };

export const emptyState: EditorState = {
  documentId: "",
  order: [],
  blocks: {},
  focus: null,
  focusRequest: 0,
  selectedIds: new Set(),
  lastEdit: { kind: "nothing" },
  slash: null,
  readOnly: false,
};

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "load":
      return load(action.document, action.readOnly);
    case "setReadOnly":
      return { ...state, readOnly: action.readOnly, selectedIds: new Set(), slash: null };
    case "focus":
      return focus(state, action.focus, action.request ?? false);
    case "select":
      return selectIds(state, action.ids);
    case "selectAll":
      return selectIds(
        state,
        ordered(state)
          .filter((block) => !isTitle(block))
          .map((block) => block.id),
      );
    case "extendSelection":
      return extendSelection(state, action.up);
    case "slashHighlight":
      return slashHighlight(state, action.offset, action.count);
    case "slashClose":
      return state.slash ? { ...state, slash: null } : state;
    // What changed elsewhere shows on a locked document too: the sync counts it as known, and
    // would delete it on the server if the editor never held it.
    case "serverUpdate":
      return serverUpdate(state, action.steps, action.deletedIds, action.keepIds);
  }

  if (state.readOnly) return state;

  switch (action.type) {
    case "input":
      return input(state, action.id, action.text, action.cursor);
    case "insertText": {
      const found = find(state, action.id);
      if (!found) return state;
      const text = textOf(found.block);
      const newText = text.slice(0, action.start) + action.text + text.slice(action.end);
      return input(state, action.id, newText, action.start + action.text.length);
    }
    case "split":
      return split(state, action.id, action.start, action.end);
    case "eraseAtStart":
      return eraseAtStart(state, action.id);
    case "deleteAtEnd":
      return deleteAtEnd(state, action.id);
    case "toggleSpan":
      return toggleSpanAction(state, action.span);
    case "setLink":
      return updateText(state, action.id, (block) => ({
        ...block,
        spans: setLink(block.spans, action.url, action.start, action.end),
      }));
    case "toggleType":
      return toggleType(state, action.storyType);
    case "toggleTag":
      return mapTargets(state, (block, all) =>
        withTag(block, action.tag, !all.every((each) => hasTag(each, action.tag))),
      );
    case "toggleHeading":
      return mapTargets(state, (block, all) =>
        isTextBlock(block)
          ? withHeading(block, all.every((each) => hasTag(each, action.tag)) ? null : action.tag)
          : block,
      );
    case "check":
      return replace(state, action.id, (block) => ({ ...block, checked: action.checked }), "line");
    case "insertBlocks":
      return insertBlocks(state, action.blocks, action.afterId, action.focusEnd ?? false);
    case "pasteBlocks":
      return pasteBlocks(state, action.caret, action.blocks);
    case "updateBlock":
      return replace(state, action.id, (block) => ({ ...block, ...action.changes }), "structure");
    case "removeBlock":
      return removeIds(state, [action.id]);
    case "renewIds":
      return renewIds(state, action.ids);
    case "move":
      return move(state, action.ids, action.afterId);
    case "deleteSelected":
      return removeIds(state, [...state.selectedIds]);
    case "clickAtEnd":
      return clickAtEnd(state);
    case "slashPick":
      return slashPick(state, action.command, action.now);
  }
}

// ---------------------------------------------------------------------------------------------
// Reading the state

/** The blocks in document order. */
export function ordered(state: EditorState): Block[] {
  return state.order.map((position) => state.blocks[position]!);
}

export function find(
  state: EditorState,
  id: string,
): { block: Block; position: string; index: number } | null {
  for (let index = 0; index < state.order.length; index++) {
    const position = state.order[index]!;
    const block = state.blocks[position]!;
    if (block.id === id) return { block, position, index };
  }
  return null;
}

/** The steps the backend keeps: in order, without the ones only this screen has. */
export function documentContent(state: EditorState): StoryStep[] {
  return ordered(state)
    .filter((block) => !block.ephemeral && !isUiOnlyStoryType(block.type))
    .map(toStep);
}

/** The step without what only the editor holds. */
export function toStep(block: Block): StoryStep {
  const step: Block = { ...block };
  delete step.ephemeral;
  return step;
}

export function titleText(state: EditorState): string {
  const first = state.blocks[state.order[0] ?? ""];
  return first && isTitle(first) ? textOf(first) : "";
}

/** The blocks the block buttons act on: the selected ones, or else the focused one. */
export function targetIds(state: EditorState): string[] {
  if (state.selectedIds.size > 0) {
    return ordered(state)
      .filter((block) => state.selectedIds.has(block.id))
      .map((block) => block.id);
  }
  const focused = state.focus ? find(state, state.focus.id) : null;
  return focused && !isTitle(focused.block) ? [focused.block.id] : [];
}

// ---------------------------------------------------------------------------------------------
// Building blocks of the changes

type Placement = { blocks: Record<string, Block>; order: string[] };

function placement(state: EditorState): Placement {
  return { blocks: { ...state.blocks }, order: [...state.order] };
}

/** Puts [block] at [position], which must be free, keeping the order sorted. */
function place(target: Placement, block: Block, position: string) {
  target.blocks[position] = { ...block, position };
  let index = target.order.length;
  while (index > 0 && target.order[index - 1]! > position) index--;
  target.order.splice(index, 0, position);
}

function unplace(target: Placement, position: string) {
  delete target.blocks[position];
  const index = target.order.indexOf(position);
  if (index !== -1) target.order.splice(index, 1);
}

/** Places [blocks] in order right after [after] (null: before everything), returning their positions. */
function placeAfter(target: Placement, after: string | null, blocks: Block[]): string[] {
  const index = after === null ? -1 : target.order.indexOf(after);
  const next = target.order[index + 1] ?? null;
  let previous = after;
  return blocks.map((block) => {
    const position = previous === null && next === null ? RANK_FIRST : rankBetween(previous, next);
    place(target, block, position);
    previous = position;
    return position;
  });
}

function withPlacement(
  state: EditorState,
  target: Placement,
  changes: Partial<EditorState> = {},
): EditorState {
  return {
    ...state,
    blocks: target.blocks,
    order: target.order,
    lastEdit: { kind: "structure" },
    slash: null,
    ...changes,
  };
}

/** The caret at [offset] of the block with [id], moved there by the editor. */
function caretTo(state: EditorState, id: string, offset: number): Partial<EditorState> {
  return { focus: { id, start: offset, end: offset }, focusRequest: state.focusRequest + 1 };
}

function replace(
  state: EditorState,
  id: string,
  change: (block: Block) => Block,
  kind: "line" | "structure",
): EditorState {
  const found = find(state, id);
  if (!found) return state;
  const block = change(found.block);
  if (block === found.block) return state;

  return {
    ...state,
    blocks: { ...state.blocks, [found.position]: { ...block, position: found.position } },
    lastEdit: kind === "line" ? { kind: "line", id } : { kind: "structure" },
  };
}

function updateText(state: EditorState, id: string, change: (block: Block) => Block): EditorState {
  const found = find(state, id);
  if (!found || !isTextBlock(found.block)) return state;
  return replace(state, id, change, "structure");
}

// ---------------------------------------------------------------------------------------------
// Loading

/**
 * The steps of a document ready for editing: sorted, without the steps only a screen draws,
 * and starting with a title (documents made elsewhere may lack one). Two steps on the same
 * position (two devices added one there) both stay, the later one moved right after.
 */
function load(document: Document, readOnly: boolean): EditorState {
  const steps = [...document.content]
    .filter((step) => !isUiOnlyStoryType(step.type))
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  const target: Placement = { blocks: {}, order: [] };
  steps.forEach((step, index) => {
    const last = target.order[target.order.length - 1];
    let position = step.position;
    if (last !== undefined && position <= last) {
      const nextDistinct = steps.slice(index + 1).find((other) => other.position > last);
      position = rankBetween(last, nextDistinct?.position ?? null);
    }
    place(target, step, position);
  });

  const first = target.order[0];
  const titlePosition = target.order.find((position) => isTitle(target.blocks[position]!));
  if (titlePosition === undefined) {
    const title = newBlock(StoryTypes.TITLE, { text: document.title });
    place(target, title, first === undefined ? RANK_FIRST : rankBefore(first));
  } else if (titlePosition !== first) {
    const title = target.blocks[titlePosition]!;
    unplace(target, titlePosition);
    place(target, title, rankBefore(first!));
  }

  return { ...emptyState, documentId: document.id, ...target, readOnly };
}

// ---------------------------------------------------------------------------------------------
// Typing

function input(state: EditorState, id: string, text: string, cursor: number): EditorState {
  const found = find(state, id);
  if (!found || !isTextBlock(found.block)) return state;
  const { block } = found;
  const oldText = textOf(block);

  const spans = adjustSpans(block.spans, oldText, text, cursor);
  const edited: Block = { ...block, text, spans };

  if (text.includes("\n") && !isCodeBlock(block)) {
    return splitAtLineBreaks(state, edited, found.position, cursor);
  }

  if (isStoryType(block, StoryTypes.TEXT) && isPastedLink(oldText, text)) {
    return linkCard(state, found.position, text.trim());
  }

  if (!isTitle(block) && !isCodeBlock(block)) {
    const command = lineCommandAt(text, cursor);
    if (command) {
      return applyLineCommand(state, found.position, edited, command.effect, command.text.length);
    }
  }

  const slash = isTitle(block) ? null : detectSlash(state.slash, id, oldText, text, cursor);
  return {
    ...state,
    blocks: { ...state.blocks, [found.position]: edited },
    focus: { id, start: cursor, end: cursor },
    lastEdit: { kind: "line", id },
    slash,
  };
}

function isStoryType(block: Block, type: StoryType): boolean {
  return block.type.number === type.number;
}

/**
 * Splits a block at each line break of its text (a paste, a line break the browser put in).
 * The first line keeps the block; the others are new blocks of the type Enter would make.
 */
function splitAtLineBreaks(
  state: EditorState,
  block: Block,
  position: string,
  cursor: number,
): EditorState {
  const lines = splitLines(textOf(block), block.spans);
  const type = lineBreakType(block.type);
  const carried = block.tags.filter((info) => tagCarriesOver(info.tag));

  const target = placement(state);
  target.blocks[position] = { ...block, text: lines[0]!.text, spans: lines[0]!.spans };
  const created = lines
    .slice(1)
    .map((line) => newBlock(type, { text: line.text, spans: line.spans, tags: carried }));
  placeAfter(target, position, created);

  // The caret goes to the line that holds it.
  let remaining = cursor;
  let line = lines.length - 1;
  for (let index = 0; index < lines.length; index++) {
    if (remaining <= lines[index]!.text.length) {
      line = index;
      break;
    }
    remaining -= lines[index]!.text.length + 1;
  }
  const focusId = line === 0 ? block.id : created[line - 1]!.id;
  return withPlacement(state, target, caretTo(state, focusId, Math.max(0, remaining)));
}

/**
 * A command typed at the start of a line changes the line and leaves its text. A divider
 * cannot be typed in, so the caret goes to a text line below it, made when there is none.
 */
function applyLineCommand(
  state: EditorState,
  position: string,
  block: Block,
  effect: LineCommandEffect,
  length: number,
): EditorState {
  const text = textOf(block);
  // The space that ends a command standing before text goes with it.
  const cut = text[length] === " " && !text.slice(0, length).endsWith(" ") ? length + 1 : length;
  const rest = text.slice(cut);
  const base: Block = { ...block, text: rest, spans: adjustSpans(block.spans, text, rest, 0) };
  return applyEffect(state, position, base, effect, 0);
}

function applyEffect(
  state: EditorState,
  position: string,
  block: Block,
  effect: LineCommandEffect,
  cursor: number,
): EditorState {
  let changed: Block;
  switch (effect.kind) {
    case "type":
      changed = withType(block, effect.type);
      if (isListLike(changed) || isCodeBlock(changed)) changed = withHeading(changed, null);
      break;
    case "heading":
      changed = withHeading(withType(block, StoryTypes.TEXT), effect.tag);
      break;
    case "tag":
      changed = withTag(block, effect.tag, !hasTag(block, effect.tag));
      break;
  }

  const target = placement(state);
  target.blocks[position] = changed;

  if (changed.type.number === StoryTypes.DIVIDER.number) {
    target.blocks[position] = { ...changed, text: null, spans: [], tags: [], checked: null };
    // A divider has no text: what the line held goes to a new line below it.
    const rest = textOf(block);
    const lineBelow = rest === "" ? textLineAfter(target, position) : null;
    const below =
      lineBelow ??
      placeAfter(target, position, [
        newBlock(StoryTypes.TEXT, { text: rest, spans: block.spans }),
      ])[0]!;
    return withPlacement(state, target, caretTo(state, target.blocks[below]!.id, 0));
  }

  return withPlacement(state, target, caretTo(state, changed.id, cursor));
}

/** The position of the paragraph right after [position], when the next block is one. */
function textLineAfter(target: Placement, position: string): string | null {
  const next = target.order[target.order.indexOf(position) + 1];
  return next !== undefined && target.blocks[next]!.type.number === StoryTypes.TEXT.number
    ? next
    : null;
}

/** A web address pasted alone in a paragraph turns it into a link card. */
function linkCard(state: EditorState, position: string, url: string): EditorState {
  const target = placement(state);
  const block = target.blocks[position]!;
  target.blocks[position] = {
    ...block,
    type: StoryTypes.LINK_CARD,
    url,
    text: null,
    spans: [],
    tags: [],
    checked: null,
  };
  const lineBelow = textLineAfter(target, position);
  const below = lineBelow ?? placeAfter(target, position, [newBlock(StoryTypes.TEXT)])[0]!;
  return withPlacement(state, target, caretTo(state, target.blocks[below]!.id, 0));
}

// ---------------------------------------------------------------------------------------------
// Enter, Backspace, Delete

/**
 * Enter: the text after the caret goes to a new block below. Lists and checkboxes continue,
 * box and card tags follow, heading tags do not. Enter on an empty list item ends the list.
 * In a code block Enter writes a line break.
 */
function split(state: EditorState, id: string, start: number, end: number): EditorState {
  const found = find(state, id);
  if (!found || !isTextBlock(found.block)) return state;
  const { block, position } = found;
  const text = textOf(block);

  if (isCodeBlock(block)) {
    return input(state, id, text.slice(0, start) + "\n" + text.slice(end), start + 1);
  }

  if (isListLike(block) && text === "") {
    return withPlacement(
      state,
      {
        blocks: { ...state.blocks, [position]: withType(block, StoryTypes.TEXT) },
        order: state.order,
      },
      caretTo(state, id, 0),
    );
  }

  const spans = removeRange(block.spans, start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  const target = placement(state);
  target.blocks[position] = { ...block, text: before, spans: sliceSpans(spans, 0, start) };

  const type = lineBreakType(block.type);
  const created = newBlock(type, {
    text: after,
    spans: sliceSpans(spans, start, start + after.length),
    tags: block.tags.filter((info) => tagCarriesOver(info.tag)),
  });
  placeAfter(target, position, [created]);

  return withPlacement(state, target, caretTo(state, created.id, 0));
}

/** The spans once [start, end) of their text is deleted. */
function removeRange(spans: Block["spans"], start: number, end: number): Block["spans"] {
  if (start >= end) return spans;
  return spans.flatMap((info) => {
    const shrink = (index: number) =>
      index <= start ? index : index >= end ? index - (end - start) : start;
    const next = { ...info, start: shrink(info.start), end: shrink(info.end) };
    return next.start < next.end ? [next] : [];
  });
}

/**
 * Backspace at the start of a block takes away what makes it special first (list, heading,
 * box, code), then joins it to the paragraph above. A block above that is not text (a
 * divider, an image) is selected instead, so the next Backspace deletes it.
 */
function eraseAtStart(state: EditorState, id: string): EditorState {
  const found = find(state, id);
  if (!found || isTitle(found.block)) return state;
  const { block, position, index } = found;

  if (isListLike(block) || isCodeBlock(block)) {
    return replace(state, id, (b) => withType(b, StoryTypes.TEXT), "structure");
  }
  if (block.tags.some((info) => isErasableTag(info.tag))) {
    return replace(
      state,
      id,
      (b) => ({ ...b, tags: b.tags.filter((info) => !isErasableTag(info.tag)) }),
      "structure",
    );
  }

  const previousPosition = state.order[index - 1];
  if (previousPosition === undefined) return state;
  const previous = state.blocks[previousPosition]!;

  if (!isTextBlock(previous)) {
    return { ...state, selectedIds: new Set([previous.id]), slash: null };
  }

  const previousText = textOf(previous);
  const target = placement(state);
  target.blocks[previousPosition] = {
    ...previous,
    text: previousText + textOf(block),
    spans: [...previous.spans, ...shiftSpans(block.spans, previousText.length)],
  };
  unplace(target, position);

  return withPlacement(state, target, caretTo(state, previous.id, previousText.length));
}

/** Delete at the end of a block brings the next paragraph in; a block that is not text is selected. */
function deleteAtEnd(state: EditorState, id: string): EditorState {
  const found = find(state, id);
  if (!found) return state;
  const { block, position, index } = found;
  const nextPosition = state.order[index + 1];
  if (nextPosition === undefined) return state;
  const next = state.blocks[nextPosition]!;

  if (!isTextBlock(next)) {
    return { ...state, selectedIds: new Set([next.id]), slash: null };
  }

  const text = textOf(block);
  const target = placement(state);
  target.blocks[position] = {
    ...block,
    text: text + textOf(next),
    spans: [...block.spans, ...shiftSpans(next.spans, text.length)],
  };
  unplace(target, nextPosition);

  return withPlacement(state, target, caretTo(state, id, text.length));
}

// ---------------------------------------------------------------------------------------------
// Focus and block selection

function focus(state: EditorState, caret: Caret | null, request: boolean): EditorState {
  const slash = state.slash && caret?.id !== state.slash.id ? null : state.slash;
  const selectedIds = caret && state.selectedIds.size > 0 ? new Set<string>() : state.selectedIds;
  return {
    ...state,
    focus: caret,
    focusRequest: request ? state.focusRequest + 1 : state.focusRequest,
    selectedIds,
    slash,
  };
}

function selectIds(state: EditorState, ids: string[]): EditorState {
  if (state.readOnly) return state;
  const selectable = new Set(
    ids.filter((id) => {
      const found = find(state, id);
      return found !== null && !isTitle(found.block);
    }),
  );
  if (selectable.size === 0 && state.selectedIds.size === 0) return state;
  return { ...state, selectedIds: selectable, slash: null };
}

/** Shift+Up / Shift+Down: the selection grows by the block above or below it. */
function extendSelection(state: EditorState, up: boolean): EditorState {
  if (state.readOnly) return state;
  const blocks = ordered(state);
  let indexes = blocks
    .map((block, index) => (state.selectedIds.has(block.id) ? index : -1))
    .filter((index) => index !== -1);

  if (indexes.length === 0) {
    const focused = state.focus ? find(state, state.focus.id) : null;
    if (!focused || isTitle(focused.block)) return state;
    indexes = [focused.index];
    return { ...state, selectedIds: new Set([focused.block.id]), slash: null };
  }

  const edge = up ? Math.min(...indexes) : Math.max(...indexes);
  const next = blocks[edge + (up ? -1 : 1)];
  if (!next || isTitle(next)) return state;
  return { ...state, selectedIds: new Set([...state.selectedIds, next.id]) };
}

// ---------------------------------------------------------------------------------------------
// Formatting

/**
 * B, I, U and the highlights: on the selected blocks as a whole when there are some, else on
 * the selected text.
 */
function toggleSpanAction(state: EditorState, span: Span): EditorState {
  if (state.selectedIds.size > 0) {
    const blocks = ordered(state).filter(
      (block) => state.selectedIds.has(block.id) && isTextBlock(block) && textOf(block) !== "",
    );
    if (blocks.length === 0) return state;
    const remove = blocks.every((block) => coversAll(block.spans, span, textOf(block).length));

    const target = placement(state);
    for (const block of blocks) {
      const length = textOf(block).length;
      let spans = removeSpan(block.spans, span, 0, length);
      if (!remove) {
        if ((HIGHLIGHTS as readonly string[]).includes(span)) {
          for (const color of HIGHLIGHTS) spans = removeSpan(spans, color, 0, length);
        }
        spans = [...spans, { start: 0, end: length, span, extra: null }];
      }
      target.blocks[block.position] = { ...block, spans };
    }
    return { ...state, blocks: target.blocks, lastEdit: { kind: "structure" } };
  }

  const caret = state.focus;
  if (!caret || caret.start >= caret.end) return state;
  return updateText(state, caret.id, (block) => {
    const length = textOf(block).length;
    const start = Math.min(caret.start, length);
    const end = Math.min(caret.end, length);
    return start < end ? { ...block, spans: toggleSpan(block.spans, span, start, end) } : block;
  });
}

/** Whether [span] is on the whole selection: the selected blocks, or else the selected text. */
export function isSpanActive(state: EditorState, span: Span): boolean {
  if (state.selectedIds.size > 0) {
    const blocks = ordered(state).filter(
      (block) => state.selectedIds.has(block.id) && isTextBlock(block) && textOf(block) !== "",
    );
    return (
      blocks.length > 0 &&
      blocks.every((block) => coversAll(block.spans, span, textOf(block).length))
    );
  }
  const caret = state.focus;
  const found = caret ? find(state, caret.id) : null;
  return (
    caret !== null &&
    found !== null &&
    isFullyCovered(found.block.spans, span, caret.start, caret.end)
  );
}

/** Applies [change] to the target blocks (never the title); [all] are the targets before it. */
function mapTargets(
  state: EditorState,
  change: (block: Block, all: Block[]) => Block,
): EditorState {
  const ids = targetIds(state);
  if (ids.length === 0) return state;
  const all = ids.map((id) => find(state, id)!.block);

  const target = placement(state);
  let changed = false;
  for (const block of all) {
    const next = change(block, all);
    if (next !== block) {
      target.blocks[block.position] = next;
      changed = true;
    }
  }
  if (!changed) return state;

  const keepCaret =
    state.focus && ids.includes(state.focus.id) ? { focusRequest: state.focusRequest + 1 } : {};
  return {
    ...state,
    blocks: target.blocks,
    lastEdit: { kind: "structure" },
    slash: null,
    ...keepCaret,
  };
}

/**
 * Checkbox, list and code buttons: the blocks become [type], or paragraphs again when all of
 * them already are. A divider is added after the block instead.
 */
function toggleType(state: EditorState, type: StoryType): EditorState {
  if (type.number === StoryTypes.DIVIDER.number) {
    return insertBlocks(state, [newBlock(StoryTypes.DIVIDER)], undefined, false);
  }
  return mapTargets(state, (block, all) => {
    if (!isTextBlock(block)) return block;
    const every = all.every((each) => each.type.number === type.number);
    const changed = withType(block, every ? StoryTypes.TEXT : type);
    return isListLike(changed) || isCodeBlock(changed) ? withHeading(changed, null) : changed;
  });
}

// ---------------------------------------------------------------------------------------------
// Adding, removing and moving blocks

function insertBlocks(
  state: EditorState,
  blocks: Block[],
  afterId: string | null | undefined,
  focusEnd: boolean,
): EditorState {
  if (blocks.length === 0) return state;
  const target = placement(state);

  const anchorId = afterId === undefined ? (state.focus?.id ?? null) : afterId;
  const anchor = anchorId ? find(state, anchorId) : null;
  let after = anchor?.position ?? state.order[state.order.length - 1] ?? null;

  // An empty paragraph where the blocks go is replaced by them.
  if (
    anchor?.block.type.number === StoryTypes.TEXT.number &&
    textOf(anchor.block) === "" &&
    !isTitle(anchor.block)
  ) {
    after = state.order[anchor.index - 1] ?? null;
    unplace(target, anchor.position);
  }

  const positions = placeAfter(target, after, blocks);
  const last = target.blocks[positions[positions.length - 1]!]!;

  let caret: Partial<EditorState> = { focus: null };
  if (isTextBlock(last)) {
    caret = caretTo(state, last.id, focusEnd ? textOf(last).length : 0);
  } else {
    // The writer goes on below what was added.
    const lineBelow = textLineAfter(target, last.position);
    const below = lineBelow ?? placeAfter(target, last.position, [newBlock(StoryTypes.TEXT)])[0]!;
    caret = caretTo(state, target.blocks[below]!.id, 0);
  }
  return withPlacement(state, target, { ...caret, selectedIds: new Set() });
}

/**
 * A paste of several blocks in the middle of a text: the text before the caret takes the
 * first pasted line, the last one gets the text after the caret, the others go between.
 */
function pasteBlocks(state: EditorState, caret: Caret, pasted: Block[]): EditorState {
  const found = find(state, caret.id);
  if (!found || pasted.length === 0) return state;
  const { block, position } = found;
  if (!isTextBlock(block)) return insertBlocks(state, pasted, block.id, true);

  const text = textOf(block);
  const spans = removeRange(block.spans, caret.start, caret.end);
  const before = text.slice(0, caret.start);
  const beforeSpans = sliceSpans(spans, 0, caret.start);
  const after = text.slice(caret.end);
  const afterSpans = sliceSpans(spans, caret.start, caret.start + after.length);

  const target = placement(state);
  const blocks = [...pasted];
  const first = blocks[0]!;

  // The first pasted line joins the text before the caret when both are text.
  if (isTextBlock(first) && (before !== "" || isTitle(block))) {
    target.blocks[position] = {
      ...block,
      text: before + textOf(first),
      spans: [...beforeSpans, ...shiftSpans(first.spans, before.length)],
    };
    blocks.shift();
  } else if (before === "" && !isTitle(block)) {
    unplace(target, position);
  } else {
    target.blocks[position] = { ...block, text: before, spans: beforeSpans };
  }

  const anchor = target.blocks[position] ? position : (state.order[found.index - 1] ?? null);
  const positions = placeAfter(target, anchor, blocks);
  const lastPosition =
    positions[positions.length - 1] ?? (target.blocks[position] ? position : null);
  const last = lastPosition ? target.blocks[lastPosition]! : null;

  let caretId: string;
  let offset: number;
  if (last && isTextBlock(last)) {
    const length = textOf(last).length;
    target.blocks[lastPosition!] = {
      ...last,
      text: textOf(last) + after,
      spans: [...last.spans, ...shiftSpans(afterSpans, length)],
    };
    caretId = last.id;
    offset = length;
  } else {
    const rest = newBlock(StoryTypes.TEXT, { text: after, spans: afterSpans });
    placeAfter(target, lastPosition, [rest]);
    caretId = rest.id;
    offset = 0;
  }

  return withPlacement(state, target, {
    ...caretTo(state, caretId, offset),
    selectedIds: new Set(),
  });
}

function removeIds(state: EditorState, ids: string[]): EditorState {
  const remove = new Set(ids);
  const target = placement(state);
  let focusId: string | null = null;
  let firstRemovedIndex = -1;

  state.order.forEach((position, index) => {
    const block = state.blocks[position]!;
    if (remove.has(block.id) && !isTitle(block)) {
      if (firstRemovedIndex === -1) firstRemovedIndex = index;
      unplace(target, position);
    }
  });
  if (firstRemovedIndex === -1) return state;

  // The caret goes to the end of the text block above what was removed.
  for (let index = firstRemovedIndex - 1; index >= 0; index--) {
    const block = state.blocks[state.order[index]!]!;
    if (!remove.has(block.id) && isTextBlock(block)) {
      focusId = block.id;
      break;
    }
  }
  const caret = focusId
    ? caretTo(state, focusId, textOf(find(state, focusId)!.block).length)
    : { focus: null };
  return withPlacement(state, target, { ...caret, selectedIds: new Set() });
}

function renewIds(state: EditorState, ids: string[]): EditorState {
  const renewed = new Map(ids.map((id) => [id, generateId()]));
  const blocks = { ...state.blocks };
  let changed = false;
  for (const position of state.order) {
    const next = renewed.get(blocks[position]!.id);
    if (next) {
      blocks[position] = { ...blocks[position]!, id: next };
      changed = true;
    }
  }
  if (!changed) return state;

  const focusId = state.focus ? renewed.get(state.focus.id) : undefined;
  return {
    ...state,
    blocks,
    // The renewed block is drawn again: the caret goes back into it.
    ...(focusId && state.focus
      ? { focus: { ...state.focus, id: focusId }, focusRequest: state.focusRequest + 1 }
      : {}),
    selectedIds: new Set([...state.selectedIds].map((id) => renewed.get(id) ?? id)),
    slash: null,
  };
}

/** Moves blocks, in their order, to right after another one. The title stays first. */
function move(state: EditorState, ids: string[], afterId: string | null): EditorState {
  const moving = ordered(state).filter((block) => ids.includes(block.id) && !isTitle(block));
  if (moving.length === 0 || (afterId !== null && ids.includes(afterId))) return state;

  const target = placement(state);
  for (const block of moving) unplace(target, block.position);

  let after: string | null;
  if (afterId === null) {
    const first = target.blocks[target.order[0] ?? ""];
    after = first && isTitle(first) ? first.position : null;
  } else {
    after = find(state, afterId)?.position ?? null;
    if (after === null) return state;
  }

  placeAfter(target, after, moving);
  if (
    target.order.every(
      (position, index) =>
        state.order[index] === position &&
        target.blocks[position]!.id === state.blocks[position]!.id,
    )
  ) {
    return state;
  }
  return withPlacement(state, target);
}

/** A click below the last block: it takes the caret when it is an empty paragraph, else one is added. */
function clickAtEnd(state: EditorState): EditorState {
  const lastPosition = state.order[state.order.length - 1];
  const last = lastPosition ? state.blocks[lastPosition] : undefined;
  if (last?.type.number === StoryTypes.TEXT.number && textOf(last) === "") {
    return { ...state, ...caretTo(state, last.id, 0), selectedIds: new Set() };
  }
  const target = placement(state);
  const block = newBlock(StoryTypes.TEXT);
  placeAfter(target, lastPosition ?? null, [block]);
  return withPlacement(state, target, { ...caretTo(state, block.id, 0), selectedIds: new Set() });
}

// ---------------------------------------------------------------------------------------------
// Changes from the backend

/**
 * Steps changed or deleted elsewhere, from the answer of a sync. The blocks in [keepIds] have
 * local changes not sent yet: they win, and are sent next.
 */
function serverUpdate(
  state: EditorState,
  steps: StoryStep[],
  deletedIds: string[],
  keepIds: ReadonlySet<string>,
): EditorState {
  const target = placement(state);
  let changed = false;

  for (const id of deletedIds) {
    if (keepIds.has(id)) continue;
    const found = find(state, id);
    if (found && !isTitle(found.block)) {
      unplace(target, found.position);
      changed = true;
    }
  }

  for (const step of steps) {
    if (keepIds.has(step.id) || isUiOnlyStoryType(step.type)) continue;
    const found = find(state, step.id);
    if (found) {
      if (sameStep(found.block, step)) continue;
      unplace(target, found.position);
    }
    let position = step.position;
    if (target.blocks[position]) {
      const index = target.order.indexOf(position);
      position = rankBetween(position, target.order[index + 1] ?? null);
    }
    place(target, step, position);
    changed = true;
  }

  if (!changed) return state;
  const focus = state.focus && find({ ...state, ...target }, state.focus.id) ? state.focus : null;
  return {
    ...state,
    blocks: target.blocks,
    order: target.order,
    focus,
    lastEdit: { kind: "nothing" },
  };
}

function sameStep(block: Block, step: StoryStep): boolean {
  return (
    block.position === step.position &&
    JSON.stringify(contentOf(block)) === JSON.stringify(contentOf(step))
  );
}

/** What of a step is its content: what a sync compares. */
export function contentOf(step: StoryStep) {
  return [
    step.type.number,
    step.text,
    step.checked,
    step.url,
    step.path,
    step.spans,
    step.tags,
    step.decoration,
    step.documentLink,
    step.steps,
  ];
}

// ---------------------------------------------------------------------------------------------
// The "/" popup

function slashHighlight(state: EditorState, offset: number, count: number): EditorState {
  if (!state.slash || count === 0) return state;
  const highlight = (((state.slash.highlight + offset) % count) + count) % count;
  return { ...state, slash: { ...state.slash, highlight } };
}

/** Runs a command of the popup: the slash and its filter leave the text first. */
function slashPick(state: EditorState, command: SlashCommand, now: Date): EditorState {
  const slash = state.slash;
  const found = slash ? find(state, slash.id) : null;
  if (!slash || !found) return { ...state, slash: null };

  const text = textOf(found.block);
  const start = slash.slashIndex;
  const end = Math.min(text.length, start + 1 + slash.filter.length);
  const closed = { ...state, slash: null };

  if (command.effect.kind === "insert") {
    const inserted = command.effect.text(now);
    const next = input(
      closed,
      slash.id,
      text.slice(0, start) + inserted + text.slice(end),
      start + inserted.length,
    );
    return { ...next, slash: null, focusRequest: next.focusRequest + 1 };
  }

  const rest = text.slice(0, start) + text.slice(end);
  const block: Block = {
    ...found.block,
    text: rest,
    spans: adjustSpans(found.block.spans, text, rest, start),
  };
  return applyEffect(closed, found.position, block, command.effect, start);
}
