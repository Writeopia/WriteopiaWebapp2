import type { StoryStep } from "~/core/models";

/**
 * The header of a document lives in its title step: a color in `decoration.backgroundColor`,
 * or a picture in `url`. The two never go together; a picture wins over a color written by an
 * older app (HeaderDrawer.kt).
 */

export type Header =
  { kind: "none" } | { kind: "color"; color: number } | { kind: "picture"; url: string };

export function headerOf(title: Pick<StoryStep, "url" | "decoration">): Header {
  const url = title.url?.trim();
  if (url) return { kind: "picture", url };
  const color = title.decoration.backgroundColor;
  if (color !== null) return { kind: "color", color };
  return { kind: "none" };
}

/** The title with [color] as its header, or with no header at all for null. */
export function withHeaderColor<T extends StoryStep>(title: T, color: number | null): T {
  return { ...title, url: null, decoration: { ...title.decoration, backgroundColor: color } };
}

export function withHeaderPicture<T extends StoryStep>(title: T, url: string): T {
  return { ...title, url, decoration: { ...title.decoration, backgroundColor: null } };
}

/**
 * The colors of the header, as ColorUtils.headerColors() gives them: White, Black, Blue, Gray,
 * Yellow, Red, Green, Magenta, DarkGray and Cyan of Compose, as ARGB integers.
 */
export const HEADER_COLORS: readonly number[] = [
  0xffffffff, 0xff000000, 0xff0000ff, 0xff888888, 0xffffff00, 0xffff0000, 0xff00ff00, 0xffff00ff,
  0xff444444, 0xff00ffff,
].map((argb) => argb | 0);

/** Whether light text reads better than dark text over [argb]. */
export function isDarkColor(argb: number): boolean {
  const value = argb >>> 0;
  const channel = (shift: number) => {
    const c = ((value >>> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance < 0.4;
}

// ---------------------------------------------------------------------------------------------
// The crop of a header picture: HeaderPictureCrop.kt, which the other apps share.

/** The picture is sampled on a grid of about this many rows and columns, whatever its size. */
const SAMPLED_ROWS = 384;
const SAMPLED_COLUMNS = 336;
/** A row holds drawing when it is sharper than this share of the sharp rows of the picture. */
const SHARE_OF_SHARP = 0.3;
/** Below this sharpness the whole picture is flat (a gradient, a plain color): no bands. */
const FLAT = 0.5;
/** A strip shorter than this share of the picture is a wrong guess: the whole picture is used. */
const MIN_STRIP = 0.2;

/** Rows of a picture, from [top] to the one before [bottom]. */
export type Rows = { top: number; bottom: number };

/**
 * The rows of a header picture that hold the drawing. The image model paints a wide scene across
 * the middle and fills the rest with blurred bands; those change little from one pixel to the
 * next, the drawing changes a lot. [luma] gives the brightness of a pixel, 0..255.
 */
export function contentRows(
  width: number,
  height: number,
  luma: (x: number, y: number) => number,
): Rows {
  const whole = { top: 0, bottom: height };
  if (width < 2 || height < 2) return whole;

  const rowStep = Math.max(1, Math.floor(height / SAMPLED_ROWS));
  const columnStep = Math.max(1, Math.floor(width / SAMPLED_COLUMNS));
  const rows: number[] = [];
  for (let y = 0; y < height; y += rowStep) rows.push(y);

  const sharpness = rows.map((y) => {
    let sum = 0;
    let count = 0;
    for (let x = columnStep; x < width; x += columnStep) {
      sum += Math.abs(luma(x, y) - luma(x - columnStep, y));
      count++;
    }
    return count === 0 ? 0 : sum / count;
  });

  const sorted = [...sharpness].sort((a, b) => a - b);
  const reference = sorted[Math.floor(((sorted.length - 1) * 9) / 10)]!;
  if (reference < FLAT) return whole;

  const threshold = reference * SHARE_OF_SHARP;
  const first = sharpness.findIndex((value) => value > threshold);
  const last = sharpness.findLastIndex((value) => value > threshold);
  if (first < 0) return whole;

  const top = rows[first]!;
  const bottom = Math.min(height, rows[last]! + rowStep);
  if (bottom - top < height * MIN_STRIP) return whole;

  return { top, bottom };
}

export type Size = { width: number; height: number };

/** How a picture is drawn in a band: the whole picture scaled by [scale], moved by x and y. */
export type Placement = { scale: number; x: number; y: number };

/**
 * Where to draw a picture of [picture] size in a band of [band] size so that its rows [strip]
 * cover the band, centered, with the proportions kept: what spills over the band is cropped.
 */
export function coverPlacement(picture: Size, strip: Rows, band: Size): Placement {
  const stripHeight = strip.bottom - strip.top;
  const scale = Math.max(band.width / picture.width, band.height / stripHeight);
  return {
    scale,
    x: (band.width - picture.width * scale) / 2,
    y: band.height / 2 - (strip.top + stripHeight / 2) * scale,
  };
}
