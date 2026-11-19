import { describe, expect, it } from "vitest";

import { relativeTime } from "./relativeTime";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says how long ago in the largest unit that fits", () => {
    expect(relativeTime(NOW, NOW)).toBe("now");
    expect(relativeTime(NOW - 5 * MINUTE, NOW)).toBe("5 minutes ago");
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe("3 hours ago");
    expect(relativeTime(NOW - DAY, NOW)).toBe("yesterday");
    expect(relativeTime(NOW - 3 * DAY, NOW)).toBe("3 days ago");
    expect(relativeTime(NOW - 14 * DAY, NOW)).toBe("2 weeks ago");
    expect(relativeTime(NOW - 400 * DAY, NOW)).toBe("last year");
  });
});
