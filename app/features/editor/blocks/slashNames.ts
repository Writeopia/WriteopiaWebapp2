import { type StringKey, t } from "~/core/i18n";

import type { SlashCommandId } from "../state/commands";

const NAMES: Record<SlashCommandId, [StringKey, StringKey]> = {
  today: ["slashToday", "slashTodayDescription"],
  now: ["slashNow", "slashNowDescription"],
  checkbox: ["slashCheckbox", "slashCheckboxDescription"],
  list: ["slashList", "slashListDescription"],
  box: ["slashBox", "slashBoxDescription"],
  card: ["slashCard", "slashCardDescription"],
  divider: ["slashDivider", "slashDividerDescription"],
};

export function slashName(id: SlashCommandId): string {
  return t(NAMES[id][0]);
}

export function slashDescription(id: SlashCommandId): string {
  return t(NAMES[id][1]);
}
