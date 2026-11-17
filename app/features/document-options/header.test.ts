import { describe, expect, it } from "vitest";

import { StoryTypes } from "~/core/models";

import { aStep } from "../../../test/fixtures";
import {
  contentRows,
  coverPlacement,
  HEADER_COLORS,
  headerOf,
  isDarkColor,
  withHeaderColor,
  withHeaderPicture,
} from "./header";

const title = aStep({ id: "title", type: StoryTypes.TITLE, text: "Trip" });
const RED = -65536;

describe("header", () => {
  it("is none without a color or a picture", () => {
    expect(headerOf(title)).toEqual({ kind: "none" });
  });

  it("is a color when the title has a background color", () => {
    expect(headerOf(withHeaderColor(title, RED))).toEqual({ kind: "color", color: RED });
  });

  it("is a picture when the title has an address, over any color", () => {
    const both = { ...title, url: "https://cdn/a.png", decoration: { backgroundColor: RED } };
    expect(headerOf(both)).toEqual({ kind: "picture", url: "https://cdn/a.png" });
  });

  it("takes a blank address for no picture", () => {
    expect(headerOf({ ...title, url: "  " })).toEqual({ kind: "none" });
  });

  it("clears the picture when a color is picked", () => {
    const picture = withHeaderPicture(title, "https://cdn/a.png");
    const colored = withHeaderColor(picture, RED);
    expect(colored.url).toBeNull();
    expect(colored.decoration.backgroundColor).toBe(RED);
  });

  it("clears the color when a picture is picked", () => {
    const pictured = withHeaderPicture(withHeaderColor(title, RED), "https://cdn/a.png");
    expect(pictured.url).toBe("https://cdn/a.png");
    expect(pictured.decoration.backgroundColor).toBeNull();
  });

  it("removes both with no color", () => {
    const none = withHeaderColor(withHeaderPicture(title, "https://cdn/a.png"), null);
    expect(headerOf(none)).toEqual({ kind: "none" });
  });

  it("offers the palette of the other apps", () => {
    // White, Black, Blue, Gray, Yellow, Red, Green, Magenta, DarkGray, Cyan of Compose.
    expect(HEADER_COLORS).toEqual([
      -1, -16777216, -16776961, -7829368, -256, -65536, -16711936, -65281, -12303292, -16711681,
    ]);
  });

  it("reads which colors are dark, for the title over them", () => {
    expect(isDarkColor(-16777216)).toBe(true);
    expect(isDarkColor(-16776961)).toBe(true);
    expect(isDarkColor(-1)).toBe(false);
    expect(isDarkColor(-256)).toBe(false);
  });
});

describe("header picture crop", () => {
  /** A picture with blurred bands above and below a sharp stripe pattern. */
  function banded(height: number, top: number, bottom: number) {
    return (x: number, y: number) => (y >= top && y < bottom ? (x % 2) * 200 : 100);
  }

  it("finds the rows of the drawing between blurred bands", () => {
    const rows = contentRows(400, 400, banded(400, 100, 300));
    expect(rows.top).toBeGreaterThanOrEqual(95);
    expect(rows.top).toBeLessThanOrEqual(105);
    expect(rows.bottom).toBeGreaterThanOrEqual(295);
    expect(rows.bottom).toBeLessThanOrEqual(305);
  });

  it("keeps the whole picture when it is flat", () => {
    expect(contentRows(400, 400, () => 120)).toEqual({ top: 0, bottom: 400 });
  });

  it("keeps the whole picture when the strip is too thin to be right", () => {
    expect(contentRows(400, 400, banded(400, 200, 220))).toEqual({ top: 0, bottom: 400 });
  });

  it("covers the band with the strip, centered", () => {
    // A 1000×1000 picture whose drawing is rows 250..750, in a 1000×230 band.
    const placement = coverPlacement(
      { width: 1000, height: 1000 },
      { top: 250, bottom: 750 },
      { width: 1000, height: 230 },
    );
    expect(placement.scale).toBe(1);
    expect(placement.x).toBe(0);
    // The middle of the strip (500) sits at the middle of the band (115).
    expect(placement.y).toBe(115 - 500);
  });

  it("scales up when the band is wider than the strip", () => {
    const placement = coverPlacement(
      { width: 500, height: 500 },
      { top: 0, bottom: 500 },
      { width: 1000, height: 200 },
    );
    expect(placement.scale).toBe(2);
    expect(placement.x).toBe(0);
    expect(placement.y).toBe(100 - 250 * 2);
  });
});
