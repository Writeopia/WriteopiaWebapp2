import { t } from "~/core/i18n";
import { ACCENT_COLORS, COLOR_THEMES } from "~/core/theme/theme";
import { useThemeStore } from "~/core/theme/useTheme";
import { cn } from "~/core/ui";

import { SettingsGroup } from "./parts";

const themeLabels = { light: "lightTheme", dark: "darkTheme", system: "systemTheme" } as const;
const accentLabels = {
  purple: "accentPurple",
  blue: "accentBlue",
  green: "accentGreen",
  orange: "accentOrange",
} as const;

/** The color theme and the accent color, kept by this browser. */
export function AppearanceSection() {
  const { colorTheme, accentColor, setColorTheme, setAccentColor } = useThemeStore();

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title={t("colorTheme")}>
        <div role="radiogroup" aria-label={t("colorTheme")} className="flex flex-wrap gap-2">
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
      </SettingsGroup>

      <SettingsGroup title={t("accentColor")}>
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
      </SettingsGroup>
    </div>
  );
}
