import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCENT_COLOR_KEY,
  applyTheme,
  COLOR_THEME_KEY,
  parseAccentColor,
  parseColorTheme,
  resolveTheme,
  themeInitScript,
} from "./theme";
import { useThemeStore } from "./useTheme";

function setSystemDark(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: dark,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
});

describe("parsing preferences", () => {
  it("keeps known values", () => {
    expect(parseColorTheme("dark")).toBe("dark");
    expect(parseAccentColor("green")).toBe("green");
  });

  it("falls back to the defaults", () => {
    expect(parseColorTheme(null)).toBe("system");
    expect(parseColorTheme("sepia")).toBe("system");
    expect(parseAccentColor(undefined)).toBe("purple");
  });

  it("treats the dynamic accent of the other apps as the default", () => {
    expect(parseAccentColor("dynamic")).toBe("purple");
  });
});

describe("resolveTheme", () => {
  it("follows the system only when asked to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets the theme and the accent on the document", () => {
    setSystemDark(true);

    applyTheme("system", "orange");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("orange");
  });
});

describe("theme store", () => {
  it("applies and remembers a choice", () => {
    useThemeStore.getState().setColorTheme("dark");
    useThemeStore.getState().setAccentColor("blue");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("blue");
    expect(window.localStorage.getItem(COLOR_THEME_KEY)).toBe("dark");
    expect(window.localStorage.getItem(ACCENT_COLOR_KEY)).toBe("blue");
  });
});

describe("themeInitScript", () => {
  // The script is our own constant; running it is the only way to test what the page will run.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  const run = () => void new Function(themeInitScript)();

  it("applies the stored preferences before the app loads", () => {
    window.localStorage.setItem(COLOR_THEME_KEY, "dark");
    window.localStorage.setItem(ACCENT_COLOR_KEY, "green");

    run();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("green");
  });

  it("follows the system and the default accent when nothing is stored", () => {
    setSystemDark(false);

    run();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.accent).toBe("purple");
  });
});
