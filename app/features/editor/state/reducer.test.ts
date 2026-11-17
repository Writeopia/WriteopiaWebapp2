import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SpanInfo, Spans, type StoryStep, StoryTypes, Tags } from "~/core/models";
import { rankAt, rankConfig } from "~/core/rank/rank";

import { aDocument, aStep } from "../../../../test/fixtures";
import { newBlock } from "./blocks";
import { SLASH_COMMANDS } from "./commands";
import { type Action, documentContent, emptyState, find, ordered, reducer } from "./reducer";
import type { EditorState } from "./types";

beforeEach(() => {
  rankConfig.jitter = false;
});
afterEach(() => {
  rankConfig.jitter = true;
});

const bold = (start: number, end: number): SpanInfo => ({
  start,
  end,
  span: Spans.BOLD,
  extra: null,
});

/** An editor with a title and the given steps, one per position. */
function editor(...steps: Partial<StoryStep>[]): EditorState {
  const content = [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Title", position: rankAt(0) }),
    ...steps.map((step, index) =>
      aStep({ id: `s${index + 1}`, position: rankAt(index + 1), checked: null, ...step }),
    ),
  ];
  return reducer(emptyState, {
    type: "load",
    document: aDocument({ content }),
    readOnly: false,
  });
}

function run(state: EditorState, ...actions: Action[]): EditorState {
  return actions.reduce(reducer, state);
}

function texts(state: EditorState): (string | null)[] {
  return ordered(state).map((block) => block.text);
}

/** The inputs of typing [typed] after [text], one character at a time. */
function typing(id: string, text: string, typed: string): Action[] {
  return [...typed].map((_, index) => {
    const next = text + typed.slice(0, index + 1);
    return { type: "input", id, text: next, cursor: next.length };
  });
}

function block(state: EditorState, id: string) {
  return find(state, id)!.block;
}

describe("load", () => {
  it("keeps the steps in order and drops the ones only a screen draws", () => {
    const state = editor({ text: "a" }, { type: StoryTypes.LOADING }, { text: "b" });
    expect(texts(state)).toEqual(["Title", "a", "b"]);
  });

  it("puts a title first when the document has none", () => {
    const state = reducer(emptyState, {
      type: "load",
      document: aDocument({ title: "Notes", content: [aStep({ text: "a", position: rankAt(3) })] }),
      readOnly: false,
    });
    expect(ordered(state).map((b) => b.type.name)).toEqual(["title", "message"]);
    expect(texts(state)).toEqual(["Notes", "a"]);
  });

  it("keeps two steps that share a position", () => {
    const state = editor({ text: "a" }, { text: "b", position: rankAt(1) });
    expect(texts(state)).toEqual(["Title", "a", "b"]);
    expect(new Set(state.order).size).toBe(3);
  });
});

describe("typing", () => {
  it("changes the text and moves the spans", () => {
    const state = run(editor({ text: "hello", spans: [bold(0, 5)] }), {
      type: "input",
      id: "s1",
      text: "hello!",
      cursor: 6,
    });
    expect(block(state, "s1")).toMatchObject({ text: "hello!", spans: [bold(0, 6)] });
    expect(state.lastEdit).toEqual({ kind: "line", id: "s1" });
    expect(state.focus).toEqual({ id: "s1", start: 6, end: 6 });
  });

  it("splits a text that received line breaks", () => {
    const state = run(editor({ text: "" }), {
      type: "input",
      id: "s1",
      text: "one\ntwo\nthree",
      cursor: 13,
    });
    expect(texts(state)).toEqual(["Title", "one", "two", "three"]);
    expect(state.focus).toMatchObject({ start: 5, end: 5 });
    expect(block(state, state.focus!.id).text).toBe("three");
  });

  it("keeps line breaks inside a code block", () => {
    const state = run(editor({ type: StoryTypes.CODE_BLOCK, text: "a" }), {
      type: "input",
      id: "s1",
      text: "a\nb",
      cursor: 3,
    });
    expect(texts(state)).toEqual(["Title", "a\nb"]);
  });

  it("turns an address pasted in an empty line into a link card, with a line below", () => {
    const state = run(editor({ text: "" }), {
      type: "input",
      id: "s1",
      text: "https://writeopia.io/blog",
      cursor: 25,
    });
    const blocks = ordered(state);
    expect(blocks[1]).toMatchObject({
      type: StoryTypes.LINK_CARD,
      url: "https://writeopia.io/blog",
    });
    expect(blocks[2]).toMatchObject({ type: StoryTypes.TEXT, text: "" });
    expect(state.focus?.id).toBe(blocks[2]!.id);
  });
});

describe("line commands", () => {
  const typed = (text: string, steps: Partial<StoryStep> = {}) =>
    run(editor({ text: "", ...steps }), { type: "input", id: "s1", text, cursor: text.length });

  it.each([
    ["# ", Tags.H1],
    ["## ", Tags.H2],
    ["### ", Tags.H3],
    ["#### ", Tags.H4],
  ])("%s makes a heading", (command, tag) => {
    const result = block(typed(command), "s1");
    expect(result.tags.map((info) => info.tag)).toEqual([tag]);
    expect(result.text).toBe("");
  });

  it("does not fire before the space", () => {
    expect(block(typed("#"), "s1").tags).toEqual([]);
  });

  it.each([
    ["- ", StoryTypes.UNORDERED_LIST_ITEM],
    ["[]", StoryTypes.CHECK_ITEM],
    ["-[]", StoryTypes.CHECK_ITEM],
    ["```", StoryTypes.CODE_BLOCK],
  ])("%s changes the type", (command, type) => {
    const result = block(typed(command), "s1");
    expect(result.type).toEqual(type);
    expect(result.text).toBe("");
  });

  it("keeps the text after the command", () => {
    const state = run(editor({ text: "milk" }), {
      type: "input",
      id: "s1",
      text: "- milk",
      cursor: 2,
    });
    expect(block(state, "s1")).toMatchObject({
      type: StoryTypes.UNORDERED_LIST_ITEM,
      text: "milk",
    });
    expect(state.focus).toMatchObject({ id: "s1", start: 0 });
  });

  it("fire before existing text only when a space follows them", () => {
    const divider = run(editor({ text: "hello" }), {
      type: "input",
      id: "s1",
      text: "---hello",
      cursor: 3,
    });
    expect(texts(divider)).toEqual(["Title", "---hello"]);
    const checkbox = run(editor({ text: "milk" }), {
      type: "input",
      id: "s1",
      text: "[]milk",
      cursor: 2,
    });
    expect(block(checkbox, "s1").type).toEqual(StoryTypes.TEXT);
    const spaced = run(editor({ text: " milk" }), {
      type: "input",
      id: "s1",
      text: "[] milk",
      cursor: 2,
    });
    expect(block(spaced, "s1")).toMatchObject({ type: StoryTypes.CHECK_ITEM, text: "milk" });
  });

  it("--- before a space keeps the text on the line below the divider", () => {
    const state = run(editor({ text: " hello" }), {
      type: "input",
      id: "s1",
      text: "--- hello",
      cursor: 3,
    });
    expect(ordered(state).map((b) => [b.type.name, b.text])).toEqual([
      ["title", "Title"],
      ["divider", null],
      ["message", "hello"],
    ]);
  });

  it("renews the ids of blocks the server will not store again", () => {
    const state = run(
      editor({ text: "a" }),
      { type: "focus", focus: { id: "s1", start: 1, end: 1 } },
      { type: "renewIds", ids: ["s1"] },
    );
    const renewed = ordered(state)[1]!;
    expect(renewed.id).not.toBe("s1");
    expect(renewed.text).toBe("a");
    expect(state.focus).toMatchObject({ id: renewed.id, start: 1 });
  });

  it("--- makes a divider and moves the caret to a new line below", () => {
    const state = typed("---");
    const blocks = ordered(state);
    expect(blocks[1]).toMatchObject({ type: StoryTypes.DIVIDER, text: null });
    expect(state.focus?.id).toBe(blocks[2]!.id);
  });

  it("/box and /card toggle the decoration", () => {
    expect(block(typed("/box"), "s1").tags.map((t) => t.tag)).toEqual([Tags.HIGH_LIGHT_BLOCK]);
    const card = typed("/card", { tags: [{ tag: Tags.CARD_BLOCK, position: 0 }] });
    expect(block(card, "s1").tags).toEqual([]);
  });

  it("are not read in the title", () => {
    const state = run(editor(), { type: "input", id: "title", text: "# ", cursor: 2 });
    expect(block(state, "title").text).toBe("# ");
  });
});

describe("Enter", () => {
  it("splits the block at the caret with its spans", () => {
    const state = run(editor({ text: "hello world", spans: [bold(3, 8)] }), {
      type: "split",
      id: "s1",
      start: 5,
      end: 5,
    });
    const [, first, second] = ordered(state);
    expect(first).toMatchObject({ text: "hello", spans: [bold(3, 5)] });
    expect(second).toMatchObject({ text: " world", spans: [bold(0, 3)], type: StoryTypes.TEXT });
    expect(state.focus).toEqual({ id: second!.id, start: 0, end: 0 });
    expect(first!.position < second!.position).toBe(true);
  });

  it("deletes the selected text first", () => {
    const state = run(editor({ text: "abcdef" }), { type: "split", id: "s1", start: 2, end: 4 });
    expect(texts(state)).toEqual(["Title", "ab", "ef"]);
  });

  it("continues lists and checkboxes, unchecked", () => {
    const state = run(editor({ type: StoryTypes.CHECK_ITEM, text: "milk", checked: true }), {
      type: "split",
      id: "s1",
      start: 4,
      end: 4,
    });
    expect(ordered(state)[2]).toMatchObject({ type: StoryTypes.CHECK_ITEM, checked: false });
  });

  it("ends the list on an empty item", () => {
    const state = run(editor({ type: StoryTypes.UNORDERED_LIST_ITEM, text: "" }), {
      type: "split",
      id: "s1",
      start: 0,
      end: 0,
    });
    expect(ordered(state)).toHaveLength(2);
    expect(block(state, "s1").type).toEqual(StoryTypes.TEXT);
  });

  it("carries box and card, not headings", () => {
    const tags = [
      { tag: Tags.H1, position: 0 },
      { tag: Tags.HIGH_LIGHT_BLOCK, position: 0 },
    ];
    const state = run(editor({ text: "a", tags }), { type: "split", id: "s1", start: 1, end: 1 });
    expect(ordered(state)[2]!.tags.map((t) => t.tag)).toEqual([Tags.HIGH_LIGHT_BLOCK]);
  });

  it("in the title starts a paragraph", () => {
    const state = run(editor(), { type: "split", id: "title", start: 5, end: 5 });
    expect(ordered(state)[1]!.type).toEqual(StoryTypes.TEXT);
  });

  it("writes a line break in a code block", () => {
    const state = run(editor({ type: StoryTypes.CODE_BLOCK, text: "ab" }), {
      type: "split",
      id: "s1",
      start: 1,
      end: 1,
    });
    expect(texts(state)).toEqual(["Title", "a\nb"]);
    expect(state.focus).toMatchObject({ start: 2 });
  });
});

describe("Backspace at the start", () => {
  it("turns a list item into a paragraph first", () => {
    const state = run(editor({ type: StoryTypes.CHECK_ITEM, text: "a", checked: true }), {
      type: "eraseAtStart",
      id: "s1",
    });
    expect(block(state, "s1")).toMatchObject({ type: StoryTypes.TEXT, checked: null });
  });

  it("takes the heading away first", () => {
    const state = run(editor({ text: "a", tags: [{ tag: Tags.H2, position: 0 }] }), {
      type: "eraseAtStart",
      id: "s1",
    });
    expect(block(state, "s1").tags).toEqual([]);
  });

  it("joins a paragraph to the one above, with its spans", () => {
    const state = run(editor({ text: "ab" }, { text: "cd", spans: [bold(0, 2)] }), {
      type: "eraseAtStart",
      id: "s2",
    });
    expect(texts(state)).toEqual(["Title", "abcd"]);
    expect(block(state, "s1").spans).toEqual([bold(2, 4)]);
    expect(state.focus).toEqual({ id: "s1", start: 2, end: 2 });
  });

  it("selects a block above that is not text", () => {
    const state = run(editor({ type: StoryTypes.DIVIDER, text: null }, { text: "a" }), {
      type: "eraseAtStart",
      id: "s2",
    });
    expect([...state.selectedIds]).toEqual(["s1"]);
    expect(texts(state)).toEqual(["Title", null, "a"]);
  });

  it("does nothing in the title", () => {
    const state = editor();
    expect(run(state, { type: "eraseAtStart", id: "title" })).toBe(state);
  });
});

describe("Delete at the end", () => {
  it("brings the next paragraph in", () => {
    const state = run(editor({ text: "ab" }, { text: "cd" }), { type: "deleteAtEnd", id: "s1" });
    expect(texts(state)).toEqual(["Title", "abcd"]);
    expect(state.focus).toEqual({ id: "s1", start: 2, end: 2 });
  });
});

describe("formatting", () => {
  it("toggles a span on the selected text", () => {
    let state = run(
      editor({ text: "hello" }),
      { type: "focus", focus: { id: "s1", start: 1, end: 4 } },
      { type: "toggleSpan", span: Spans.BOLD },
    );
    expect(block(state, "s1").spans).toEqual([bold(1, 4)]);
    state = reducer(state, { type: "toggleSpan", span: Spans.BOLD });
    expect(block(state, "s1").spans).toEqual([]);
  });

  it("toggles a span on whole selected blocks", () => {
    const state = run(
      editor({ text: "ab" }, { text: "cde", spans: [bold(0, 3)] }),
      { type: "select", ids: ["s1", "s2"] },
      { type: "toggleSpan", span: Spans.BOLD },
    );
    expect(block(state, "s1").spans).toEqual([bold(0, 2)]);
    expect(block(state, "s2").spans).toEqual([bold(0, 3)]);
  });

  it("toggles types, tags and headings of the selected blocks", () => {
    let state = run(
      editor({ text: "a" }, { text: "b" }),
      { type: "select", ids: ["s1", "s2"] },
      { type: "toggleType", storyType: StoryTypes.CHECK_ITEM },
      { type: "toggleTag", tag: Tags.CARD_BLOCK },
      { type: "toggleHeading", tag: Tags.H3 },
    );
    expect(block(state, "s2")).toMatchObject({ type: StoryTypes.CHECK_ITEM, checked: false });
    expect(block(state, "s2").tags.map((t) => t.tag)).toEqual([Tags.CARD_BLOCK, Tags.H3]);

    state = reducer(state, { type: "toggleType", storyType: StoryTypes.CHECK_ITEM });
    expect(block(state, "s1").type).toEqual(StoryTypes.TEXT);
  });

  it("acts on the focused block without a selection, never on the title", () => {
    const state = run(
      editor({ text: "a" }),
      { type: "focus", focus: { id: "title", start: 0, end: 0 } },
      { type: "toggleHeading", tag: Tags.H1 },
    );
    expect(block(state, "title").tags).toEqual([]);
  });

  it("checks a checkbox", () => {
    const state = run(editor({ type: StoryTypes.CHECK_ITEM, text: "a", checked: false }), {
      type: "check",
      id: "s1",
      checked: true,
    });
    expect(block(state, "s1").checked).toBe(true);
  });
});

describe("slash menu", () => {
  it("opens on a slash at the start of a word and follows the filter", () => {
    let state = run(editor({ text: "" }), { type: "input", id: "s1", text: "/", cursor: 1 });
    expect(state.slash).toEqual({ id: "s1", slashIndex: 0, filter: "", highlight: 0 });
    state = reducer(state, { type: "input", id: "s1", text: "/ch", cursor: 3 });
    expect(state.slash?.filter).toBe("ch");
    state = reducer(state, { type: "input", id: "s1", text: "/ch ", cursor: 4 });
    expect(state.slash).toBeNull();
  });

  it("does not open inside a word", () => {
    const state = run(editor({ text: "a" }), { type: "input", id: "s1", text: "a/", cursor: 2 });
    expect(state.slash).toBeNull();
  });

  it("runs a command and takes its text away", () => {
    const checkbox = SLASH_COMMANDS.find((command) => command.id === "checkbox")!;
    const state = run(editor({ text: "milk " }), ...typing("s1", "milk ", "/che"), {
      type: "slashPick",
      command: checkbox,
      now: new Date(),
    });
    expect(block(state, "s1")).toMatchObject({ type: StoryTypes.CHECK_ITEM, text: "milk " });
    expect(state.slash).toBeNull();
  });

  it("inserts the date", () => {
    const today = SLASH_COMMANDS.find((command) => command.id === "today")!;
    const now = new Date(2026, 10, 17, 9, 5);
    const state = run(editor({ text: "" }), ...typing("s1", "", "/to"), {
      type: "slashPick",
      command: today,
      now,
    });
    expect(block(state, "s1").text).toBe(now.toLocaleDateString());
  });
});

describe("blocks", () => {
  it("inserts blocks after the focused one and replaces an empty paragraph", () => {
    const image = newBlock(StoryTypes.IMAGE, { url: "https://img" });
    const state = run(
      editor({ text: "a" }, { text: "" }),
      { type: "focus", focus: { id: "s2", start: 0, end: 0 } },
      { type: "insertBlocks", blocks: [image] },
    );
    expect(ordered(state).map((b) => b.type.name)).toEqual([
      "title",
      "message",
      "image",
      "message",
    ]);
    expect(find(state, "s2")).toBeNull();
  });

  it("pastes blocks in the middle of a text", () => {
    const state = run(editor({ text: "abcd" }), {
      type: "pasteBlocks",
      caret: { id: "s1", start: 2, end: 2 },
      blocks: [
        newBlock(StoryTypes.TEXT, { text: "X" }),
        newBlock(StoryTypes.CHECK_ITEM, { text: "Y" }),
      ],
    });
    expect(texts(state)).toEqual(["Title", "abX", "Ycd"]);
    expect(ordered(state)[2]!.type).toEqual(StoryTypes.CHECK_ITEM);
    expect(state.focus).toMatchObject({ start: 1 });
  });

  it("moves blocks after another one, never before the title", () => {
    let state = run(editor({ text: "a" }, { text: "b" }, { text: "c" }), {
      type: "move",
      ids: ["s1"],
      afterId: "s3",
    });
    expect(texts(state)).toEqual(["Title", "b", "c", "a"]);
    state = reducer(state, { type: "move", ids: ["s1"], afterId: null });
    expect(texts(state)).toEqual(["Title", "a", "b", "c"]);
    expect(reducer(state, { type: "move", ids: ["title"], afterId: "s3" })).toBe(state);
  });

  it("deletes the selected blocks but not the title", () => {
    const state = run(
      editor({ text: "a" }, { text: "b" }),
      { type: "selectAll" },
      { type: "deleteSelected" },
    );
    expect(texts(state)).toEqual(["Title"]);
    expect(state.focus).toMatchObject({ id: "title", start: 5 });
  });

  it("extends the selection with Shift+arrows", () => {
    let state = run(
      editor({ text: "a" }, { text: "b" }, { text: "c" }),
      { type: "focus", focus: { id: "s2", start: 0, end: 0 } },
      { type: "extendSelection", up: false },
    );
    expect([...state.selectedIds]).toEqual(["s2"]);
    state = run(
      state,
      { type: "extendSelection", up: false },
      { type: "extendSelection", up: true },
    );
    expect([...state.selectedIds].sort()).toEqual(["s1", "s2", "s3"]);
    expect(reducer(state, { type: "extendSelection", up: true })).toBe(state);
  });

  it("adds a paragraph on a click below the last block", () => {
    const state = run(editor({ type: StoryTypes.DIVIDER, text: null }), { type: "clickAtEnd" });
    expect(ordered(state)).toHaveLength(3);
    expect(state.focus?.id).toBe(ordered(state)[2]!.id);
  });
});

describe("server updates", () => {
  it("applies changed and deleted steps, but not over local changes", () => {
    const state = run(editor({ text: "a" }, { text: "b" }, { text: "c" }), {
      type: "serverUpdate",
      steps: [
        aStep({ id: "s1", text: "A", position: rankAt(1) }),
        aStep({ id: "s2", text: "B", position: rankAt(2) }),
        aStep({ id: "new", text: "N", position: rankAt(9) }),
      ],
      deletedIds: ["s3"],
      keepIds: new Set(["s2"]),
    });
    expect(texts(state)).toEqual(["Title", "A", "b", "N"]);
  });
});

describe("read-only", () => {
  it("refuses changes", () => {
    const state = run(editor({ text: "a" }), { type: "setReadOnly", readOnly: true });
    expect(run(state, { type: "input", id: "s1", text: "ab", cursor: 2 })).toBe(state);
    expect(run(state, { type: "selectAll" })).toBe(state);
  });

  it("still shows what changed elsewhere, so the sync never takes it for deleted", () => {
    const locked = run(editor({ text: "a" }), { type: "setReadOnly", readOnly: true });
    const state = run(locked, {
      type: "serverUpdate",
      steps: [aStep({ id: "new", text: "N", position: rankAt(9) })],
      deletedIds: [],
      keepIds: new Set(),
    });
    expect(texts(state)).toEqual(["Title", "a", "N"]);
  });
});

describe("documentContent", () => {
  it("leaves out the blocks only this screen has", () => {
    const uploading = { ...newBlock(StoryTypes.IMAGE), ephemeral: true };
    const state = run(editor({ text: "a" }), {
      type: "insertBlocks",
      blocks: [uploading],
      afterId: "s1",
    });
    expect(documentContent(state).map((step) => step.text)).toEqual(["Title", "a", ""]);
    expect(documentContent(state)[0]).not.toHaveProperty("ephemeral");
  });
});
