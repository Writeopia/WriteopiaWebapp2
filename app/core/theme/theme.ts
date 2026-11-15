/**
 * The color theme and the accent color: what the user picked, how it resolves, and where it is
 * kept. Mirrors ColorThemeOption and AccentColor of the Compose app. The preferences live in
 * localStorage, per browser.
 */

export const COLOR_THEMES = ["light", "dark", "system"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];
export type ResolvedTheme = "light" | "dark";

export const ACCENT_COLORS = ["purple", "blue", "green", "orange"] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "system";
export const DEFAULT_ACCENT_COLOR: AccentColor = "purple";

export const COLOR_THEME_KEY = "writeopia.colorTheme";
export const ACCENT_COLOR_KEY = "writeopia.accentColor";

export function parseColorTheme(value: string | null | undefined): ColorTheme {
  return COLOR_THEMES.find((theme) => theme === value) ?? DEFAULT_COLOR_THEME;
}

/** Unknown values, and the "dynamic" accent the other apps have, fall back to the default. */
export function parseAccentColor(value: string | null | undefined): AccentColor {
  return ACCENT_COLORS.find((accent) => accent === value) ?? DEFAULT_ACCENT_COLOR;
}

export function resolveTheme(colorTheme: ColorTheme, systemIsDark: boolean): ResolvedTheme {
  if (colorTheme === "system") return systemIsDark ? "dark" : "light";
  return colorTheme;
}

export function systemIsDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Reads a preference; storage can be unavailable (private mode, blocked site data). */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The choice still applies to this page; it just is not remembered.
  }
}

export function applyTheme(colorTheme: ColorTheme, accentColor: AccentColor): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(colorTheme, systemIsDark());
  root.dataset.accent = accentColor;
}

/**
 * Runs in <head> before the first paint, so the page never flashes in the wrong theme. It is a
 * string because it has to run before the app's JavaScript loads; it repeats the rules above.
 */
export const themeInitScript = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(COLOR_THEME_KEY)});
var a=localStorage.getItem(${JSON.stringify(ACCENT_COLOR_KEY)});
var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.dataset.theme=d?"dark":"light";
r.dataset.accent=${JSON.stringify(ACCENT_COLORS)}.indexOf(a)>=0?a:${JSON.stringify(DEFAULT_ACCENT_COLOR)};
}catch(e){}})();`;
