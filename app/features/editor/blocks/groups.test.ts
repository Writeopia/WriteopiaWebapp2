import { describe, expect, it } from "vitest";

import { StoryTypes, Tags } from "~/core/models";

import { newBlock } from "../state/blocks";
import { groupParts, rowClasses, selectionParts } from "./groups";

const line = (id: string, tag?: string) =>
  newBlock(StoryTypes.TEXT, { id, tags: tag ? [{ tag, position: 0 }] : [] });

const classes = (value: string) => value.split(" ");

describe("rowClasses", () => {
  it("rounds only the outer corners of a card, as the Kotlin SDK does", () => {
    const blocks = ["a", "b", "c"].map((id) => line(id, Tags.CARD_BLOCK));
    const [top, middle, bottom] = groupParts(blocks).map((part) => classes(rowClasses(part)));

    expect(top).toContain("rounded-t-lg");
    expect(top).not.toContain("rounded-b-lg");
    expect(middle!.some((each) => each.startsWith("rounded"))).toBe(false);
    expect(bottom).toContain("rounded-b-lg");
    expect(bottom).not.toContain("rounded-t-lg");
  });

  it("gives a row of a box one margin, one padding and one background", () => {
    const blocks = ["a", "b"].map((id) => line(id, Tags.HIGH_LIGHT_BLOCK));
    const row = classes(rowClasses(groupParts(blocks)[0]!, { first: true, last: true }));

    expect(row.filter((each) => /^-?mx-/.test(each))).toEqual(["mx-0"]);
    expect(row.filter((each) => each.startsWith("px-"))).toEqual(["px-3"]);
    expect(row.filter((each) => each.startsWith("bg-"))).toEqual(["bg-selected-bg"]);
  });

  it("draws a run of selected lines as one block", () => {
    const blocks = ["a", "b", "c", "d"].map((id) => line(id));
    const rows = selectionParts(blocks, new Set(["a", "b", "c"])).map((part) =>
      classes(rowClasses(null, part)),
    );

    expect(rows[0]).toEqual(expect.arrayContaining(["bg-selected-bg", "rounded-t-md"]));
    expect(rows[0]).not.toContain("rounded-b-md");
    expect(rows[1]!.some((each) => each.startsWith("rounded"))).toBe(false);
    expect(rows[2]).toContain("rounded-b-md");
    expect(rows[3]).not.toContain("bg-selected-bg");
  });
});

describe("selectionParts", () => {
  it("ends a run of selected lines where a box starts", () => {
    const blocks = [line("a"), line("b", Tags.HIGH_LIGHT_BLOCK), line("c")];
    expect(selectionParts(blocks, new Set(["a", "b", "c"]))).toEqual([
      { first: true, last: true },
      { first: true, last: true },
      { first: true, last: true },
    ]);
  });
});
