import { Tags } from "~/core/models";
import { cn } from "~/core/ui";

import { hasTag } from "../state/blocks";
import type { Block } from "../state/types";

type GroupKind = "box" | "card";

/**
 * Box and card decorations draw one container around the consecutive blocks that have them.
 * Each row draws its own part (top, middle, bottom), so a block leaving or joining a group is
 * never drawn again from scratch and keeps the caret.
 */
export type GroupPart = { kind: GroupKind; first: boolean; last: boolean } | null;

function kindOf(block: Block): GroupKind | null {
  if (hasTag(block, Tags.HIGH_LIGHT_BLOCK)) return "box";
  if (hasTag(block, Tags.CARD_BLOCK)) return "card";
  return null;
}

export function groupParts(blocks: Block[]): GroupPart[] {
  return blocks.map((block, index) => {
    const kind = kindOf(block);
    if (!kind) return null;
    const before = blocks[index - 1];
    const after = blocks[index + 1];
    return {
      kind,
      first: !before || kindOf(before) !== kind,
      last: !after || kindOf(after) !== kind,
    };
  });
}

/**
 * Where a selected line sits in its run of selected lines, which decides its round corners.
 * A run ends where a box or card starts or ends, since the rows there have another width.
 */
export type SelectionPart = { first: boolean; last: boolean } | null;

export function selectionParts(blocks: Block[], selectedIds: ReadonlySet<string>): SelectionPart[] {
  return blocks.map((block, index) => {
    if (!selectedIds.has(block.id)) return null;
    const before = blocks[index - 1];
    const after = blocks[index + 1];
    const joins = (other: Block | undefined) =>
      other !== undefined && selectedIds.has(other.id) && kindOf(other) === kindOf(block);
    return { first: !joins(before), last: !joins(after) };
  });
}

/**
 * The shape of a row: its margin, padding, corners and background. Only the outer corners of
 * a group or of a run of selected lines are round, as DefaultTagDecoration of the Kotlin SDK
 * does, so the lines in the middle join the ones around them with no seam. Each row gets one
 * of each property, never two that fight over it.
 */
export function rowClasses(group: GroupPart, selection: SelectionPart = null): string {
  if (!group) {
    return cn(
      "-mx-2 px-2",
      selection && "bg-selected-bg",
      selection?.first && "rounded-t-md",
      selection?.last && "rounded-b-md",
    );
  }
  const shape = cn(
    "mx-0 px-3",
    group.first && "mt-1 rounded-t-lg pt-2",
    group.last && "mb-1 rounded-b-lg pb-2",
  );
  if (group.kind === "box") return cn(shape, selection ? "bg-selected-bg" : "bg-highlight/60");
  return cn(
    shape,
    "border-x border-card-border",
    selection ? "bg-selected-bg" : "bg-card-bg",
    group.first && "border-t",
    group.last && "border-b",
  );
}
