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

export function groupClasses(part: GroupPart): string | false {
  if (!part) return false;
  const shape = cn(
    "mx-0 px-3",
    part.first && "mt-1 rounded-t-lg pt-2",
    part.last && "mb-1 rounded-b-lg pb-2",
  );
  return part.kind === "box"
    ? cn(shape, "bg-highlight/60")
    : cn(
        shape,
        "border-x border-card-border bg-card-bg",
        part.first && "border-t",
        part.last && "border-b",
      );
}
