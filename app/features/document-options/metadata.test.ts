import { describe, expect, it } from "vitest";

import type { Document } from "~/core/models";

import { aDocument } from "../../../test/fixtures";
import { DocumentMetadata, FavoriteState } from "./metadata";

/** A request a test answers when it wants. */
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function metadata() {
  const sent: { document: Document; answer: ReturnType<typeof deferred> }[] = [];
  const errors: unknown[] = [];
  const saver = new DocumentMetadata(aDocument({ published: true }), {
    send: (document) => {
      const answer = deferred();
      sent.push({ document, answer });
      return answer.promise;
    },
    onChange: () => undefined,
    onError: (error) => errors.push(error),
  });
  return { saver, sent, errors };
}

describe("document metadata", () => {
  it("shows a change at once and sends it", () => {
    const { saver, sent } = metadata();
    saver.change({ isLocked: true });
    expect(saver.current.isLocked).toBe(true);
    expect(sent.map((each) => each.document.isLocked)).toEqual([true]);
  });

  it("sends the changes made during a request together, after it", async () => {
    const { saver, sent } = metadata();
    saver.change({ isLocked: true });
    saver.change({ tagIds: ["a"] });
    saver.change({ icon: { label: "star", tint: null } });
    expect(sent).toHaveLength(1);

    sent[0]!.answer.resolve();
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1]!.document).toMatchObject({
      isLocked: true,
      tagIds: ["a"],
      icon: { label: "star", tint: null },
    });
  });

  it("drops a refused change, but not a later one", async () => {
    const { saver, sent, errors } = metadata();
    saver.change({ icon: { label: "x", tint: null } });
    saver.change({ icon: { label: "y", tint: null } });

    sent[0]!.answer.reject(new Error("no"));
    await settle();

    expect(errors).toHaveLength(1);
    expect(saver.current.icon?.label).toBe("y");
    expect(sent[1]!.document.icon?.label).toBe("y");
  });

  it("goes back to what the server holds when its only change is refused", async () => {
    const { saver, sent } = metadata();
    saver.change({ isLocked: true });
    sent[0]!.answer.reject(new Error("no"));
    await settle();
    expect(saver.current.isLocked).toBe(false);
  });

  it("sends the fields other endpoints changed", () => {
    const { saver, sent } = metadata();
    saver.serverChanged({ published: false, parentId: "work" });
    saver.change({ isLocked: true });
    expect(sent[0]!.document).toMatchObject({ published: false, parentId: "work" });
  });

  it("does not tell of a server change that changes nothing", () => {
    let changes = 0;
    const saver = new DocumentMetadata(aDocument({ published: true }), {
      send: () => Promise.resolve(),
      onChange: () => changes++,
      onError: () => undefined,
    });
    saver.serverChanged({ published: true });
    expect(changes).toBe(0);
    expect(saver.current).toBe(saver.current);
  });
});

describe("favorite", () => {
  function favorite() {
    const sent: { value: boolean; answer: ReturnType<typeof deferred> }[] = [];
    const state = new FavoriteState({
      send: (value) => {
        const answer = deferred();
        sent.push({ value, answer });
        return answer.promise;
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    return { state, sent };
  }

  it("sends a quick second toggle after the first is answered", async () => {
    const { state, sent } = favorite();
    state.toggle(false);
    state.toggle(false);
    expect(state.current(false)).toBe(false);
    expect(sent.map((each) => each.value)).toEqual([true]);

    sent[0]!.answer.resolve();
    await settle();

    expect(sent.map((each) => each.value)).toEqual([true, false]);
  });

  it("never has two requests on their way", async () => {
    const { state, sent } = favorite();
    state.toggle(false);
    state.toggle(false);
    state.toggle(false);
    expect(sent).toHaveLength(1);

    sent[0]!.answer.resolve();
    await settle();
    // The server holds what the user wants already.
    expect(sent).toHaveLength(1);
    expect(state.current(false)).toBe(true);
  });

  it("goes back when the server refuses", async () => {
    const { state, sent } = favorite();
    state.toggle(false);
    expect(state.current(false)).toBe(true);
    sent[0]!.answer.reject(new Error("no"));
    await settle();
    expect(state.current(false)).toBe(false);
  });
});
