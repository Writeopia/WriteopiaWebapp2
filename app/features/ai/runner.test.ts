import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type StoryStep, StoryTypes } from "~/core/models";
import { rankAt, rankConfig } from "~/core/rank/rank";
import { documentContent, ordered } from "~/features/editor/state/reducer";
import { createEditorStore } from "~/features/editor/state/store";

import { aDocument, aStep } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { commandContext, runCommand, runQuickAction } from "./runner";

beforeEach(() => {
  rankConfig.jitter = false;
});
afterEach(() => {
  rankConfig.jitter = true;
});

function editorWith(...steps: Partial<StoryStep>[]) {
  const store = createEditorStore();
  const content = [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Title", position: rankAt(0) }),
    ...steps.map((step, index) =>
      aStep({ id: `s${index + 1}`, position: rankAt(index + 1), checked: null, ...step }),
    ),
  ];
  store.getState().dispatch({ type: "load", document: aDocument({ content }), readOnly: false });
  return store;
}

function sse(...answers: string[]) {
  const body = answers
    .map((answer, index) =>
      `data: ${JSON.stringify({ response: answer, done: index === answers.length - 1 })}\n\n`,
    )
    .join("");
  return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
}

function shown(store: ReturnType<typeof createEditorStore>) {
  return ordered(store.getState().state)
    .filter((block) => !block.hidden)
    .map((block) => block.text);
}

function saved(store: ReturnType<typeof createEditorStore>) {
  return documentContent(store.getState().state).map((step) => step.text);
}

describe("commandContext (AiCommandContext.kt)", () => {
  it("sends the selected lines and the document without its title", () => {
    const store = editorWith({ text: "a" }, { text: "" }, { text: "b" }, { text: "c" });
    store.getState().dispatch({ type: "select", ids: ["s1", "s2", "s3"] });

    expect(commandContext(store.getState().state)).toEqual({
      selectedIds: ["s1", "s3"],
      selectedText: "a\nb",
      documentText: "a\nb\nc",
    });
  });
});

describe("runCommand", () => {
  it("adds the answer after the selection when the AI says ADD", async () => {
    const requests: Record<string, unknown> = {};
    server.use(
      http.post(apiUrl("/ai/command-intent"), async ({ request }) => {
        requests.intent = await request.json();
        return HttpResponse.json({ intent: "ADD" });
      }),
      http.post(apiUrl("/ai/command"), async ({ request }) => {
        requests.command = await request.json();
        return sse("- one", "- one\n- two");
      }),
    );
    const store = editorWith({ text: "a" }, { text: "b" });
    store.getState().dispatch({ type: "select", ids: ["s1"] });

    await runCommand(store, "list examples", "Title");

    expect(shown(store)).toEqual(["Title", "a", "one", "two", "b"]);
    expect(saved(store)).toEqual(["Title", "a", "b"]);
    expect(store.getState().state.suggestion?.streaming).toBe(false);
    expect(requests.command).toMatchObject({
      command: "list examples",
      selectedText: "a",
      documentTitle: "Title",
      documentText: "a\nb",
      intent: "ADD",
      stream: true,
    });
  });

  it("replaces the selected lines when the AI says REPLACE", async () => {
    server.use(
      http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ intent: "REPLACE" })),
      http.post(apiUrl("/ai/command"), () => sse("A B")),
    );
    const store = editorWith({ text: "a" }, { text: "b" }, { text: "c" });
    store.getState().dispatch({ type: "select", ids: ["s1", "s2"] });

    await runCommand(store, "join", "Title");
    store.getState().dispatch({ type: "suggestAccept" });

    expect(saved(store)).toEqual(["Title", "A B", "c"]);
  });

  it("rewrites the whole document when nothing is selected", async () => {
    let sent: { documentText?: string; intent?: string } = {};
    server.use(
      http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ intent: "REPLACE" })),
      http.post(apiUrl("/ai/command"), async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return sse("A\n[[writeopia-block-1]]\nB");
      }),
    );
    const store = editorWith(
      { text: "a" },
      { id: "img", type: StoryTypes.IMAGE, text: null, url: "p.png" },
      { text: "b" },
    );

    await runCommand(store, "capitals", "Title");
    store.getState().dispatch({ type: "suggestAccept" });

    expect(sent).toMatchObject({ documentText: "a\n[[writeopia-block-1]]\nb", intent: "REWRITE" });
    const content = documentContent(store.getState().state);
    expect(content.map((step) => step.text)).toEqual(["Title", "A", null, "B"]);
    expect(content[2]!.id).toBe("img");
  });

  it("adds the answer when the backend cannot decide", async () => {
    server.use(
      http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ error: "unsure" })),
      http.post(apiUrl("/ai/command"), async ({ request }) => {
        const body = (await request.json()) as { intent: string };
        return sse(body.intent === "ADD" ? "added" : "wrong");
      }),
    );
    const store = editorWith({ text: "a" });

    await runCommand(store, "go", "Title");

    expect(shown(store)).toEqual(["Title", "a", "added"]);
  });

  it("puts the lines back when the AI fails, and says why", async () => {
    server.use(
      http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ intent: "REPLACE" })),
      http.post(apiUrl("/ai/command"), () =>
        new HttpResponse('data: {"response":"part"}\n\ndata: {"error":"Quota"}\n\n', {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    const store = editorWith({ text: "a" }, { text: "b" });
    store.getState().dispatch({ type: "select", ids: ["s1"] });

    await expect(runCommand(store, "x", "Title")).rejects.toThrow("Quota");

    expect(store.getState().state.suggestion).toBeNull();
    expect(shown(store)).toEqual(["Title", "a", "b"]);
  });

  it("puts the lines back when stopped", async () => {
    server.use(
      http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ intent: "ADD" })),
      http.post(apiUrl("/ai/command"), () => sse("x")),
    );
    const store = editorWith({ text: "a" });
    const controller = new AbortController();
    controller.abort();

    await expect(runCommand(store, "x", "Title", controller.signal)).rejects.toThrow();
    expect(store.getState().state.suggestion).toBeNull();
    expect(shown(store)).toEqual(["Title", "a"]);
  });
});

describe("runQuickAction", () => {
  it("sends the document and suggests the answer at its end", async () => {
    let prompt = "";
    server.use(
      http.post(apiUrl("/ai/summary"), async ({ request }) => {
        prompt = ((await request.json()) as { prompt: string }).prompt;
        return sse("In short.");
      }),
    );
    const store = editorWith({ text: "a" }, { text: "b" });

    await runQuickAction(store, "summary", "document");

    expect(prompt).toBe("a\nb");
    expect(shown(store)).toEqual(["Title", "a", "b", "In short."]);
  });

  it("sends the selected lines and suggests the answer after them", async () => {
    let prompt = "";
    server.use(
      http.post(apiUrl("/ai/action-points"), async ({ request }) => {
        prompt = ((await request.json()) as { prompt: string }).prompt;
        return sse("- [ ] Call");
      }),
    );
    const store = editorWith({ text: "a" }, { text: "b" });
    store.getState().dispatch({ type: "select", ids: ["s1"] });

    await runQuickAction(store, "actionPoints", "selection");

    expect(prompt).toBe("a");
    expect(shown(store)).toEqual(["Title", "a", "Call", "b"]);
    const call = ordered(store.getState().state)[2]!;
    expect(call.type).toEqual(StoryTypes.CHECK_ITEM);
  });

  it("removes the suggestion when the AI answers nothing", async () => {
    server.use(http.post(apiUrl("/ai/faq"), () => sse("  ")));
    const store = editorWith({ text: "a" });

    await expect(runQuickAction(store, "faq", "document")).rejects.toThrow();
    expect(store.getState().state.suggestion).toBeNull();
  });
});
