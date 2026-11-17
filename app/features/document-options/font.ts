import { create } from "zustand";

import { readPreference, writePreference } from "~/core/storage";

/** The font of the editor's text (Font.kt). A preference of this browser, like the theme. */

export const FONTS = ["System", "Serif", "Monospace", "Cursive"] as const;
export type EditorFont = (typeof FONTS)[number];

export const FONT_KEY = "writeopia.editorFont";

export function parseFont(value: string | null | undefined): EditorFont {
  return FONTS.find((font) => font === value) ?? "System";
}

const FAMILIES: Record<EditorFont, string> = {
  System: "inherit",
  Serif: 'Georgia, "Times New Roman", serif',
  Monospace: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  Cursive: '"Comic Sans MS", "Segoe Print", cursive',
};

/** The CSS font-family of [font], for the --wr-editor-font variable of the editor. */
export function fontFamily(font: EditorFont): string {
  return FAMILIES[font];
}

type FontPreference = {
  font: EditorFont;
  setFont: (font: EditorFont) => void;
  /** Reads the stored value again. For tests, which clear the storage between them. */
  reload: () => void;
};

const inBrowser = typeof window !== "undefined";

function stored(): EditorFont {
  // The page is prerendered at build time, where there is no storage to read.
  return parseFont(inBrowser ? readPreference(FONT_KEY) : null);
}

export const useEditorFont = create<FontPreference>((set) => ({
  font: stored(),
  setFont: (font) => {
    set({ font });
    writePreference(FONT_KEY, font);
  },
  reload: () => set({ font: stored() }),
}));
