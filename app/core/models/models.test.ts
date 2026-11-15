import { describe, expect, it } from "vitest";
import { z } from "zod";

import { rankAt } from "~/core/rank/rank";

import documentFixture from "../../../test/fixtures/document-using-commands.json";
import legacySteps from "../../../test/fixtures/steps-legacy.json";
import {
  argbToCss,
  documentSchema,
  folderContentsSchema,
  folderSchema,
  hexToArgb,
  isStoryType,
  isUiOnlyStoryType,
  storyStepSchema,
  storyTypeKey,
  StoryTypes,
  tagCarriesOver,
  userSchema,
  workspaceSchema,
} from "./index";

describe("colors", () => {
  it("reads the signed integers of the other apps", () => {
    expect(argbToCss(-65536)).toBe("#ff0000");
    expect(argbToCss(-256)).toBe("#ffff00");
    expect(argbToCss(-1)).toBe("#ffffff");
    expect(argbToCss(0xff000000 | 0)).toBe("#000000");
  });

  it("keeps the transparency", () => {
    expect(argbToCss(0x33f58071)).toBe("rgba(245, 128, 113, 0.2)");
    expect(argbToCss(0)).toBe("rgba(0, 0, 0, 0)");
  });

  it("writes the same integers back", () => {
    expect(hexToArgb("#ff0000")).toBe(-65536);
    expect(hexToArgb("#FFFF00")).toBe(-256);
    expect(hexToArgb("#f00")).toBe(-65536);
    expect(hexToArgb("f5807133")).toBe(0x33f58071);
    expect(hexToArgb("red")).toBeNull();
  });

  it("round trips", () => {
    for (const argb of [-65536, -256, -1, -16777216, 0x33f58071]) {
      const css = argbToCss(argb);
      if (css.startsWith("#")) expect(hexToArgb(css)).toBe(argb);
    }
  });
});

describe("story types", () => {
  it("finds a type by its number", () => {
    expect(storyTypeKey({ number: 11 })).toBe("TITLE");
    expect(storyTypeKey({ number: 23 })).toBe("CODE_BLOCK");
    expect(storyTypeKey({ number: 9999 })).toBeNull();
    expect(isStoryType({ number: 0 }, "TEXT")).toBe(true);
  });

  it("has no two types with the same number", () => {
    const numbers = Object.values(StoryTypes).map((type) => type.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("knows the types that are never saved", () => {
    expect(isUiOnlyStoryType(StoryTypes.SKELETON)).toBe(true);
    expect(isUiOnlyStoryType(StoryTypes.LOADING)).toBe(true);
    expect(isUiOnlyStoryType(StoryTypes.TEXT)).toBe(false);
  });

  it("knows the tags that follow to the next line", () => {
    expect(tagCarriesOver("HIGH_LIGHT_BLOCK")).toBe(true);
    expect(tagCarriesOver("CARD_BLOCK")).toBe(true);
    expect(tagCarriesOver("H1")).toBe(false);
  });
});

describe("storyStepSchema", () => {
  it("fills what the backend leaves out", () => {
    const step = storyStepSchema.parse({ id: "a", type: { name: "message", number: 0 } });

    expect(step).toEqual({
      id: "a",
      type: { name: "message", number: 0 },
      parentId: null,
      url: null,
      path: null,
      text: null,
      checked: null,
      steps: [],
      tags: [],
      spans: [],
      decoration: { backgroundColor: null },
      position: rankAt(0),
      documentLink: null,
      lastUpdatedAt: null,
    });
  });

  it("reads a parsed step back unchanged", () => {
    const step = storyStepSchema.parse({
      id: "a",
      type: { name: "message", number: 0 },
      text: "hello",
      spans: [{ start: 0, end: 5, span: "LINK", extra: "https://writeopia.io" }],
      tags: [{ tag: "H1", position: 0 }],
      position: "0001000003i",
    });

    expect(storyStepSchema.parse(structuredClone(step))).toEqual(step);
  });

  it("reads the positions saved before the ranks", () => {
    const parse = (position: unknown) =>
      storyStepSchema.parse({ id: "a", type: { name: "message", number: 0 }, position }).position;

    expect(parse(0)).toBe(rankAt(0));
    expect(parse(7)).toBe(rankAt(7));
    expect(parse(-3)).toBe(rankAt(0));
    expect(parse("0001000002i")).toBe("0001000002i");
    expect(parse(null)).toBe(rankAt(0));
  });

  it("reads the steps inside a step", () => {
    const step = storyStepSchema.parse({
      id: "sheet",
      type: StoryTypes.SPREADSHEET,
      steps: [
        {
          id: "row",
          type: StoryTypes.SPREADSHEET_ROW,
          steps: [{ id: "cell", type: StoryTypes.SPREADSHEET_CELL, text: "1" }],
        },
      ],
    });

    expect(step.steps[0]?.steps[0]?.text).toBe("1");
    expect(step.steps[0]?.steps[0]?.steps).toEqual([]);
  });

  it("drops fields it does not know, like the old title of a step", () => {
    const steps = z.array(storyStepSchema).parse(legacySteps);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).not.toHaveProperty("title");
    expect(steps[0]?.type.name).toBe("title");
    expect(steps[1]?.position).toBe(rankAt(1));
  });

  it("refuses a step without an id or a type", () => {
    expect(storyStepSchema.safeParse({ type: StoryTypes.TEXT }).success).toBe(false);
    expect(storyStepSchema.safeParse({ id: "a" }).success).toBe(false);
  });
});

describe("documentSchema", () => {
  it("reads a document written by the desktop app", () => {
    const document = documentSchema.parse(documentFixture);

    expect(document.title).toBe("Using Commands");
    expect(document.parentId).toBe("root");
    expect(document.icon).toEqual({ label: "command", tint: -256 });
    expect(document.content).toHaveLength(28);
    expect(document.content[0]?.type.name).toBe("title");
    expect(document.content[0]?.decoration.backgroundColor).toBe(-65536);
    expect(document.isFavorite).toBe(false);
    expect(document.tagIds).toEqual([]);
    expect(document.commentConversations).toEqual([]);
  });

  it("sorts the content by position", () => {
    const document = documentSchema.parse({
      workspaceId: "w",
      content: [
        { id: "c", type: StoryTypes.TEXT, position: "0001000002" },
        { id: "a", type: StoryTypes.TITLE, position: "0001000000" },
        { id: "b", type: StoryTypes.TEXT, position: "0001000000i" },
      ],
    });

    expect(document.content.map((step) => step.id)).toEqual(["a", "b", "c"]);
  });

  it("needs a workspace", () => {
    expect(documentSchema.safeParse({ id: "a" }).success).toBe(false);
  });
});

describe("folders, workspaces and users", () => {
  it("reads a folder with its times as numbers or as text", () => {
    const base = { id: "f", parentId: "root", title: "Work", workspaceId: "w", itemCount: 3 };

    expect(folderSchema.parse({ ...base, createdAt: 10, lastUpdatedAt: 20 }).lastUpdatedAt).toBe(
      20,
    );
    expect(
      folderSchema.parse({
        ...base,
        createdAt: "2026-01-01T00:00:00Z",
        lastUpdatedAt: "2026-01-01T00:00:00Z",
      }).createdAt,
    ).toBe(Date.UTC(2026, 0, 1));
    expect(folderSchema.safeParse({ ...base, createdAt: "soon", lastUpdatedAt: 1 }).success).toBe(
      false,
    );
  });

  it("reads the contents of an empty folder", () => {
    expect(folderContentsSchema.parse({})).toEqual({ folders: [], documents: [], tags: [] });
  });

  it("reads roles and tiers whatever their case, with safe fallbacks", () => {
    const workspace = { id: "w", userId: "u", name: "Home" };

    expect(workspaceSchema.parse({ ...workspace, role: "admin" }).role).toBe("ADMIN");
    expect(workspaceSchema.parse({ ...workspace, role: "viewer" }).role).toBe("EDITOR");

    const user = { id: "u", email: "a@b.c", name: "Ana" };

    expect(userSchema.parse(user).tier).toBe("FREE");
    expect(userSchema.parse({ ...user, tier: "premium" }).tier).toBe("PREMIUM");
    expect(userSchema.parse({ ...user, tier: "gold" }).tier).toBe("FREE");
  });
});
