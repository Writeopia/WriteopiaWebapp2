import { useSearchParams } from "react-router";

import type { StringKey } from "~/core/i18n";

/**
 * Where the settings are, kept in the address (`?settings=<section>[/<page>...]`) so a page of
 * them can be linked to. Moving inside the dialog replaces the entry, so the back button
 * closes the dialog instead of walking through its pages.
 */

export const SETTINGS_PARAM = "settings";

export const SETTINGS_SECTIONS = ["account", "appearance", "ai", "workspace", "teams"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const sectionLabels: Record<SettingsSection, StringKey> = {
  account: "accountSection",
  appearance: "appearance",
  ai: "ai",
  workspace: "workspace",
  teams: "teams",
};

/**
 * A place in the settings:
 * - workspace: `header-images`, `tags`
 * - teams: `<workspaceId>` (its members), `<workspaceId>/add`, `<workspaceId>/user/<userId>`
 */
export type SettingsLocation = { section: SettingsSection; page: string[] };

/** Unknown sections open the account, like the side menu does. */
export function parseSettingsLocation(value: string | null): SettingsLocation {
  const [first = "", ...rest] = (value ?? "").split("/");
  const section = SETTINGS_SECTIONS.find((candidate) => candidate === first) ?? "account";
  const page = section === first ? rest.filter(Boolean).map(decodeURIComponent) : [];
  return { section, page };
}

export function settingsValue(section: SettingsSection, ...page: string[]): string {
  return [section, ...page.map(encodeURIComponent)].join("/");
}

/** The place the dialog shows, and a way to go elsewhere in it. */
export function useSettingsLocation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = parseSettingsLocation(searchParams.get(SETTINGS_PARAM));

  const goTo = (section: SettingsSection, ...page: string[]) =>
    setSearchParams(
      (params) => {
        params.set(SETTINGS_PARAM, settingsValue(section, ...page));
        return params;
      },
      { replace: true },
    );

  return { ...location, goTo };
}
