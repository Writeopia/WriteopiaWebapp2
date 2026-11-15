import { useEffect } from "react";
import { create } from "zustand";

import {
  ACCENT_COLOR_KEY,
  type AccentColor,
  applyTheme,
  COLOR_THEME_KEY,
  type ColorTheme,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_COLOR_THEME,
  parseAccentColor,
  parseColorTheme,
  readPreference,
  writePreference,
} from "./theme";

type ThemeState = {
  colorTheme: ColorTheme;
  accentColor: AccentColor;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setAccentColor: (accentColor: AccentColor) => void;
};

const inBrowser = typeof window !== "undefined";

export const useThemeStore = create<ThemeState>((set, get) => ({
  // The page is prerendered at build time, where there is no storage to read.
  colorTheme: inBrowser ? parseColorTheme(readPreference(COLOR_THEME_KEY)) : DEFAULT_COLOR_THEME,
  accentColor: inBrowser
    ? parseAccentColor(readPreference(ACCENT_COLOR_KEY))
    : DEFAULT_ACCENT_COLOR,
  setColorTheme: (colorTheme) => {
    set({ colorTheme });
    writePreference(COLOR_THEME_KEY, colorTheme);
    applyTheme(colorTheme, get().accentColor);
  },
  setAccentColor: (accentColor) => {
    set({ accentColor });
    writePreference(ACCENT_COLOR_KEY, accentColor);
    applyTheme(get().colorTheme, accentColor);
  },
}));

/** Keeps the page in step with the system theme while the user's choice is "system". */
export function useSystemThemeSync(): void {
  const colorTheme = useThemeStore((state) => state.colorTheme);
  const accentColor = useThemeStore((state) => state.accentColor);

  useEffect(() => {
    applyTheme(colorTheme, accentColor);
    if (colorTheme !== "system") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(colorTheme, accentColor);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [colorTheme, accentColor]);
}
