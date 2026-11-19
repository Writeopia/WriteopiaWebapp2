import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { type Document, StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";
import { Toaster } from "~/core/ui";
import { BlockContent } from "~/features/editor/blocks/BlockContent";
import {
  type EditorActions,
  EditorActionsContext,
} from "~/features/editor/components/editorContext";
import { find, ordered } from "~/features/editor/state/reducer";
import { createEditorStore, EditorStoreContext, useEditor } from "~/features/editor/state/store";

import { aDocument, aStep } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { DrawingHost } from "./components/DrawingHost";
import { useDrawingDialog } from "./dialogs";
import { parseDrawing } from "./model";

const SCRIBBLE =
  '{"id":"d1","strokes":[{"id":"s1","points":[{"x":10.0,"y":20.0},{"x":30.0,"y":40.0}]}]}';

function documentWith(text: string | null): Document {
  return aDocument({
    content: [
      aStep({ id: "title", type: StoryTypes.TITLE, text: "Notes", position: rankAt(0) }),
      aStep({ id: "drawing", type: StoryTypes.DRAWING, text, position: rankAt(1) }),
    ],
  });
}

function Blocks() {
  const state = useEditor((store) => store.state);
  const blocks = ordered(state);
  return (
    <>
      {blocks.map((block) => (
        <div key={block.id} data-testid={`block-${block.id}`}>
          <BlockContent block={block} readOnly={false} />
        </div>
      ))}
      <DrawingHost />
    </>
  );
}

const noop = () => undefined;
const actions: EditorActions = {
  insertMedia: noop,
  openLinkDialog: noop,
  addPage: noop,
  openDocument: noop,
  askAi: noop,
  focusCanvas: noop,
};

/** The blocks of a document and the drawing dialog, over an editor store, like the editor. */
function renderEditor(document: Document) {
  const store = createEditorStore();
  store.getState().dispatch({ type: "load", document, readOnly: false });
  function Harness() {
    const [value] = useState(store);
    return (
      <EditorStoreContext value={value}>
        <EditorActionsContext value={actions}>
          <Blocks />
        </EditorActionsContext>
      </EditorStoreContext>
    );
  }
  render(
    <>
      <Harness />
      <Toaster />
    </>,
  );
  return store;
}

const block = (store: ReturnType<typeof createEditorStore>, id: string) =>
  find(store.getState().state, id)?.block;

function draw(canvas: HTMLElement, points: [number, number][]) {
  const [first, ...rest] = points;
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    button: 0,
    clientX: first![0],
    clientY: first![1],
  });
  for (const [x, y] of rest)
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

describe("a drawing in the document", () => {
  it("shows a preview with its options", () => {
    renderEditor(documentWith(SCRIBBLE));

    const figure = screen.getByTestId("block-drawing");
    expect(within(figure).getByRole("img", { name: "Drawing" })).toBeInTheDocument();
    expect(within(figure).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(figure).getByRole("button", { name: "Convert to equation" })).toBeEnabled();
  });

  it("says when a drawing is empty, and does not convert it", () => {
    renderEditor(documentWith(null));

    expect(screen.getByText("An empty drawing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to equation" })).toBeDisabled();
  });

  it("edits the drawing in the dialog and saves it to the step", async () => {
    const store = renderEditor(documentWith(SCRIBBLE));

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Drawing" });
    const canvas = within(dialog).getByLabelText("Drawing canvas");
    expect(canvas).toHaveAttribute("data-strokes", "1");

    await userEvent.click(within(dialog).getByRole("radio", { name: "Highlighter" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Width 12" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Color #ff0000" }));
    draw(canvas, [
      [5, 5],
      [15, 25],
    ]);
    expect(canvas).toHaveAttribute("data-strokes", "2");

    await userEvent.click(within(dialog).getByRole("button", { name: "Undo" }));
    expect(canvas).toHaveAttribute("data-strokes", "1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Redo" }));
    expect(canvas).toHaveAttribute("data-strokes", "2");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const saved = parseDrawing(block(store, "drawing")?.text)!;
    expect(saved.id).toBe("d1");
    expect(saved.strokes).toHaveLength(2);
    expect(saved.strokes[1]).toMatchObject({
      tool: "HIGHLIGHTER",
      strokeWidth: 12,
      color: -65536,
      points: [
        { x: 5, y: 5, pressure: 1 },
        { x: 15, y: 25, pressure: 1 },
      ],
    });
  });

  it("drops the changes on Cancel", async () => {
    const store = renderEditor(documentWith(SCRIBBLE));

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Drawing" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(block(store, "drawing")?.text).toBe(SCRIBBLE);
  });

  it("adds a new drawing after a block", async () => {
    const store = renderEditor(documentWith(SCRIBBLE));

    useDrawingDialog.getState().open({ kind: "new", afterId: "title" });
    const dialog = await screen.findByRole("dialog", { name: "Drawing" });
    draw(within(dialog).getByLabelText("Drawing canvas"), [
      [1, 1],
      [2, 2],
    ]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const blocks = ordered(store.getState().state);
    // Right after the title; the editor keeps a line to write on after it, as for images.
    expect(blocks[0]!.type).toEqual(StoryTypes.TITLE);
    expect(blocks[1]!.type).toEqual(StoryTypes.DRAWING);
    expect(blocks.filter((each) => each.type.number === StoryTypes.DRAWING.number)).toHaveLength(2);
    expect(parseDrawing(blocks[1]!.text)?.strokes).toHaveLength(1);
  });

  it("becomes the equation the AI reads in it", async () => {
    const asked: unknown[] = [];
    server.use(
      http.post(apiUrl("/ai/equation/recognize"), async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json({ latex: "x^2", imageUrl: "https://cdn.test/eq.png" });
      }),
    );
    const store = renderEditor(documentWith(SCRIBBLE));

    await userEvent.click(screen.getByRole("button", { name: "Convert to equation" }));

    await waitFor(() => expect(block(store, "drawing")?.type).toEqual(StoryTypes.EQUATION));
    expect(block(store, "drawing")).toMatchObject({ text: "x^2", url: "https://cdn.test/eq.png" });
    expect(asked).toEqual([{ drawing: SCRIBBLE }]);
    expect(await screen.findByRole("img", { name: "x^2" })).toHaveAttribute(
      "src",
      "https://cdn.test/eq.png",
    );
  });

  it("says why the equation could not be read", async () => {
    server.use(
      http.post(apiUrl("/ai/equation/recognize"), () =>
        HttpResponse.json({ error: "The drawing is empty" }, { status: 400 }),
      ),
    );
    const store = renderEditor(documentWith(SCRIBBLE));

    await userEvent.click(screen.getByRole("button", { name: "Convert to equation" }));

    expect(
      await screen.findByText("The equation could not be read: The drawing is empty"),
    ).toBeInTheDocument();
    expect(block(store, "drawing")?.type).toEqual(StoryTypes.DRAWING);
  });
});
