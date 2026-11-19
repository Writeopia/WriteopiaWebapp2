const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * How long ago [at] was, in words: "now", "5 minutes ago", "yesterday", "last week". Like
 * `.relative(presentation: .named)` of the Swift app, in the largest unit that fits.
 */
export function relativeTime(at: number, now: number = Date.now()): string {
  const diff = at - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return format.format(Math.round(diff / size), unit);
  }
  return format.format(Math.round(diff / SECOND), "second");
}
