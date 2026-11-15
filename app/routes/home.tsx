import { useState } from "react";

import { type StringKey, t } from "~/core/i18n";
import { ACCENT_COLORS, type AccentColor, COLOR_THEMES, type ColorTheme } from "~/core/theme/theme";
import { useThemeStore } from "~/core/theme/useTheme";
import { Button, cn, Dialog, Menu, showToast } from "~/core/ui";

const themeLabels: Record<ColorTheme, StringKey> = {
  light: "lightTheme",
  dark: "darkTheme",
  system: "systemTheme",
};

const accentLabels: Record<AccentColor, StringKey> = {
  purple: "accentPurple",
  blue: "accentBlue",
  green: "accentGreen",
  orange: "accentOrange",
};

/**
 * Placeholder for the start of the app: it shows that the theme, the accent and the shared
 * components work. The session check that decides where to go replaces it in M1.
 */
export default function Home() {
  const { colorTheme, accentColor, setColorTheme, setAccentColor } = useThemeStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <img src="/icon.png" alt="" width={72} height={72} />
        <h1 className="text-3xl font-bold">{t("appName")}</h1>
        <p className="text-text-light">{t("tagline")}</p>
        <p className="text-sm text-text-lighter">{t("foundationReady")}</p>
      </header>

      <section className="flex w-full flex-col gap-5 rounded-lg border border-card-border bg-card-bg p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{t("colorTheme")}</legend>
          <div className="flex gap-2">
            {COLOR_THEMES.map((theme) => (
              <Button
                key={theme}
                variant={theme === colorTheme ? "primary" : "secondary"}
                aria-pressed={theme === colorTheme}
                onClick={() => setColorTheme(theme)}
              >
                {t(themeLabels[theme])}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{t("accentColor")}</legend>
          <div className="flex gap-3">
            {ACCENT_COLORS.map((accent) => (
              <button
                key={accent}
                type="button"
                data-accent={accent}
                aria-label={t(accentLabels[accent])}
                aria-pressed={accent === accentColor}
                onClick={() => setAccentColor(accent)}
                className={cn(
                  "size-9 rounded-full border-2 bg-accent",
                  accent === accentColor ? "border-on-bg" : "border-transparent",
                )}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => showToast(t("toastExample"))}>
            {t("showToast")}
          </Button>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            {t("openDialog")}
          </Button>
          <Menu
            trigger="⋯"
            label={t("moreOptions")}
            items={[
              { id: "toast", label: t("showToast"), onSelect: () => showToast(t("toastExample")) },
              { id: "dialog", label: t("openDialog"), onSelect: () => setDialogOpen(true) },
            ]}
          />
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t("dialogExampleTitle")}
        actions={<Button onClick={() => setDialogOpen(false)}>{t("ok")}</Button>}
      >
        {t("dialogExampleBody")}
      </Dialog>
    </main>
  );
}
