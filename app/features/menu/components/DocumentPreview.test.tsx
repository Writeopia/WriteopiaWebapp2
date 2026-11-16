import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hexToArgb, StoryTypes, Tags } from "~/core/models";
import { rankAt } from "~/core/rank/rank";

import { aDocument, aStep, theUsingCommandsDocument } from "../../../../test/fixtures";
import {
  documentHeader,
  DocumentPreview,
  isPreviewable,
  previewSnippet,
  previewSteps,
} from "./DocumentPreview";

const title = aStep({ id: "title", type: StoryTypes.TITLE, text: "Trip", position: rankAt(0) });

describe("DocumentPreview", () => {
  it("draws text, and headings by their tag", () => {
    render(
      <DocumentPreview
        steps={[
          aStep({ id: "a", text: "Plain line" }),
          aStep({ id: "b", text: "Big title", tags: [{ tag: Tags.H1, position: 0 }] }),
        ]}
      />,
    );

    expect(screen.getByText("Plain line")).not.toHaveClass("font-bold");
    expect(screen.getByText("Big title")).toHaveClass("font-bold");
  });

  it("draws checkboxes, striking the ones that are done", () => {
    render(
      <DocumentPreview
        steps={[
          aStep({ id: "a", type: StoryTypes.CHECK_ITEM, text: "Buy corn", checked: false }),
          aStep({ id: "b", type: StoryTypes.CHECK_ITEM, text: "Buy rice", checked: true }),
        ]}
      />,
    );

    expect(screen.getByText("Buy corn")).not.toHaveClass("line-through");
    expect(screen.getByText("Buy rice")).toHaveClass("line-through");
  });

  it("draws list items, code, images, dividers and links", () => {
    const { container } = render(
      <DocumentPreview
        steps={[
          aStep({ id: "a", type: StoryTypes.UNORDERED_LIST_ITEM, text: "An item" }),
          aStep({ id: "b", type: StoryTypes.CODE_BLOCK, text: "val x = 1" }),
          aStep({ id: "c", type: StoryTypes.IMAGE, text: null, url: "https://img.test/a.png" }),
          aStep({ id: "d", type: StoryTypes.DIVIDER, text: null }),
          aStep({
            id: "e",
            type: StoryTypes.DOCUMENT_LINK,
            text: null,
            documentLink: { id: "other", title: "Other page" },
          }),
          aStep({ id: "f", type: StoryTypes.LINK_CARD, text: "", url: "https://writeopia.io" }),
        ]}
      />,
    );

    expect(screen.getByText("•")).toBeInTheDocument();
    expect(screen.getByText("An item")).toBeInTheDocument();
    expect(screen.getByText("val x = 1").tagName).toBe("PRE");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://img.test/a.png");
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(screen.getByText("Other page")).toBeInTheDocument();
    expect(screen.getByText("https://writeopia.io")).toBeInTheDocument();
  });

  it("skips the title, empty lines and the blocks it cannot draw", () => {
    expect(isPreviewable(title)).toBe(false);
    expect(isPreviewable(aStep({ text: "   " }))).toBe(false);
    expect(isPreviewable(aStep({ type: StoryTypes.IMAGE, url: null }))).toBe(false);
    expect(isPreviewable(aStep({ type: StoryTypes.SPREADSHEET, text: "x" }))).toBe(false);
    expect(isPreviewable(aStep({ type: { name: "from_the_future", number: 999 } }))).toBe(false);
  });

  it("takes the first steps that draw something, up to the limit", () => {
    const document = aDocument({
      content: [
        title,
        aStep({ id: "empty", text: "" }),
        aStep({ id: "one", text: "One" }),
        aStep({ id: "two", text: "Two" }),
        aStep({ id: "three", text: "Three" }),
      ],
    });

    expect(previewSteps(document, 2).map((step) => step.id)).toEqual(["one", "two"]);
    expect(previewSnippet(document)).toBe("One");
    expect(previewSnippet(aDocument({ content: [title] }))).toBe("");
  });

  it("reads the header from the title step: a picture, a color, or none", () => {
    const red = hexToArgb("#ff0000")!;
    const withColor = { ...title, decoration: { backgroundColor: red } };
    const withPicture = { ...title, url: "https://img.test/header.png" };

    expect(documentHeader(aDocument({ content: [title] }))).toBeNull();
    expect(documentHeader(aDocument({ content: [withColor] }))).toEqual({ color: "#ff0000" });
    expect(documentHeader(aDocument({ content: [withPicture] }))).toEqual({
      imageUrl: "https://img.test/header.png",
    });
  });

  it("previews a document written by the desktop app", () => {
    const steps = previewSteps(theUsingCommandsDocument(), 4);

    expect(steps).toHaveLength(4);
    render(<DocumentPreview steps={steps} />);
    expect(screen.getAllByRole("paragraph").length).toBeGreaterThan(0);
  });
});
