import { describe, expect, it } from "vitest";

import { StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";

import { aDocument, aStep } from "../../../../test/fixtures";
import { ordered } from "./reducer";
import { createEditorStore } from "./store";

function loaded() {
  const store = createEditorStore();
  store.getState().dispatch({
    type: "load",
    readOnly: false,
    document: aDocument({
      content: [
        aStep({ id: "title", type: StoryTypes.TITLE, text: "T", position: rankAt(0) }),
        aStep({ id: "s1", text: "", position: rankAt(1) }),
      ],
    }),
  });
  return store;
}

const texts = (store: ReturnType<typeof loaded>) =>
  ordered(store.getState().state).map((block) => block.text);

describe("editor store", () => {
  it("starts with nothing to undo", () => {
    expect(loaded().getState().canUndo).toBe(false);
  });

  it("undoes typing in groups and redoes it", () => {
    const store = loaded();
    const { dispatch } = store.getState();
    for (const text of ["a", "ab", "abc"]) {
      dispatch({ type: "input", id: "s1", text, cursor: text.length });
    }
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(texts(store)).toEqual(["T", ""]);
    expect(store.getState().canRedo).toBe(true);

    store.getState().redo();
    expect(texts(store)).toEqual(["T", "abc"]);
  });

  it("undoes a change of structure on its own", () => {
    const store = loaded();
    const { dispatch } = store.getState();
    dispatch({ type: "input", id: "s1", text: "ab", cursor: 2 });
    dispatch({ type: "split", id: "s1", start: 1, end: 1 });
    expect(texts(store)).toEqual(["T", "a", "b"]);

    store.getState().undo();
    expect(texts(store)).toEqual(["T", "ab"]);
    expect(store.getState().state.focus).toMatchObject({ id: "s1" });
  });

  it("does not record what came from elsewhere", () => {
    const store = loaded();
    store
      .getState()
      .dispatch({ type: "updateBlock", id: "s1", changes: { text: "x" } }, { history: false });
    expect(store.getState().canUndo).toBe(false);
  });
});
