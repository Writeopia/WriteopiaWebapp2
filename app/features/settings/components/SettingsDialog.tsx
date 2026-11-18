import { t } from "~/core/i18n";
import { Button, cn, Dialog } from "~/core/ui";

import {
  sectionLabels,
  SETTINGS_SECTIONS,
  type SettingsSection,
  useSettingsLocation,
} from "../sections";
import { AccountSection } from "./AccountSection";
import { AiSection } from "./AiSection";
import { AppearanceSection } from "./AppearanceSection";
import { TeamsSection } from "./TeamsSection";
import { WorkspaceSection } from "./WorkspaceSection";

const sectionContent: Record<SettingsSection, () => React.JSX.Element> = {
  account: AccountSection,
  appearance: AppearanceSection,
  ai: AiSection,
  workspace: WorkspaceSection,
  teams: TeamsSection,
};

/** The version of the app and the commit it was built from. */
export function appVersion(): string {
  return t("versionWithCommit", {
    version: import.meta.env.VITE_APP_VERSION,
    commit: import.meta.env.VITE_COMMIT_SHA,
  });
}

/**
 * The settings, over the page (SettingsDialog.kt): the sections on the left, the chosen one
 * next to them, the version at the bottom. Which section shows is in `?settings=`.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { section, goTo } = useSettingsLocation();
  const Content = sectionContent[section];

  return (
    <Dialog open onClose={onClose} title={t("settings")} size="lg">
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <nav aria-label={t("settingsSections")} className="shrink-0 md:w-44">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {SETTINGS_SECTIONS.map((each) => (
              <li key={each}>
                <button
                  type="button"
                  aria-current={each === section ? "page" : undefined}
                  onClick={() => goTo(each)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm whitespace-nowrap",
                    each === section
                      ? "bg-selected-bg font-medium text-on-bg"
                      : "hover:bg-options-selector",
                  )}
                >
                  {t(sectionLabels[each])}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-h-[60vh] min-h-[20rem] min-w-0 flex-1 overflow-y-auto pr-1">
          <Content />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-divider pt-4">
        <span className="text-xs text-text-lighter">{appVersion()}</span>
        <Button variant="secondary" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </Dialog>
  );
}
