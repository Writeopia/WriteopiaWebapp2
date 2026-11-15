import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isRank,
  RANK_FIRST,
  rankAfter,
  rankAt,
  rankBefore,
  rankBetween,
  rankConfig,
  ranksBetween,
} from "./rank";

// Ported from RankTest in Writeopia/writeopia/src/commonTest/.../MapOperationsTest.kt.
describe("Rank", () => {
  beforeEach(() => {
    rankConfig.jitter = false;
  });

  afterEach(() => {
    rankConfig.jitter = true;
  });

  it("ranks written in order are consecutive integers", () => {
    expect(RANK_FIRST).toBe("0001000000");
    expect(rankAt(0)).toBe(RANK_FIRST);
    expect(rankAfter(RANK_FIRST)).toBe("0001000001");
    expect(rankAfter(rankAt(1))).toBe(rankAt(2));
    expect(rankBefore(RANK_FIRST)).toBe("0000999999");
  });

  it("a rank between two is strictly between them", () => {
    const a = rankAt(1);
    const b = rankAt(2);

    const middle = rankBetween(a, b);
    expect(a < middle && middle < b).toBe(true);
    expect(middle).toBe("0001000001i");

    const closer = rankBetween(middle, b);
    expect(middle < closer && closer < b).toBe(true);

    const back = rankBetween(a, middle);
    expect(a < back && back < middle).toBe(true);
  });

  it("a rank between far apart integers is the next integer", () => {
    expect(rankBetween(rankAt(0), rankAt(5))).toBe(rankAt(1));
  });

  it("fractions never end with a zero and keep growing room", () => {
    let low = rankAt(0);
    const high = rankAt(1);

    for (let i = 0; i < 500; i++) {
      const next = rankBetween(low, high);
      expect(low < next && next < high, `${low} < ${next} < ${high}`).toBe(true);
      expect(next.endsWith("0")).toBe(false);
      low = next;
    }
  });

  it("there is always room when inserting at the same spot from the other side", () => {
    const low = rankAt(0);
    let high = rankAt(1);

    for (let i = 0; i < 500; i++) {
      const next = rankBetween(low, high);
      expect(low < next && next < high, `${low} < ${next} < ${high}`).toBe(true);
      expect(next.endsWith("0")).toBe(false);
      high = next;
    }
  });

  it("jitter keeps the key between its neighbours", () => {
    rankConfig.jitter = true;

    for (let i = 0; i < 200; i++) {
      const key = rankBetween(rankAt(1), rankAt(2));
      expect(rankAt(1) < key && key < rankAt(2)).toBe(true);
      expect(isRank(key)).toBe(true);

      const tight = rankBetween("0001000001y", "0001000001z");
      expect("0001000001y" < tight && tight < "0001000001z", tight).toBe(true);
    }
  });

  it("without a bound on one side it goes before or after the other", () => {
    expect(rankBetween(null, null)).toBe(RANK_FIRST);
    expect(rankBetween(rankAt(3), null)).toBe(rankAt(4));
    expect(rankBetween(null, rankAt(3))).toBe(rankAt(2));
    expect(rankBetween(null, "0001000003i")).toBe(rankAt(3));
  });

  it("refuses ranks out of order", () => {
    expect(() => rankBetween(rankAt(2), rankAt(1))).toThrow();
    expect(() => rankBetween(rankAt(1), rankAt(1))).toThrow();
  });

  it("makes several ranks in order between two others", () => {
    const keys = ranksBetween(rankAt(1), rankAt(2), 4);

    expect(keys).toHaveLength(4);
    expect([rankAt(1), ...keys, rankAt(2)]).toEqual([rankAt(1), ...keys, rankAt(2)].sort());
    expect(new Set(keys).size).toBe(4);
  });

  it("tells ranks from other strings", () => {
    expect(isRank("0001000000")).toBe(true);
    expect(isRank("0001000000i")).toBe(true);
    expect(isRank("12")).toBe(false);
    expect(isRank("0001000000I")).toBe(false);
    expect(isRank("00010000000")).toBe(false);
  });
});
