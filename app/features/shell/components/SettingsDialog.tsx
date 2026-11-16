import { Link } from "react-router";

import { t } from "~/core/i18n";
import { ACCENT_COLORS, COLOR_THEMES } from "~/core/theme/theme";
import { useThemeStore } from "~/core/theme/useTheme";
import { Button, cn, Dialog } from "~/core/ui";
import { paths } from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

const themeLabels = { light: "lightTheme", dark: "darkTheme", system: "systemTheme" } as const;
const accentLabels = {
  purple: "accentPurple",
  blue: "accentBlue",
  green: "accentGreen",
  orange: "accentOrange",
} as const;

/**
 * The settings, over the page. For now the account and the appearance; the other sections
 * come with the settings milestone.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { user, workspace } = useWorkspace();
  const logout = useLogout();
  const { colorTheme, accentColor, setColorTheme, setAccentColor } = useThemeStore();

  return (
    <Dialog open onClose={onClose} title={t("settings")}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="font-medium text-on-bg">{t("accountSection")}</h3>
          <p className="text-sm">
            {t("account", { name: user.name, tier: user.tier })} · {workspace.name}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link to={paths.workspaces} className="text-link underline">
              {t("changeWorkspace")}
            </Link>
            <Link to={paths.resetPassword} className="text-link underline">
              {t("resetPassword")}
            </Link>
            <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
              {logout.isPending ? t("signingOut") : t("logout")}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-medium text-on-bg">{t("appearance")}</h3>
          <div role="radiogroup" aria-label={t("colorTheme")} className="flex gap-2">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={colorTheme === theme}
                onClick={() => setColorTheme(theme)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  colorTheme === theme
                    ? "border-accent bg-selected-bg text-on-bg"
                    : "border-card-border hover:bg-options-selector",
                )}
              >
                {t(themeLabels[theme])}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label={t("accentColor")} className="flex gap-3">
            {ACCENT_COLORS.map((accent) => (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={accentColor === accent}
                aria-label={t(accentLabels[accent])}
                title={t(accentLabels[accent])}
                data-accent={accent}
                onClick={() => setAccentColor(accent)}
                className={cn(
                  "size-7 rounded-full bg-accent",
                  accentColor === accent && "ring-2 ring-accent ring-offset-2 ring-offset-card-bg",
                )}
              />
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
