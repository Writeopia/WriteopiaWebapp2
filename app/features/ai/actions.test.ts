import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type StoryStep, StoryTypes, Tags } from "~/core/models";
import { rankAt, rankConfig } from "~/core/rank/rank";
import { hasTag } from "~/features/editor/state/blocks";
import { ordered } from "~/features/editor/state/reducer";
import { createEditorStore } from "~/features/editor/state/store";

import { aDocument, aStep } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import {
  applyWritingAction,
  drawParagraphImage,
  markdownCode,
  markdownList,
  oneLine,
} from "./actions";

beforeEach(() => {
  rankConfig.jitter = false;
});
afterEach(() => {
  rankConfig.jitter = true;
});

function editorWith(...steps: Partial<StoryStep>[]) {
  const store = createEditorStore();
  const content = [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Trip", position: rankAt(0) }),
    ...steps.map((step, index) =>
      aStep({ id: `s${index + 1}`, position: rankAt(index + 1), checked: null, ...step }),
    ),
  ];
  store.getState().dispatch({ type: "load", document: aDocument({ content }), readOnly: false });
  return store;
}

function generating(answer: string, prompts: string[] = []) {
  server.use(
    http.post(apiUrl("/ai/generate"), async ({ request }) => {
      prompts.push(((await request.json()) as { prompt: string }).prompt);
      return new HttpResponse(`data: ${JSON.stringify({ response: answer, done: true })}\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return prompts;
}

function visible(store: ReturnType<typeof createEditorStore>) {
  return ordered(store.getState().state).filter((block) => !block.hidden);
}

const context = (store: ReturnType<typeof createEditorStore>) => ({
  store,
  addPage: () => undefined,
});

describe("reading the answers (MarkdownList.kt, MarkdownCode.kt, AiTextWriter.askOneLine)", () => {
  it("reads the items of a list, whatever their marker", () => {
    expect(markdownList("Here:\n- a\n* b\n2. c\n- [ ] d\n•  e\n")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("reads the code of the first fence, or the whole answer without one", () => {
    expect(markdownCode("Sure:\n```ts\nconst a = 1;\n```\nDone")).toBe("const a = 1;");
    expect(markdownCode("```\na\n``` not a close\n```")).toBe("a\n``` not a close");
    expect(markdownCode("\nplain\n")).toBe("plain");
  });

  it("cleans a one-line answer of Markdown and quotes", () => {
    expect(oneLine('\n## "A Trip to Lisbon."\nmore')).toBe("A Trip to Lisbon");
  });
});

describe("applyWritingAction (WriteopiaActionExecutor.kt)", () => {
  it("suggests the list the paragraph announces, right below it", async () => {
    const prompts = generating("- Passport\n- Tickets");
    const store = editorWith({ text: "We need:" }, { text: "After" });

    await applyWritingAction("LIST", "s1", context(store));

    expect(visible(store).map((block) => [block.type.name, block.text])).toEqual([
      ["title", "Trip"],
      ["message", "We need:"],
      ["unordered_list_item", "Passport"],
      ["unordered_list_item", "Tickets"],
      ["message", "After"],
    ]);
    expect(prompts[0]).toContain("Title: Trip\nParagraph: We need:");
    expect(store.getState().state.suggestion?.streaming).toBe(false);
  });

  it("suggests a checklist", async () => {
    generating("- Book");
    const store = editorWith({ text: "To do:" });
    await applyWritingAction("CHECK_LIST", "s1", context(store));
    const item = visible(store)[2]!;
    expect(item.type).toEqual(StoryTypes.CHECK_ITEM);
    expect(item.checked).toBe(false);
  });

  it("suggests one code block with the code of the answer", async () => {
    generating("```bash\nls -la\npwd\n```");
    const store = editorWith({ text: "Run this:" });
    await applyWritingAction("CODE_BLOCK", "s1", context(store));
    expect(visible(store)[2]).toMatchObject({ type: StoryTypes.CODE_BLOCK, text: "ls -la\npwd" });
  });

  it("suggests a heading above the paragraph", async () => {
    generating("# Packing");
    const store = editorWith({ text: "First" }, { text: "We pack light." });
    await applyWritingAction("SECTION_HEADING", "s2", context(store));
    const blocks = visible(store);
    expect(blocks.map((block) => block.text)).toEqual([
      "Trip",
      "First",
      "Packing",
      "We pack light.",
    ]);
    expect(hasTag(blocks[2]!, Tags.H2)).toBe(true);
  });

  it("suggests a TL;DR card under the title", async () => {
    generating("Short trip.");
    const store = editorWith({ text: "a" });
    await applyWritingAction("TLDR", null, context(store));
    const card = visible(store)[1]!;
    expect(card.text).toBe("TLDR: Short trip.");
    expect(hasTag(card, Tags.CARD_BLOCK)).toBe(true);
  });

  it("suggests a conclusion at the end", async () => {
    generating("All in all, fun.");
    const store = editorWith({ text: "a" }, { text: "b" });
    await applyWritingAction("CONCLUSION", "s1", context(store));
    expect(visible(store).map((block) => block.text)).toEqual([
      "Trip",
      "a",
      "b",
      "All in all, fun.",
    ]);
  });

  it("writes the title into the title block", async () => {
    generating('"Lisbon in May"');
    const store = editorWith({ text: "We went to Lisbon." });
    store.getState().dispatch({ type: "updateBlock", id: "title", changes: { text: "" } });
    await applyWritingAction("DOCUMENT_TITLE", null, context(store));
    expect(visible(store)[0]!.text).toBe("Lisbon in May");
    expect(store.getState().state.suggestion).toBeNull();
  });

  it("makes the paragraph a callout without asking the AI", async () => {
    const store = editorWith({ text: "Important." });
    await applyWritingAction("CALLOUT", "s1", context(store));
    expect(hasTag(visible(store)[1]!, Tags.HIGH_LIGHT_BLOCK)).toBe(true);
  });

  it("links a new document below the paragraph", async () => {
    let added = 0;
    const store = editorWith({ text: "See the plan." }, { text: "After" });
    await applyWritingAction("NEW_DOCUMENT_LINK", "s1", {
      store,
      addPage: () => {
        added++;
      },
    });
    expect(added).toBe(1);
    const state = store.getState().state;
    expect(state.focus?.id).toBe(visible(store)[2]!.id);
    expect(visible(store)[2]!.text).toBe("");
  });
});

describe("drawParagraphImage", () => {
  it("suggests the picture the AI drew below the paragraph", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/ai/image"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ imageUrl: "https://cdn/lisbon.png" });
      }),
    );
    const store = editorWith({ text: "The tram climbs the hill." }, { text: "After" });

    await drawParagraphImage(store, "s1");

    expect(body).toEqual({
      paragraph: "The tram climbs the hill.",
      documentTitle: "Trip",
      documentText: "The tram climbs the hill.\nAfter",
    });
    expect(visible(store)[2]).toMatchObject({
      type: StoryTypes.IMAGE,
      url: "https://cdn/lisbon.png",
    });
  });

  it("takes the loading block away when the AI draws nothing", async () => {
    server.use(http.post(apiUrl("/ai/image"), () => HttpResponse.json({ error: "Blocked" })));
    const store = editorWith({ text: "Text." });

    await expect(drawParagraphImage(store, "s1")).rejects.toThrow("Blocked");
    expect(visible(store)).toHaveLength(2);
    expect(store.getState().state.suggestion).toBeNull();
  });
});
