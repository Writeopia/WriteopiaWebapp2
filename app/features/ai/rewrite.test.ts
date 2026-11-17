import { describe, expect, it } from "vitest";

import { Spans, StoryTypes, Tags } from "~/core/models";
import { rankAt } from "~/core/rank/rank";
import { newBlock } from "~/features/editor/state/blocks";
import type { Block } from "~/features/editor/state/types";

import { answerBlocks } from "./blocks";
import { buildRewrite } from "./rewrite";

function at(index: number, block: Block): Block {
  return { ...block, position: rankAt(index) };
}

const text = (value: string, fields: Partial<Block> = {}) =>
  newBlock(StoryTypes.TEXT, { text: value, ...fields });

const spreadsheet = newBlock(StoryTypes.SPREADSHEET, { text: null });
const image = newBlock(StoryTypes.IMAGE, { text: null, url: "pic.png" });

const blocks: Block[] = [
  at(0, newBlock(StoryTypes.TITLE, { text: "Title" })),
  at(1, text("Intro", { tags: [{ tag: Tags.H2, position: 0 }] })),
  at(2, text("A paragraph.")),
  at(3, spreadsheet),
  at(4, newBlock(StoryTypes.CHECK_ITEM, { text: "Done", checked: true })),
  at(5, newBlock(StoryTypes.UNORDERED_LIST_ITEM, { text: "Item" })),
  at(6, newBlock(StoryTypes.CODE_BLOCK, { text: "fun a() {}\nfun b() {}" })),
  at(7, image),
  at(8, newBlock(StoryTypes.DIVIDER, { text: null })),
  at(9, { ...newBlock(StoryTypes.LOADING, { text: null }), ephemeral: true }),
  at(10, text("Last line.")),
];

function longDocument(): Block[] {
  return [
    at(0, newBlock(StoryTypes.TITLE, { text: "Title" })),
    ...Array.from({ length: 100 }, (_, index) => at(index + 1, text(`p${index + 1}`))),
  ];
}

describe("buildRewrite (DocumentRewrite.kt)", () => {
  it("sends the document as Markdown with placeholders for the blocks the AI cannot write", () => {
    const rewrite = buildRewrite(blocks, rankAt(2))!;

    expect(rewrite.ids[0]).toBe(blocks[1]!.id);
    expect(rewrite.markdown).toBe(
      [
        "## Intro",
        "A paragraph.",
        "[[writeopia-block-1]]",
        "- [x] Done",
        "- Item",
        "```",
        "fun a() {}",
        "fun b() {}",
        "```",
        "[[writeopia-block-2]]",
        "---",
        "Last line.",
      ].join("\n"),
    );
    expect(rewrite.ids).toHaveLength(9);
    expect(rewrite.keptInOrder.map((block) => block.id)).toEqual([spreadsheet.id, image.id]);
  });

  it("reads the answer back as blocks with the kept blocks in their place", () => {
    const rewrite = buildRewrite(blocks, null)!;

    const parsed = rewrite.parse(
      [
        "## Intro",
        "A **bold** paragraph.",
        "[[writeopia-block-1]]",
        "- [ ] Not done",
        "- Item",
        "```",
        "fun c() {}",
        "```",
        "[[writeopia-block-2]]",
        "---",
        "The last line, edited.",
        "",
      ].join("\n"),
    );

    const steps = parsed.blocks;
    expect(steps).toHaveLength(9);
    expect(steps[0]!.tags).toEqual([{ tag: Tags.H2, position: 0 }]);
    expect(steps[0]!.text).toBe("Intro");
    expect(steps[1]!.text).toBe("A bold paragraph.");
    expect(steps[1]!.spans.some((span) => span.span === Spans.BOLD)).toBe(true);
    expect(steps[2]!.id).toBe(spreadsheet.id);
    expect(steps[3]!.type).toEqual(StoryTypes.CHECK_ITEM);
    expect(steps[3]!.checked).toBe(false);
    expect(steps[3]!.text).toBe("Not done");
    expect(steps[4]!.type).toEqual(StoryTypes.UNORDERED_LIST_ITEM);
    expect(steps[5]!.type).toEqual(StoryTypes.CODE_BLOCK);
    expect(steps[5]!.text).toBe("fun c() {}");
    expect(steps[6]!.id).toBe(image.id);
    expect(steps[7]!.type).toEqual(StoryTypes.DIVIDER);
    expect(steps[8]!.text).toBe("The last line, edited.");
    expect(parsed.pending).toEqual([]);
  });

  it("leaves the blocks the answer forgets pending", () => {
    const parsed = buildRewrite(blocks, null)!.parse("Only text\n[[writeopia-block-2]]");

    expect(parsed.blocks.map((block) => block.text)).toEqual(["Only text", null]);
    expect(parsed.blocks[1]!.id).toBe(image.id);
    expect(parsed.pending.map((block) => block.id)).toEqual([spreadsheet.id]);
  });

  it("shows the code of a fence still open while the answer streams", () => {
    const parsed = buildRewrite(blocks, null)!.parse("Text\n```\nfun a()");

    expect(parsed.blocks[1]!.type).toEqual(StoryTypes.CODE_BLOCK);
    expect(parsed.blocks[1]!.text).toBe("fun a()");
  });

  it("cuts a long document to the paragraphs around the cursor", () => {
    const document = longDocument();
    const rewrite = buildRewrite(document, rankAt(50), 40)!;

    // Each line costs 4 characters, so 10 of them fit: the cursor's, then one on each side.
    expect(rewrite.ids[0]).toBe(document[45]!.id);
    expect(rewrite.ids).toHaveLength(10);
    expect(rewrite.markdown).toBe(
      Array.from({ length: 10 }, (_, index) => `p${45 + index}`).join("\n"),
    );
  });

  it("reaches the end of the document when the cut is there", () => {
    const document = longDocument();
    const rewrite = buildRewrite(document, rankAt(100), 40)!;

    expect(rewrite.ids[rewrite.ids.length - 1]).toBe(document[100]!.id);
    expect(rewrite.markdown.endsWith("p100")).toBe(true);
  });

  it("keeps a block the answer repeats once", () => {
    const parsed = buildRewrite(blocks, null)!.parse(
      "Text\n[[writeopia-block-1]]\n[[writeopia-block-1]]\nMore",
    );

    expect(parsed.blocks.map((block) => block.text)).toEqual(["Text", null, "More"]);
    expect(parsed.pending.map((block) => block.id)).toEqual([image.id]);
  });

  it("cannot rewrite a paragraph alone over the limit", () => {
    const huge = [
      at(0, newBlock(StoryTypes.TITLE, { text: "Title" })),
      at(1, text("short")),
      at(2, text("x".repeat(50))),
    ];

    expect(buildRewrite(huge, rankAt(2), 40)).toBeNull();
    expect(buildRewrite(huge, rankAt(1), 40)).not.toBeNull();
  });

  it("has nothing to rewrite in an empty document", () => {
    expect(buildRewrite([at(0, newBlock(StoryTypes.TITLE, { text: "T" }))], null)).toBeNull();
  });
});

describe("answerBlocks", () => {
  it("reads an answer as blocks, without the blank lines between paragraphs", () => {
    const parsed = answerBlocks("# Summary\n\nFirst **point**.\n\n- [ ] Call Ana\n- [x] Book\n");

    expect(parsed.map((block) => [block.type.name, block.text])).toEqual([
      ["message", "Summary"],
      ["message", "First point."],
      ["check_item", "Call Ana"],
      ["check_item", "Book"],
    ]);
    expect(parsed[0]!.tags).toEqual([{ tag: Tags.H1, position: 0 }]);
    expect(parsed[3]!.checked).toBe(true);
  });

  it("keeps the blank lines of a code block", () => {
    const parsed = answerBlocks("```\na\n\nb\n```");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.text).toBe("a\n\nb");
  });
});
