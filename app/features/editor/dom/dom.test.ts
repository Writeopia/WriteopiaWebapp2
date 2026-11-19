import { describe, expect, it } from "vitest";

import { Spans, StoryTypes, Tags } from "~/core/models";

import { newBlock } from "../state/blocks";
import { parseInline, parseMarkdown, toMarkdown } from "../state/markdown";
import { getCaret, setCaret } from "./caret";
import { readClipboard, STEPS_MIME, textToBlocks, writeBlocks } from "./clipboard";
import { keyCommand, type KeyContext } from "./keymap";
import { spansToHtml, textFromDom } from "./spansToDom";

describe("spansToHtml", () => {
  it("writes plain text escaped like innerHTML", () => {
    expect(spansToHtml("a < b & c", [])).toBe("a &lt; b &amp; c");
  });

  it("nests the formats of each piece in a fixed order", () => {
    const html = spansToHtml("hello world", [
      { start: 0, end: 5, span: Spans.ITALIC, extra: null },
      { start: 2, end: 8, span: Spans.BOLD, extra: null },
    ]);
    expect(html).toBe("<em>he</em><strong><em>llo</em></strong><strong> wo</strong>rld");
  });

  it("writes links with a safe address only", () => {
    expect(spansToHtml("ab", [{ start: 0, end: 2, span: Spans.LINK, extra: "https://x.io" }])).toBe(
      '<a href="https://x.io" class="wr-link">ab</a>',
    );
    expect(
      spansToHtml("ab", [{ start: 0, end: 2, span: Spans.LINK, extra: "javascript:alert(1)" }]),
    ).toBe('<a class="wr-link">ab</a>');
  });

  it("draws search matches", () => {
    expect(spansToHtml("abc", [], [{ start: 1, end: 2, active: true }])).toBe(
      'a<mark class="wr-match wr-match-active">b</mark>c',
    );
  });

  it("is read back by the browser as the same HTML and text", () => {
    const element = document.createElement("div");
    const html = spansToHtml("x <y>\n", [{ start: 0, end: 1, span: Spans.UNDERLINE, extra: null }]);
    element.innerHTML = html;
    expect(element.innerHTML).toBe(html);
    expect(textFromDom(element)).toBe("x <y>\n");
  });
});

describe("caret", () => {
  it("reads and sets offsets across formatted pieces", () => {
    const element = document.createElement("div");
    element.innerHTML = spansToHtml("hello world", [
      { start: 2, end: 8, span: Spans.BOLD, extra: null },
    ]);
    document.body.append(element);

    setCaret(element, 3, 9);
    expect(getCaret(element)).toEqual({ start: 3, end: 9 });
    setCaret(element, 99);
    expect(getCaret(element)).toEqual({ start: 11, end: 11 });
    element.remove();
  });
});

describe("keyCommand", () => {
  const context: KeyContext = {
    isMac: true,
    inText: true,
    caretStart: 3,
    caretEnd: 3,
    textLength: 5,
    onFirstLine: true,
    onLastLine: true,
    slashOpen: false,
    hasBlockSelection: false,
    allTextSelected: false,
  };
  const key = (
    k: string,
    mods: Partial<Record<"shiftKey" | "altKey" | "ctrlKey" | "metaKey", boolean>> = {},
  ) => ({
    key: k,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });

  it("maps the formatting shortcuts to the platform's command key", () => {
    expect(keyCommand(key("b", { metaKey: true }), context)).toBe("bold");
    expect(keyCommand(key("b", { ctrlKey: true }), context)).toBeNull();
    expect(keyCommand(key("b", { ctrlKey: true }), { ...context, isMac: false })).toBe("bold");
    expect(keyCommand(key("B", { metaKey: true, shiftKey: true }), context)).toBe("box");
    expect(keyCommand(key("z", { metaKey: true, shiftKey: true }), context)).toBe("redo");
    expect(keyCommand(key("y", { ctrlKey: true }), { ...context, isMac: false })).toBe("redo");
    expect(keyCommand(key("-", { metaKey: true }), context)).toBe("list");
    expect(keyCommand(key("f", { metaKey: true }), context)).toBe("find");
    expect(keyCommand(key("j", { metaKey: true }), context)).toBe("askAi");
  });

  it("splits on Enter and joins on Backspace at the start only", () => {
    expect(keyCommand(key("Enter"), context)).toBe("split");
    expect(keyCommand(key("Backspace"), context)).toBeNull();
    expect(keyCommand(key("Backspace"), { ...context, caretStart: 0, caretEnd: 0 })).toBe(
      "eraseAtStart",
    );
    expect(keyCommand(key("Delete"), { ...context, caretStart: 5, caretEnd: 5 })).toBe(
      "deleteAtEnd",
    );
  });

  it("crosses blocks with the arrows at the edges", () => {
    expect(keyCommand(key("ArrowUp"), context)).toBe("previousLine");
    expect(keyCommand(key("ArrowUp"), { ...context, onFirstLine: false })).toBeNull();
    expect(keyCommand(key("ArrowLeft"), { ...context, caretStart: 0, caretEnd: 0 })).toBe(
      "previousBlockEnd",
    );
    expect(keyCommand(key("ArrowRight"), { ...context, caretStart: 5, caretEnd: 5 })).toBe(
      "nextBlockStart",
    );
  });

  it("drives the slash menu while it is open", () => {
    const open = { ...context, slashOpen: true };
    expect(keyCommand(key("ArrowDown"), open)).toBe("slashDown");
    expect(keyCommand(key("Enter"), open)).toBe("slashPick");
    expect(keyCommand(key("Escape"), open)).toBe("escape");
  });

  it("acts on selected blocks", () => {
    const selected = { ...context, hasBlockSelection: true };
    expect(keyCommand(key("Backspace"), selected)).toBe("deleteSelection");
    expect(keyCommand(key("ArrowDown", { shiftKey: true }), selected)).toBe("extendDown");
    expect(keyCommand(key("a", { metaKey: true }), context)).toBeNull();
    expect(keyCommand(key("a", { metaKey: true }), { ...context, allTextSelected: true })).toBe(
      "selectAll",
    );
  });

  it("ignores keys while composing", () => {
    expect(keyCommand({ ...key("Enter"), isComposing: true }, context)).toBeNull();
  });
});

describe("markdown", () => {
  it("writes blocks as Markdown", () => {
    const steps = [
      newBlock(StoryTypes.TITLE, { text: "Doc" }),
      newBlock(StoryTypes.TEXT, { text: "Head", tags: [{ tag: Tags.H2, position: 0 }] }),
      newBlock(StoryTypes.TEXT, {
        text: "a bold link",
        spans: [
          { start: 2, end: 6, span: Spans.BOLD, extra: null },
          { start: 7, end: 11, span: Spans.LINK, extra: "https://x.io" },
        ],
      }),
      newBlock(StoryTypes.CHECK_ITEM, { text: "done", checked: true }),
      newBlock(StoryTypes.UNORDERED_LIST_ITEM, { text: "item" }),
      newBlock(StoryTypes.CODE_BLOCK, { text: "x = 1" }),
      newBlock(StoryTypes.DIVIDER, { text: null }),
    ];
    expect(toMarkdown(steps)).toBe(
      "# Doc\n## Head\na **bold** [link](https://x.io)\n[x] done\n- item\n```\nx = 1\n```\n---",
    );
  });

  it("reads Markdown lines into blocks", () => {
    const blocks = parseMarkdown(
      "## Head\n- item\n[] todo\n- [x] done\n---\n```\ncode\n```\nplain",
    );
    expect(blocks.map((block) => [block.type.name, block.text, block.checked])).toEqual([
      ["message", "Head", null],
      ["unordered_list_item", "item", null],
      ["check_item", "todo", false],
      ["check_item", "done", true],
      ["divider", null, null],
      ["code_block", "code", null],
      ["message", "plain", null],
    ]);
    expect(blocks[0]!.tags.map((tag) => tag.tag)).toEqual([Tags.H2]);
  });

  it("reads bold, italic, links and addresses", () => {
    expect(parseInline("a **b** *c* [d](https://d.io) https://e.io")).toEqual({
      text: "a b c d https://e.io",
      spans: [
        { start: 2, end: 3, span: Spans.BOLD, extra: null },
        { start: 4, end: 5, span: Spans.ITALIC, extra: null },
        { start: 6, end: 7, span: Spans.LINK, extra: "https://d.io" },
        { start: 8, end: 20, span: Spans.LINK, extra: "https://e.io" },
      ],
    });
  });
});

describe("clipboard", () => {
  function transfer() {
    const data = new Map<string, string>();
    return {
      setData: (type: string, value: string) => void data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      files: [] as unknown as FileList,
      types: [] as readonly string[],
    };
  }

  it("round-trips blocks with new ids", () => {
    const clipboard = transfer();
    const block = newBlock(StoryTypes.CHECK_ITEM, { text: "milk", checked: true });
    writeBlocks(clipboard, [block]);
    expect(clipboard.getData("text/plain")).toBe("[x] milk");
    expect(clipboard.getData(STEPS_MIME)).toContain("milk");

    const pasted = readClipboard(clipboard);
    expect(pasted.kind).toBe("blocks");
    if (pasted.kind !== "blocks") return;
    expect(pasted.blocks[0]).toMatchObject({ text: "milk", checked: true });
    expect(pasted.blocks[0]!.id).not.toBe(block.id);
  });

  it("reads plain text, and several lines as blocks", () => {
    const clipboard = transfer();
    clipboard.setData("text/plain", "one line");
    expect(readClipboard(clipboard)).toEqual({ kind: "text", text: "one line" });
    expect(textToBlocks("one line\n")).toBeNull();
    expect(textToBlocks("a\n- b")?.map((block) => block.text)).toEqual(["a", "b"]);
  });

  it("reads pictures and videos as media, leaving other files out", () => {
    const clipboard = transfer();
    const photo = new File([], "photo.png", { type: "image/png" });
    const clip = new File([], "clip.mp4", { type: "video/mp4" });
    const notes = new File([], "notes.pdf", { type: "application/pdf" });
    clipboard.files = [photo, clip, notes] as unknown as FileList;
    expect(readClipboard(clipboard)).toEqual({ kind: "media", files: [photo, clip] });
  });
});
