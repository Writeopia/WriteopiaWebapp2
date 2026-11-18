import { describe, expect, it } from "vitest";

import { highlightPieces, matchRanges, queryTokens, snippetWindow } from "./snippet";

describe("the words of a query", () => {
  it("splits on anything but letters and digits, lowercased", () => {
    expect(queryTokens("  Café, au-LAIT 2024! ")).toEqual(["café", "au", "lait", "2024"]);
    expect(queryTokens("!!")).toEqual([]);
  });
});

describe("the matches", () => {
  it("finds every word, ignoring case, in order and without overlaps", () => {
    expect(matchRanges("Plan the plants", "PLAN plant")).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 14 },
    ]);
  });

  it("cuts a long text around the first match, with ellipses", () => {
    const text = `${"a ".repeat(60)}needle ${"b ".repeat(60)}`;
    const window = snippetWindow(text, "needle", 40);

    expect(window.startsWith("…")).toBe(true);
    expect(window.endsWith("…")).toBe(true);
    expect(window).toContain("needle");
    expect(window.length).toBeLessThanOrEqual(42);
  });

  it("keeps a short text whole, on one line", () => {
    expect(snippetWindow("line one\nline two", "two")).toBe("line one line two");
  });

  it("splits the text into plain and matched pieces", () => {
    expect(highlightPieces("Grocery list", "list")).toEqual([
      { text: "Grocery ", match: false },
      { text: "list", match: true },
    ]);
    expect(highlightPieces("Nothing", "")).toEqual([{ text: "Nothing", match: false }]);
  });
});
