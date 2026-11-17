import { generateId } from "~/core/id";
import {
  isStoryType,
  type StoryStep,
  type StoryType,
  StoryTypes,
  type Tag,
  Tags,
  TITLE_TAGS,
} from "~/core/models";
import { RANK_FIRST } from "~/core/rank/rank";

import type { Block } from "./types";

/** What each kind of step is for the editor. */

/** Steps written in with the keyboard. */
const TEXT_TYPES: ReadonlySet<number> = new Set(
  (["TEXT", "TITLE", "CHECK_ITEM", "UNORDERED_LIST_ITEM", "CODE_BLOCK", "TEXT_BOX"] as const).map(
    (key) => StoryTypes[key].number,
  ),
);

export function isTextBlock(step: Pick<StoryStep, "type">): boolean {
  return TEXT_TYPES.has(step.type.number);
}

export function isTitle(step: Pick<StoryStep, "type">): boolean {
  return isStoryType(step.type, "TITLE");
}

export function isCodeBlock(step: Pick<StoryStep, "type">): boolean {
  return isStoryType(step.type, "CODE_BLOCK");
}

/** Checkboxes and bullet list items: Enter continues them. */
export function isListLike(step: Pick<StoryStep, "type">): boolean {
  return isStoryType(step.type, "CHECK_ITEM") || isStoryType(step.type, "UNORDERED_LIST_ITEM");
}

export function hasTag(step: Pick<StoryStep, "tags">, tag: string): boolean {
  return step.tags.some((info) => info.tag === tag);
}

/** 1 to 4 for a heading, null for any other block. */
export function headingLevel(step: Pick<StoryStep, "tags">): number | null {
  const index = TITLE_TAGS.findIndex((tag) => hasTag(step, tag));
  return index === -1 ? null : index + 1;
}

export function isHeadingTag(tag: string): boolean {
  return (TITLE_TAGS as readonly string[]).includes(tag);
}

/** Tags that Backspace at the start of a line takes away before merging it. */
export function isErasableTag(tag: string): boolean {
  return isHeadingTag(tag) || tag === Tags.HIGH_LIGHT_BLOCK || tag === Tags.CARD_BLOCK;
}

/** The type a line made by Enter gets: lists continue, the title starts a paragraph. */
export function lineBreakType(type: StoryType): StoryType {
  if (type.number === StoryTypes.TITLE.number) return StoryTypes.TEXT;
  if (type.number === StoryTypes.CHECK_ITEM.number) return StoryTypes.CHECK_ITEM;
  if (type.number === StoryTypes.UNORDERED_LIST_ITEM.number) return StoryTypes.UNORDERED_LIST_ITEM;
  return StoryTypes.TEXT;
}

/** A new step with a fresh id; its position is set when it is placed. */
export function newBlock(type: StoryType, fields: Partial<Block> = {}): Block {
  return {
    id: generateId(),
    type,
    parentId: null,
    url: null,
    path: null,
    text: isTextLike(type) ? "" : null,
    checked: type.number === StoryTypes.CHECK_ITEM.number ? false : null,
    steps: [],
    tags: [],
    spans: [],
    decoration: { backgroundColor: null },
    position: RANK_FIRST,
    documentLink: null,
    lastUpdatedAt: null,
    ...fields,
  };
}

function isTextLike(type: StoryType): boolean {
  return TEXT_TYPES.has(type.number);
}

/** The block as the type [type]: the checkbox state only belongs to checkboxes. */
export function withType(block: Block, type: StoryType): Block {
  const checked =
    type.number === StoryTypes.CHECK_ITEM.number ? (block.checked ?? false) : null;
  return { ...block, type, checked, text: block.text ?? (isTextLike(type) ? "" : null) };
}

export function withTag(block: Block, tag: Tag, on: boolean): Block {
  const without = block.tags.filter((info) => info.tag !== tag);
  return { ...block, tags: on ? [...without, { tag, position: 0 }] : without };
}

/** The block as a heading of [tag]'s level; null for a paragraph. */
export function withHeading(block: Block, tag: Tag | null): Block {
  const tags = block.tags.filter((info) => !isHeadingTag(info.tag));
  return { ...block, tags: tag ? [...tags, { tag, position: 0 }] : tags };
}

export function textOf(block: Pick<StoryStep, "text">): string {
  return block.text ?? "";
}
