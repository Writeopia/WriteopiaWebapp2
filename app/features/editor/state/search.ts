import type { Decoration } from "../dom/spansToDom";
import { textOf } from "./blocks";
import { ordered } from "./reducer";
import type { EditorState } from "./types";

/** Find in document (FindInText.kt, InDocumentSearchBar.kt): every match, whatever the case. */

export type Match = { id: string; start: number; end: number };

export function findMatches(state: EditorState, query: string): Match[] {
  const needle = query.toLowerCase();
  if (needle === "") return [];

  const matches: Match[] = [];
  for (const block of ordered(state)) {
    const haystack = textOf(block).toLowerCase();
    for (
      let at = haystack.indexOf(needle);
      at !== -1;
      at = haystack.indexOf(needle, at + needle.length)
    ) {
      matches.push({ id: block.id, start: at, end: at + needle.length });
    }
  }
  return matches;
}

/** The matches of each block, drawn over its text; the current one stands out. */
export function decorationsByBlock(matches: Match[], current: number): Map<string, Decoration[]> {
  const byBlock = new Map<string, Decoration[]>();
  matches.forEach((match, index) => {
    const list = byBlock.get(match.id) ?? [];
    list.push({ start: match.start, end: match.end, active: index === current });
    byBlock.set(match.id, list);
  });
  return byBlock;
}
