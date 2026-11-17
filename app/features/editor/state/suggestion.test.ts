import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type StoryStep, StoryTypes, Tags } from "~/core/models";
import { rankAt, rankConfig } from "~/core/rank/rank";

import { aDocument, aStep } from "../../../../test/fixtures";
import { hasTag, newBlock } from "./blocks";
import { type Action, documentContent, emptyState, ordered, reducer, toStep } from "./reducer";
import { createEditorStore } from "./store";
import type { EditorState } from "./types";

beforeEach(() => {
  rankConfig.jitter = false;
});
afterEach(() => {
  rankConfig.jitter = true;
});

function editor(...steps: Partial<StoryStep>[]): EditorState {
  const content = [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Title", position: rankAt(0) }),
    ...steps.map((step, index) =>
      aStep({ id: `s${index + 1}`, position: rankAt(index + 1), checked: null, ...step }),
    ),
  ];
  return reducer(emptyState, { type: "load", document: aDocument({ content }), readOnly: false });
}

function run(state: EditorState, ...actions: Action[]): EditorState {
  return actions.reduce(reducer, state);
}

/** What the page shows: the blocks that are not hidden, by text (a skeleton by its type). */
function shown(state: EditorState): (string | null)[] {
  return ordered(state)
    .filter((block) => !block.hidden)
    .map((block) => (block.type.number === StoryTypes.SKELETON.number ? "<skeleton>" : block.text));
}

function saved(state: EditorState): (string | null)[] {
  return documentContent(state).map((step) => step.text);
}

const text = (value: string) => newBlock(StoryTypes.TEXT, { text: value });

describe("AI suggestions in the editor", () => {
  it("hides the lines to replace and shows a skeleton after them, saving nothing new", () => {
    const state = run(editor({ text: "a" }, { text: "b" }, { text: "c" }), {
      type: "suggestBegin",
      hideIds: ["s1", "s2"],
      afterId: "s2",
    });

    expect(shown(state)).toEqual(["Title", "<skeleton>", "c"]);
    expect(saved(state)).toEqual(["Title", "a", "b", "c"]);
    expect(state.suggestion?.streaming).toBe(true);
  });

  it("streams the answer as suggested blocks, with stable ids, never saved", () => {
    const begun = run(editor({ text: "a" }, { text: "c" }), {
      type: "suggestBegin",
      hideIds: [],
      afterId: "s1",
    });
    const first = reducer(begun, { type: "suggestUpdate", blocks: [text("One")] });
    const second = reducer(first, { type: "suggestUpdate", blocks: [text("One."), text("Two")] });

    expect(shown(second)).toEqual(["Title", "a", "One.", "Two", "c"]);
    expect(saved(second)).toEqual(["Title", "a", "c"]);
    const suggested = ordered(second).filter((block) => block.ephemeral);
    expect(suggested.map((block) => hasTag(block, Tags.AI_SUGGESTION))).toEqual([true, true]);
    expect(hasTag(suggested[0]!, Tags.FIRST_AI_SUGGESTION)).toBe(true);
    expect(suggested[0]!.id).toBe(second.suggestion!.ids[0]);
    expect(suggested[0]!.id).toBe(first.suggestion!.ids[0]);
  });

  it("keeps the answer: the hidden lines go and the suggested blocks become the document", () => {
    const state = run(
      editor({ text: "a" }, { text: "b" }, { text: "c" }),
      { type: "suggestBegin", hideIds: ["s1", "s2"], afterId: "s2" },
      { type: "suggestUpdate", blocks: [text("ab")] },
      { type: "suggestDone" },
      { type: "suggestAccept" },
    );

    expect(state.suggestion).toBeNull();
    expect(shown(state)).toEqual(["Title", "ab", "c"]);
    expect(saved(state)).toEqual(["Title", "ab", "c"]);
    const kept = ordered(state)[1]!;
    expect(kept.tags).toEqual([]);
    expect(kept.ephemeral).toBeUndefined();
  });

  it("discards the answer: the lines come back as they were", () => {
    const before = editor({ text: "a" }, { text: "b" });
    const state = run(
      before,
      { type: "suggestBegin", hideIds: ["s1"], afterId: "s1" },
      { type: "suggestUpdate", blocks: [text("x")] },
      { type: "suggestDiscard" },
    );

    expect(state.suggestion).toBeNull();
    expect(shown(state)).toEqual(["Title", "a", "b"]);
    expect(ordered(state)).toEqual(ordered(before));
  });

  it("puts an answer with no anchor at the end of the document", () => {
    const state = run(
      editor({ text: "a" }),
      { type: "suggestBegin", hideIds: [], afterId: null },
      { type: "suggestUpdate", blocks: [text("end")] },
    );
    expect(shown(state)).toEqual(["Title", "a", "end"]);
  });

  it("moves a block the rewrite keeps to its new place, with its own id", () => {
    const image = { id: "s2", type: StoryTypes.IMAGE, text: null, url: "pic.png" };
    const begun = run(editor({ text: "a" }, image, { text: "b" }), {
      type: "suggestBegin",
      hideIds: ["s1", "s2", "s3"],
      afterId: "s3",
    });
    const original = ordered(begun).find((block) => block.id === "s2")!;
    const updated = reducer(begun, {
      type: "suggestUpdate",
      blocks: [text("B first"), original, text("A after")],
    });

    // While suggested, a copy stands for it; the original stays saved where it was.
    const copy = ordered(updated).filter((block) => !block.hidden)[2]!;
    expect(copy.id).not.toBe("s2");
    expect(copy.url).toBe("pic.png");
    expect(saved(updated)).toEqual(["Title", "a", null, "b"]);

    const accepted = run(updated, { type: "suggestDone" }, { type: "suggestAccept" });
    expect(documentContent(accepted).map((step) => step.id)).toEqual([
      "title",
      expect.any(String),
      "s2",
      expect.any(String),
    ]);
    expect(saved(accepted)).toEqual(["Title", "B first", null, "A after"]);
    expect(ordered(accepted).some((block) => block.hidden)).toBe(false);
  });

  it("does not take edits while a suggestion stands", () => {
    const begun = run(editor({ text: "a" }, { text: "b" }), {
      type: "suggestBegin",
      hideIds: [],
      afterId: "s1",
    });
    expect(reducer(begun, { type: "input", id: "s2", text: "bb", cursor: 2 })).toBe(begun);
    expect(reducer(begun, { type: "suggestBegin", hideIds: [], afterId: null })).toBe(begun);
  });

  it("keeps nothing of an accept before the answer is done", () => {
    const begun = run(
      editor({ text: "a" }),
      { type: "suggestBegin", hideIds: [], afterId: "s1" },
      { type: "suggestUpdate", blocks: [text("x")] },
    );
    expect(reducer(begun, { type: "suggestAccept" })).toBe(begun);
  });
});

describe("AI suggestions and the work around them", () => {
  it("still takes a finished upload and a failed one while a suggestion stands", () => {
    const image = { id: "img", type: StoryTypes.IMAGE, text: null };
    const begun = run(editor({ text: "a" }, image, { text: "b" }), {
      type: "suggestBegin",
      hideIds: [],
      afterId: "s1",
    });
    const uploaded = reducer(begun, {
      type: "updateBlock",
      id: "img",
      changes: { url: "https://cdn/p.png", ephemeral: false },
    });
    expect(ordered(uploaded).find((block) => block.id === "img")?.url).toBe("https://cdn/p.png");
    const removed = reducer(begun, { type: "removeBlock", id: "img" });
    expect(ordered(removed).some((block) => block.id === "img")).toBe(false);
  });

  it("keeps a replaced line hidden when the server changes it", () => {
    const begun = run(
      editor({ text: "a" }, { text: "b" }),
      { type: "suggestBegin", hideIds: ["s1"], afterId: "s1" },
      { type: "suggestUpdate", blocks: [text("A")] },
    );
    const hiddenStep = toStep(ordered(begun).find((block) => block.id === "s1")!);
    const updated = reducer(begun, {
      type: "serverUpdate",
      steps: [{ ...hiddenStep, text: "a, edited elsewhere" }],
      deletedIds: [],
      keepIds: new Set(),
    });
    expect(shown(updated)).toEqual(["Title", "A", "b"]);
    expect(reducer(updated, { type: "suggestDiscard" }).order.length).toBe(3);
    expect(shown(reducer(updated, { type: "suggestDiscard" }))).toEqual([
      "Title",
      "a, edited elsewhere",
      "b",
    ]);
  });
});

describe("AI suggestions and the history", () => {
  it("undoes a kept answer back to the document as it was at Keep, server changes included", () => {
    const store = createEditorStore();
    const content = [
      aStep({ id: "title", type: StoryTypes.TITLE, text: "Title", position: rankAt(0) }),
      aStep({ id: "s1", text: "a", position: rankAt(1) }),
      aStep({ id: "s2", text: "b", position: rankAt(2) }),
    ];
    const { dispatch } = store.getState();
    dispatch({ type: "load", document: aDocument({ content }), readOnly: false });
    dispatch({ type: "suggestBegin", hideIds: ["s1"], afterId: "s1" });
    dispatch({ type: "suggestUpdate", blocks: [text("A")] });
    dispatch({ type: "suggestDone" });
    const s2 = ordered(store.getState().state).find((block) => block.id === "s2")!;
    dispatch(
      {
        type: "serverUpdate",
        steps: [{ ...s2, text: "b from elsewhere" }],
        deletedIds: [],
        keepIds: new Set(),
      },
      { history: false },
    );
    dispatch({ type: "suggestAccept" });

    store.getState().undo();
    expect(shown(store.getState().state)).toEqual(["Title", "a", "b from elsewhere"]);
  });

  it("undoes a kept answer in one step, back to the lines before it", () => {
    const store = createEditorStore();
    const content = [
      aStep({ id: "title", type: StoryTypes.TITLE, text: "Title", position: rankAt(0) }),
      aStep({ id: "s1", text: "a", position: rankAt(1) }),
    ];
    const { dispatch } = store.getState();
    dispatch({ type: "load", document: aDocument({ content }), readOnly: false });
    dispatch({ type: "suggestBegin", hideIds: ["s1"], afterId: "s1" });
    dispatch({ type: "suggestUpdate", blocks: [text("A")] });
    dispatch({ type: "suggestDone" });
    expect(store.getState().canUndo).toBe(false);

    dispatch({ type: "suggestAccept" });
    expect(saved(store.getState().state)).toEqual(["Title", "A"]);
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(shown(store.getState().state)).toEqual(["Title", "a"]);
    expect(ordered(store.getState().state).some((block) => block.hidden)).toBe(false);
  });

  it("leaves no trace of a discarded answer", () => {
    const store = createEditorStore();
    const { dispatch } = store.getState();
    dispatch({
      type: "load",
      document: aDocument({ content: [aStep({ id: "s1", text: "a", position: rankAt(1) })] }),
      readOnly: false,
    });
    dispatch({ type: "suggestBegin", hideIds: [], afterId: null });
    dispatch({ type: "suggestUpdate", blocks: [text("A")] });
    dispatch({ type: "suggestDiscard" });
    expect(store.getState().canUndo).toBe(false);
  });

  it("does not undo while a suggestion stands", () => {
    const store = createEditorStore();
    const { dispatch } = store.getState();
    dispatch({
      type: "load",
      document: aDocument({ content: [aStep({ id: "s1", text: "a", position: rankAt(1) })] }),
      readOnly: false,
    });
    dispatch({ type: "input", id: "s1", text: "ab", cursor: 2 });
    dispatch({ type: "suggestBegin", hideIds: [], afterId: null });
    store.getState().undo();
    expect(store.getState().state.suggestion).not.toBeNull();
    expect(ordered(store.getState().state)[1]!.text).toBe("ab");
  });
});
