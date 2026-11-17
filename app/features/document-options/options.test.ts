import { describe, expect, it } from "vitest";

import { documentSchema, StoryTypes, Tags } from "~/core/models";

import { aDocument, aStep } from "../../../test/fixtures";
import { documentJson, documentMarkdown, documentText, exportFileName } from "./export";
import { FONT_KEY, fontFamily, parseFont, useEditorFont } from "./font";
import { type Generation, generationReducer } from "./generation";

describe("header picture generation", () => {
  const idle: Generation = { kind: "idle" };

  it("goes from idle to generating to a picture", () => {
    const generating = generationReducer(idle, { type: "start" });
    expect(generating).toEqual({ kind: "generating" });
    expect(generationReducer(generating, { type: "succeeded", url: "u" })).toEqual({
      kind: "generated",
      url: "u",
      saving: false,
      saveFailed: false,
    });
  });

  it("fails from generating, with the reason", () => {
    const failed = generationReducer({ kind: "generating" }, { type: "failed", message: "no" });
    expect(failed).toEqual({ kind: "failed", message: "no" });
  });

  it("drops an answer that arrives after a discard", () => {
    const discarded = generationReducer({ kind: "generating" }, { type: "discard" });
    expect(discarded).toEqual(idle);
    expect(generationReducer(discarded, { type: "succeeded", url: "u" })).toEqual(idle);
    expect(generationReducer(discarded, { type: "failed", message: null })).toEqual(idle);
  });

  it("does not start twice", () => {
    const generating: Generation = { kind: "generating" };
    expect(generationReducer(generating, { type: "start" })).toBe(generating);
  });

  it("draws another in place of a picture or after a failure", () => {
    const generated: Generation = { kind: "generated", url: "u", saving: false, saveFailed: false };
    expect(generationReducer(generated, { type: "start" })).toEqual({ kind: "generating" });
    expect(generationReducer({ kind: "failed", message: null }, { type: "start" })).toEqual({
      kind: "generating",
    });
  });

  it("saves the picture used, back to idle once kept", () => {
    const generated: Generation = { kind: "generated", url: "u", saving: false, saveFailed: false };
    const saving = generationReducer(generated, { type: "saving" });
    expect(saving).toEqual({ ...generated, saving: true });
    expect(generationReducer(saving, { type: "saved", url: "u" })).toEqual(idle);
  });

  it("keeps the picture when it could not be kept, to try again", () => {
    const saving: Generation = { kind: "generated", url: "u", saving: true, saveFailed: false };
    expect(generationReducer(saving, { type: "saveFailed", url: "u" })).toEqual({
      kind: "generated",
      url: "u",
      saving: false,
      saveFailed: true,
    });
  });

  it("ignores the end of a save of a picture already replaced", () => {
    const other: Generation = { kind: "generated", url: "v", saving: false, saveFailed: false };
    expect(generationReducer(other, { type: "saved", url: "u" })).toBe(other);
    expect(generationReducer(other, { type: "saveFailed", url: "u" })).toBe(other);
  });
});

describe("export", () => {
  const steps = [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Trip", position: "0001000000" }),
    aStep({ id: "h", text: "Days", tags: [{ tag: Tags.H2, position: 0 }], position: "0002" }),
    aStep({ id: "c", type: StoryTypes.CHECK_ITEM, text: "Tickets", position: "0003" }),
    aStep({ id: "l", type: StoryTypes.UNORDERED_LIST_ITEM, text: "Lisbon", position: "0004" }),
  ];

  it("writes the document as Markdown, title first", () => {
    expect(documentMarkdown(steps)).toBe("# Trip\n## Days\n[] Tickets\n- Lisbon\n");
  });

  it("writes the text of the document without its title, for the AI", () => {
    expect(documentText(steps)).toBe("Days\nTickets\nLisbon");
  });

  it("writes the document as the JSON the other apps import", () => {
    const document = aDocument({ title: "old" });
    const json = documentJson(document, [...steps, { ...steps[1]!, id: "e", ephemeral: true }]);
    const parsed = documentSchema.parse(JSON.parse(json));
    expect(parsed.title).toBe("Trip");
    expect(parsed.content.map((step) => step.id)).toEqual(["title", "h", "c", "l"]);
    expect(json).not.toContain("ephemeral");
  });

  it("names the file after the title, without characters a file can not have", () => {
    expect(exportFileName("Trip: 2026/27?", "md")).toBe("Trip 2026 27.md");
    expect(exportFileName("  ", "json")).toBe("Untitled.json");
  });
});

describe("editor font", () => {
  it("reads System for a missing or unknown value", () => {
    expect(parseFont(null)).toBe("System");
    expect(parseFont("Comic")).toBe("System");
    expect(parseFont("Serif")).toBe("Serif");
  });

  it("is remembered by the browser", () => {
    useEditorFont.getState().setFont("Monospace");
    expect(window.localStorage.getItem(FONT_KEY)).toBe("Monospace");
    useEditorFont.getState().reload();
    expect(useEditorFont.getState().font).toBe("Monospace");
  });

  it("gives each font a CSS family", () => {
    expect(fontFamily("System")).toBe("inherit");
    expect(fontFamily("Serif")).toContain("serif");
    expect(fontFamily("Monospace")).toContain("monospace");
    expect(fontFamily("Cursive")).toContain("cursive");
  });
});
