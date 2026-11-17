import { type StoryType, StoryTypes, type Tag, Tags } from "~/core/models";

import type { SlashInput } from "./types";

/**
 * Markdown-like commands typed at the start of a line (CommandFactory.kt, TextCommands.swift)
 * and the "/" popup (SlashCommandPopup.kt, SlashCommands.swift).
 */

export type LineCommandEffect =
  { kind: "type"; type: StoryType } | { kind: "heading"; tag: Tag } | { kind: "tag"; tag: Tag };

export type LineCommand = { text: string; effect: LineCommandEffect };

/**
 * The commands. The ones ending in a space fire on that space, so that "#" can still become
 * "##"; the others fire as soon as their last character is typed.
 */
export const LINE_COMMANDS: readonly LineCommand[] = [
  { text: "#### ", effect: { kind: "heading", tag: Tags.H4 } },
  { text: "### ", effect: { kind: "heading", tag: Tags.H3 } },
  { text: "## ", effect: { kind: "heading", tag: Tags.H2 } },
  { text: "# ", effect: { kind: "heading", tag: Tags.H1 } },
  { text: "-[]", effect: { kind: "type", type: StoryTypes.CHECK_ITEM } },
  { text: "[]", effect: { kind: "type", type: StoryTypes.CHECK_ITEM } },
  { text: "- ", effect: { kind: "type", type: StoryTypes.UNORDERED_LIST_ITEM } },
  { text: "```", effect: { kind: "type", type: StoryTypes.CODE_BLOCK } },
  { text: "---", effect: { kind: "type", type: StoryTypes.DIVIDER } },
  { text: "/box", effect: { kind: "tag", tag: Tags.HIGH_LIGHT_BLOCK } },
  { text: "/card", effect: { kind: "tag", tag: Tags.CARD_BLOCK } },
];

/**
 * The command just completed at the start of [text]: the caret must be right after it, which
 * is where it is when its last character was the one typed. A command that does not end in
 * a space must stand alone or be followed by one, like TextCommandHandler: "---" typed before
 * "hello" is text.
 */
export function lineCommandAt(text: string, cursor: number): LineCommand | null {
  return (
    LINE_COMMANDS.find(
      (command) =>
        cursor === command.text.length &&
        text.startsWith(command.text) &&
        (command.text.endsWith(" ") ||
          text.length === command.text.length ||
          text[command.text.length] === " "),
    ) ?? null
  );
}

export type SlashCommandId = "today" | "now" | "checkbox" | "list" | "box" | "card" | "divider";

export type SlashCommand = {
  id: SlashCommandId;
  /** What filters the popup, with its slash. */
  command: string;
  effect: { kind: "insert"; text: (now: Date) => string } | LineCommandEffect;
};

/** "/today" writes the short date of the locale, "/now" adds the time as HH:mm. */
export function formatToday(now: Date): string {
  return now.toLocaleDateString();
}

export function formatNow(now: Date): string {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `${formatToday(now)} ${time}`;
}

/** In the order of the other apps. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: "today", command: "/today", effect: { kind: "insert", text: formatToday } },
  { id: "now", command: "/now", effect: { kind: "insert", text: formatNow } },
  { id: "checkbox", command: "/checkbox", effect: { kind: "type", type: StoryTypes.CHECK_ITEM } },
  {
    id: "list",
    command: "/list",
    effect: { kind: "type", type: StoryTypes.UNORDERED_LIST_ITEM },
  },
  { id: "box", command: "/box", effect: { kind: "tag", tag: Tags.HIGH_LIGHT_BLOCK } },
  { id: "card", command: "/card", effect: { kind: "tag", tag: Tags.CARD_BLOCK } },
  { id: "divider", command: "/divider", effect: { kind: "type", type: StoryTypes.DIVIDER } },
];

/**
 * The commands offered for what was typed after the slash: the ones whose command contains
 * it, whatever the case. [names] are the translated names, also searched.
 */
export function filterSlashCommands(
  filter: string,
  names: (id: SlashCommandId) => string = () => "",
): SlashCommand[] {
  const query = filter.toLowerCase();
  return SLASH_COMMANDS.filter(
    (command) =>
      query === "" ||
      command.command.toLowerCase().includes(query) ||
      names(command.id).toLowerCase().includes(query),
  );
}

/**
 * Follows the "/" command through an edit of a block, like the slash detection of TextDrawer:
 * a "/" typed at the start of the text or after a space opens it, what is typed after it
 * filters the commands, and a space, a line break or deleting the slash closes it.
 */
export function detectSlash(
  current: SlashInput | null,
  id: string,
  oldText: string,
  newText: string,
  cursor: number,
): SlashInput | null {
  if (cursor < 0 || cursor > newText.length) return null;
  const open = current?.id === id ? current : null;
  const difference = newText.length - oldText.length;

  if (difference > 0 && newText[cursor - 1] === "/") {
    const before = newText[cursor - 2];
    if (before === undefined || before === " " || before === "\n") {
      return { id, slashIndex: cursor - 1, filter: "", highlight: 0 };
    }
  }
  if (!open) return null;
  if (difference < 0 && cursor <= open.slashIndex) return null;

  const start = open.slashIndex + 1;
  if (newText[open.slashIndex] !== "/" || cursor < start) return null;
  const filter = newText.slice(start, cursor);
  if (/[\s]/.test(filter)) return null;

  return { ...open, filter, highlight: filter === open.filter ? open.highlight : 0 };
}
