import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoryTypes } from "~/core/models";
import { newBlock } from "~/features/editor/state/blocks";
import type { Block } from "~/features/editor/state/types";

import { type AgentDocument, type AgentState, sentenceEnds, WritingAgent } from "./agent";
import type { WritingSuggestion, WritingSuggestionsRequest } from "./api";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const title = (text: string) => newBlock(StoryTypes.TITLE, { id: "title", text });
const line = (id: string, text: string) => newBlock(StoryTypes.TEXT, { id, text });

function doc(blocks: Block[], fields: Partial<AgentDocument> = {}): AgentDocument {
  return { blocks, focusId: null, inRoot: false, hasTags: true, ...fields };
}

function agentWith(answer: WritingSuggestion[] | Error = []) {
  const asked: WritingSuggestionsRequest[] = [];
  let state: AgentState | null = null;
  const agent = new WritingAgent({
    ask: (request) => {
      asked.push(request);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    onChange: (next) => {
      state = next;
    },
  });
  return { agent, asked, state: () => state! };
}

describe("sentenceEnds (SentenceEnds.kt)", () => {
  it("counts the full stops, the marks and the colons", () => {
    expect(sentenceEnds("One. Two! Three? List:")).toBe(4);
    expect(sentenceEnds("")).toBe(0);
  });
});

describe("WritingAgent (WritingAgentController.kt)", () => {
  it("asks about a paragraph when one of its sentences ends, once the typing pauses", async () => {
    const { agent, asked, state } = agentWith([{ action: "LIST", probability: 0.9 }]);
    agent.open(doc([title("Trip"), line("p", "We need")]));

    agent.update(doc([title("Trip"), line("p", "We need")], { focusId: "p" }));
    agent.update(doc([title("Trip"), line("p", "We need:")], { focusId: "p" }));
    agent.update(doc([title("Trip"), line("p", "We need: a")], { focusId: "p" }));
    expect(asked).toEqual([]);

    await vi.advanceTimersByTimeAsync(600);

    expect(asked).toEqual([
      {
        scope: "WRITING",
        text: "We need: a",
        blockType: "message",
        documentTitle: "Trip",
        documentText: "Trip\nWe need: a",
      },
    ]);
    expect(state()).toMatchObject({
      blockId: "p",
      suggestions: [{ action: "LIST", probability: 0.9 }],
    });
  });

  it("does not ask while the number of sentences stays the same", async () => {
    const { agent, asked } = agentWith();
    agent.open(doc([title("T"), line("p", "One.")]));
    agent.update(doc([title("T"), line("p", "One.")], { focusId: "p" }));
    agent.update(doc([title("T"), line("p", "One. Two")], { focusId: "p" }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toEqual([]);
  });

  it("asks about the whole document when a long one opens", async () => {
    const { agent, asked, state } = agentWith([{ action: "TLDR", probability: 0.8 }]);
    const long = "x".repeat(200);

    agent.open(doc([title("T"), line("p", long)]));
    await vi.advanceTimersByTimeAsync(0);

    expect(asked).toEqual([
      { scope: "DOCUMENT_OPENED", documentTitle: "T", documentText: `T\n${long}` },
    ]);
    expect(state().blockId).toBe("title");
  });

  it("offers a title to a document with a sentence and no title, until it is taken", () => {
    const { agent, state } = agentWith();
    agent.open(doc([title(""), line("p", "Some text.")]));

    expect(state().suggestions[0]).toEqual({ action: "DOCUMENT_TITLE", probability: 1 });

    agent.take("DOCUMENT_TITLE");
    expect(state().suggestions).toEqual([]);
    agent.update(doc([title(""), line("p", "Some text. More.")]));
    expect(state().suggestions).toEqual([]);
  });

  it("does not offer again what was dismissed for the same paragraph", async () => {
    const { agent, state } = agentWith([
      { action: "LIST", probability: 0.9 },
      { action: "CODE_BLOCK", probability: 0.7 },
    ]);
    agent.open(doc([title("T"), line("p", "a")]));
    agent.update(doc([title("T"), line("p", "a")], { focusId: "p" }));
    agent.update(doc([title("T"), line("p", "a.")], { focusId: "p" }));
    await vi.advanceTimersByTimeAsync(600);
    agent.take("LIST");
    expect(state().suggestions.map((each) => each.action)).toEqual(["CODE_BLOCK"]);

    agent.dismiss();
    expect(state().suggestions).toEqual([]);

    agent.update(doc([title("T"), line("p", "a. b.")], { focusId: "p" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(state().suggestions).toEqual([]);

    agent.update(doc([title("T"), line("p", "a. b."), line("q", "c.")], { focusId: "q" }));
    agent.update(doc([title("T"), line("p", "a. b."), line("q", "c. d.")], { focusId: "q" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(state().suggestions.map((each) => each.action)).toEqual(["LIST", "CODE_BLOCK"]);
  });

  it("leaves out the blocks this app cannot add yet", async () => {
    const { agent, state } = agentWith([
      { action: "DRAWING", probability: 0.9 },
      { action: "SPREADSHEET", probability: 0.9 },
      { action: "CALLOUT", probability: 0.6 },
    ]);
    agent.open(doc([title("T"), line("p", "a")]));
    agent.update(doc([title("T"), line("p", "a")], { focusId: "p" }));
    agent.update(doc([title("T"), line("p", "a.")], { focusId: "p" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(state().suggestions.map((each) => each.action)).toEqual(["CALLOUT"]);
  });

  it("shows nothing when the backend fails", async () => {
    const { agent, state } = agentWith(new Error("down"));
    agent.open(doc([title("T"), line("p", "a")]));
    agent.update(doc([title("T"), line("p", "a")], { focusId: "p" }));
    agent.update(doc([title("T"), line("p", "a.")], { focusId: "p" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(state()).toMatchObject({ suggestions: [], loading: false });
  });

  it("offers a folder to a document of the root with enough text, until declined", () => {
    const { agent, state } = agentWith();
    const text = "y".repeat(40);
    agent.open(doc([title("T"), line("p", "short")], { inRoot: true }));
    expect(state().offerFolder).toBe(false);

    agent.update(doc([title("T"), line("p", text)], { inRoot: true }));
    expect(state().offerFolder).toBe(true);

    agent.declineFolder();
    agent.update(doc([title("T"), line("p", `${text}z`)], { inRoot: true }));
    expect(state().offerFolder).toBe(false);
  });

  it("offers no folder to a document in a folder", () => {
    const { agent, state } = agentWith();
    agent.open(doc([title("T"), line("p", "y".repeat(50))], { inRoot: false }));
    expect(state().offerFolder).toBe(false);
  });

  it("offers tags to an untagged document, and withdraws them when it gets some", () => {
    const { agent, state } = agentWith();
    const blocks = [title("T"), line("p", "y".repeat(50))];
    agent.open(doc(blocks, { hasTags: false }));
    expect(state().offerTags).toBe(true);

    agent.update(doc(blocks, { hasTags: true }));
    expect(state().offerTags).toBe(false);
  });

  it("stops asking once stopped", async () => {
    const { agent, asked } = agentWith();
    agent.open(doc([title("T"), line("p", "a")]));
    agent.update(doc([title("T"), line("p", "a")], { focusId: "p" }));
    agent.update(doc([title("T"), line("p", "a.")], { focusId: "p" }));
    agent.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toEqual([]);
  });
});
