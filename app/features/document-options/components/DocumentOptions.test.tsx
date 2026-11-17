import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ComponentProps } from "react";
import { useParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type DocumentTag, ROOT_FOLDER_ID, type StoryStep, StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";
import DocumentRoute from "~/routes/app/document";

import {
  aDocument,
  aFolder,
  aStep,
  aUser,
  aWorkspace,
  WORKSPACE_ID,
} from "../../../../test/fixtures";
import { apiUrl } from "../../../../test/msw/handlers";
import { menuBackend } from "../../../../test/msw/menuBackend";
import { server } from "../../../../test/msw/server";
import { renderAppRoute } from "../../../../test/render";
import { FONT_KEY, useEditorFont } from "../font";

const RED = -65536;

const trip = aDocument({
  id: "trip",
  title: "Trip",
  content: [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Trip", position: rankAt(0) }),
    aStep({ id: "line-1", text: "Lisbon in May", position: rankAt(1) }),
  ],
});

const travel: DocumentTag = {
  id: "tag-travel",
  workspaceId: WORKSPACE_ID,
  name: "Travel",
  description: "Trips and plans",
  createdAt: 1,
  lastUpdatedAt: 1,
  deleted: false,
};
const work: DocumentTag = { ...travel, id: "tag-work", name: "Work", description: "" };

type Backend = ReturnType<typeof menuBackend> & {
  /** The title steps sent by the step sync, in order. */
  titles: StoryStep[];
  generations: Record<string, unknown>[];
  savedPictures: string[];
  published: { value: boolean };
};

function backend({
  tags = [travel, work],
  aiAvailable = true,
  pictures = ["https://cdn/one.png"],
}: { tags?: DocumentTag[]; aiAvailable?: boolean; pictures?: string[] } = {}): Backend {
  const menu = menuBackend({ documents: [trip], tags });
  const titles: StoryStep[] = [];
  const generations: Record<string, unknown>[] = [];
  const savedPictures: string[] = [];
  const published = { value: false };
  let drawn = 0;

  server.use(
    http.post(apiUrl("/docs/workspace/:ws/document/:id/steps/sync"), async ({ request }) => {
      const body = (await request.json()) as { changes: { storyStep: StoryStep }[] };
      for (const change of body.changes) {
        if (change.storyStep.type.number === StoryTypes.TITLE.number) {
          titles.push(change.storyStep);
        }
      }
      return HttpResponse.json({ serverTimestamp: Date.now(), updatedSteps: [], deletedIds: [] });
    }),
    http.get(apiUrl("/ai/status"), () => HttpResponse.json({ available: aiAvailable })),
    http.get(apiUrl("/ai/header-images/:ws"), () =>
      HttpResponse.json({
        images: pictures.map((url, index) => ({ id: `p${index}`, url, createdAt: 1 })),
      }),
    ),
    http.post(apiUrl("/ai/header-images/:ws"), async ({ request }) => {
      savedPictures.push(((await request.json()) as { imageUrl: string }).imageUrl);
      return new HttpResponse(null, { status: 201 });
    }),
    http.post(apiUrl("/ai/header-image"), async ({ request }) => {
      generations.push((await request.json()) as Record<string, unknown>);
      drawn++;
      return HttpResponse.json({ imageUrl: `https://cdn/drawn-${drawn}.png` });
    }),
    http.get(apiUrl("/docs/workspace/:ws/document/:id/published"), () =>
      HttpResponse.json({ published: published.value }),
    ),
    http.post(apiUrl("/docs/workspace/:ws/document/:id/publish"), () => {
      published.value = true;
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(apiUrl("/docs/workspace/:ws/document/:id/unpublish"), () => {
      published.value = false;
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(apiUrl("/docs/workspace/tag"), async ({ request }) => {
      const body = (await request.json()) as { tags: DocumentTag[] };
      menu.state.tags.push(...body.tags);
      return new HttpResponse(null, { status: 200 });
    }),
  );

  return Object.assign(menu, { titles, generations, savedPictures, published });
}

/** The route of a document, with the parameters React Router would hand it. */
function DocumentScreen() {
  const params = useParams();
  return <DocumentRoute {...({ params } as ComponentProps<typeof DocumentRoute>)} />;
}

function renderTrip(tier: "FREE" | "PREMIUM" = "PREMIUM") {
  return renderAppRoute(DocumentScreen, {
    path: "/app/document/trip",
    route: "/app/document/:documentId",
    destinations: ["/app/folder/:folderId"],
    session: { user: aUser({ tier }), workspace: aWorkspace() },
  });
}

/** The body of the last POST /document, the document's own fields. */
function lastSavedDocument(menu: Backend) {
  const call = menu.calls.filter((each) => each.path === "/api/docs/workspace/document").at(-1);
  return (call?.body as { documents: Record<string, unknown>[] } | undefined)?.documents[0];
}

async function openAction(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Document actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

async function openHeaderEditor() {
  await screen.findByRole("textbox", { name: "Title" });
  await userEvent.click(screen.getByRole("button", { name: "Edit header" }));
  return screen.findByRole("dialog", { name: "Header" });
}

const header = () => screen.getByTestId("document-header");

describe("the header", () => {
  it("takes a color, saved in the title step without a picture", async () => {
    const menu = backend();
    renderTrip();
    const dialog = await openHeaderEditor();

    await userEvent.click(within(dialog).getByRole("radio", { name: "#ff0000" }));

    expect(header()).toHaveAttribute("data-header", "color");
    expect(header()).toHaveStyle({ backgroundColor: "#ff0000" });
    await waitFor(() => expect(menu.titles.at(-1)?.decoration.backgroundColor).toBe(RED));
    expect(menu.titles.at(-1)?.url).toBeNull();
  });

  it("takes a picture of the workspace in place of the color", async () => {
    const menu = backend();
    renderTrip();
    const dialog = await openHeaderEditor();
    await userEvent.click(within(dialog).getByRole("radio", { name: "#ff0000" }));

    await userEvent.click(await within(dialog).findByRole("radio", { name: "Use this picture" }));

    expect(header()).toHaveAttribute("data-header", "picture");
    expect(screen.getByRole("img", { name: "Header picture" })).toHaveAttribute(
      "src",
      "https://cdn/one.png",
    );
    await waitFor(() => expect(menu.titles.at(-1)?.url).toBe("https://cdn/one.png"));
    expect(menu.titles.at(-1)?.decoration.backgroundColor).toBeNull();
  });

  it("goes back to no header", async () => {
    const menu = backend();
    renderTrip();
    const dialog = await openHeaderEditor();
    await userEvent.click(within(dialog).getByRole("radio", { name: "#ff0000" }));
    await waitFor(() => expect(menu.titles.at(-1)?.decoration.backgroundColor).toBe(RED));
    await userEvent.click(within(dialog).getByRole("radio", { name: "No header" }));

    expect(header()).toHaveAttribute("data-header", "none");
    await waitFor(() => expect(menu.titles.at(-1)?.decoration.backgroundColor).toBeNull());
  });

  it("draws a picture with the AI, draws another, and uses it", async () => {
    const menu = backend();
    renderTrip();
    const dialog = await openHeaderEditor();

    await userEvent.type(
      await within(dialog).findByRole("textbox", { name: "What should the picture show?" }),
      "a tram",
    );
    expect(within(dialog).getByText("Uses your AI tokens.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Generate with AI" }));

    expect(
      await within(dialog).findByRole("img", { name: "Picture drawn by the AI" }),
    ).toHaveAttribute("src", "https://cdn/drawn-1.png");
    expect(menu.generations[0]).toEqual({
      workspaceId: WORKSPACE_ID,
      documentTitle: "Trip",
      documentText: "Lisbon in May",
      instructions: "a tram",
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Try another" }));
    expect(
      await within(dialog).findByRole("img", { name: "Picture drawn by the AI" }),
    ).toHaveAttribute("src", "https://cdn/drawn-2.png");
    expect(menu.generations[1]?.instructions).toBe("a tram");

    await userEvent.click(within(dialog).getByRole("button", { name: "Use image" }));

    expect(header()).toHaveAttribute("data-header", "picture");
    await waitFor(() => expect(menu.savedPictures).toEqual(["https://cdn/drawn-2.png"]));
    await waitFor(() =>
      expect(within(dialog).queryByRole("region", { name: "Generated picture" })).toBeNull(),
    );
    await waitFor(() => expect(menu.titles.at(-1)?.url).toBe("https://cdn/drawn-2.png"));
  });

  it("drops a drawn picture that is discarded", async () => {
    const menu = backend();
    renderTrip();
    const dialog = await openHeaderEditor();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Generate with AI" }));
    await within(dialog).findByRole("img", { name: "Picture drawn by the AI" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));

    expect(within(dialog).queryByRole("img", { name: "Picture drawn by the AI" })).toBeNull();
    expect(header()).toHaveAttribute("data-header", "none");
    expect(menu.savedPictures).toEqual([]);
  });

  it("says why the AI drew nothing, and tries again", async () => {
    backend();
    server.use(
      http.post(
        apiUrl("/ai/header-image"),
        () => HttpResponse.json({ error: "No tokens left" }, { status: 429 }),
        { once: true },
      ),
    );
    renderTrip();
    const dialog = await openHeaderEditor();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Generate with AI" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No tokens left");

    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(
      await within(dialog).findByRole("img", { name: "Picture drawn by the AI" }),
    ).toBeInTheDocument();
  });

  it("keeps the picture in the header when the workspace could not keep it", async () => {
    const menu = backend();
    server.use(
      http.post(apiUrl("/ai/header-images/:ws"), () => new HttpResponse(null, { status: 500 }), {
        once: true,
      }),
    );
    renderTrip();
    const dialog = await openHeaderEditor();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Generate with AI" }));
    await within(dialog).findByRole("img", { name: "Picture drawn by the AI" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Use image" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "could not be kept with the workspace pictures",
    );
    expect(header()).toHaveAttribute("data-header", "picture");

    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it again" }));
    await waitFor(() => expect(menu.savedPictures).toEqual(["https://cdn/drawn-1.png"]));
  });

  it("offers no drawing when the AI is not available", async () => {
    backend({ aiAvailable: false });
    renderTrip();
    const dialog = await openHeaderEditor();
    await within(dialog).findByRole("radio", { name: "Use this picture" });
    expect(within(dialog).queryByRole("button", { name: "Generate with AI" })).toBeNull();
  });

  it("cannot be edited on a locked document", async () => {
    menuBackend({ documents: [{ ...trip, isLocked: true }] });
    backend();
    server.use(
      http.get(apiUrl("/docs/workspace/:ws/document/:id"), () =>
        HttpResponse.json({ ...trip, isLocked: true }),
      ),
    );
    renderTrip();
    await screen.findByRole("textbox", { name: "Title" });
    expect(screen.queryByRole("button", { name: "Edit header" })).toBeNull();
  });
});

describe("the document actions", () => {
  it("locks the document, saved with its current title", async () => {
    const menu = backend();
    renderTrip();
    const title = await screen.findByRole("textbox", { name: "Title" });

    await openAction("Lock document");

    expect(await screen.findByText("Locked")).toBeInTheDocument();
    expect(title).toHaveAttribute("contenteditable", "false");
    await waitFor(() =>
      expect(lastSavedDocument(menu)).toMatchObject({ isLocked: true, title: "Trip", content: [] }),
    );

    await openAction("Unlock document");
    await waitFor(() => expect(lastSavedDocument(menu)).toMatchObject({ isLocked: false }));
  });

  it("saves its own fields with the title as edited, not as opened", async () => {
    const menu = backend();
    renderTrip();
    const title = await screen.findByRole("textbox", { name: "Title" });
    await userEvent.click(title);
    await userEvent.keyboard("{End} to Porto");
    await waitFor(() => expect(menu.titles.at(-1)?.text).toBe("Trip to Porto"));

    await openAction("Lock document");

    await waitFor(() => expect(lastSavedDocument(menu)).toMatchObject({ title: "Trip to Porto" }));
  });

  it("sends the publish state as it is now, not as the document opened", async () => {
    const menu = backend();
    menu.published.value = true;
    server.use(
      http.get(apiUrl("/docs/workspace/:ws/document/:id"), () =>
        HttpResponse.json({ ...trip, published: true }),
      ),
    );
    renderTrip();
    await openAction("Publish to web");
    const dialog = await screen.findByRole("dialog", { name: "Publish to web" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Unpublish" }));
    await within(dialog).findByRole("button", { name: "Publish" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await openAction("Lock document");

    await waitFor(() => expect(lastSavedDocument(menu)).toMatchObject({ isLocked: true }));
    expect(lastSavedDocument(menu)?.published).toBe(false);
  });

  it("sends one change at a time and keeps a later change when an earlier one fails", async () => {
    backend();
    const bodies: { isLocked: boolean; tagIds: string[] }[] = [];
    let release: () => void = () => undefined;
    let first = true;
    server.use(
      http.post(apiUrl("/docs/workspace/document"), async ({ request }) => {
        const body = (await request.json()) as {
          documents: { isLocked: boolean; tagIds: string[] }[];
        };
        bodies.push(body.documents[0]!);
        if (first) {
          first = false;
          await new Promise<void>((resolve) => (release = resolve));
          return new HttpResponse(null, { status: 500 });
        }
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderTrip();
    await openAction("Tags");
    const dialog = await screen.findByRole("dialog", { name: "Tags" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Travel/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await openAction("Lock document");

    // The lock waits for the tags to be answered.
    expect(bodies).toHaveLength(1);
    release();

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ isLocked: true, tagIds: [] });
    expect(await screen.findByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tags" })).toBeNull();
  });

  it("takes the lock back when the backend refuses it", async () => {
    backend();
    server.use(
      http.post(apiUrl("/docs/workspace/document"), () => new HttpResponse(null, { status: 500 })),
    );
    renderTrip();
    await openAction("Lock document");

    expect(await screen.findByText("The change could not be saved.")).toBeInTheDocument();
    expect(screen.queryByText("Locked")).toBeNull();
  });

  it("marks the document as a favorite", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Favorite");

    await waitFor(() => expect(menu.state.favorites.has("trip")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Document actions" }));
    expect(screen.getByRole("menuitem", { name: "Remove from favorites" })).toBeInTheDocument();
  });

  it("changes the icon of the document", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Change icon");
    const dialog = await screen.findByRole("dialog", { name: "Change icon" });
    const icons = within(dialog).getByRole("radiogroup", { name: "Icon" });
    const first = within(icons).getAllByRole("radio")[0]!;
    await userEvent.click(first);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(lastSavedDocument(menu)?.icon).toEqual({ label: first.title, tint: null }),
    );
  });

  it("moves the document, and its folder follows an undo of the move", async () => {
    const menu = backend();
    menu.state.folders.push(aFolder({ id: "work", title: "Work", parentId: ROOT_FOLDER_ID }));
    renderTrip();
    await openAction("Move to...");
    const dialog = await screen.findByRole("dialog", { name: "Move to..." });
    await userEvent.click(await within(dialog).findByRole("button", { name: /Work/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
    await waitFor(() =>
      expect(menu.state.documents.find((each) => each.id === "trip")?.parentId).toBe("work"),
    );

    await openAction("Lock document");
    await waitFor(() => expect(lastSavedDocument(menu)).toMatchObject({ parentId: "work" }));

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(menu.state.documents.find((each) => each.id === "trip")?.parentId).toBe(
        ROOT_FOLDER_ID,
      ),
    );
    await openAction("Unlock document");
    await waitFor(() =>
      expect(lastSavedDocument(menu)).toMatchObject({ isLocked: false, parentId: ROOT_FOLDER_ID }),
    );
  });

  it("keeps the folder when the move fails", async () => {
    const menu = backend();
    menu.state.folders.push(aFolder({ id: "work", title: "Work", parentId: ROOT_FOLDER_ID }));
    server.use(
      http.post(
        apiUrl("/docs/workspace/:ws/document/:id/move"),
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderTrip();
    await openAction("Move to...");
    const dialog = await screen.findByRole("dialog", { name: "Move to..." });
    await userEvent.click(await within(dialog).findByRole("button", { name: /Work/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
    expect(await screen.findByText("The items could not be moved.")).toBeInTheDocument();

    await openAction("Lock document");
    await waitFor(() =>
      expect(lastSavedDocument(menu)).toMatchObject({ isLocked: true, parentId: ROOT_FOLDER_ID }),
    );
  });

  it("deletes the document after confirming, and goes back to its folder", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete “Trip”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(`at /app/folder/${ROOT_FOLDER_ID}`)).toBeInTheDocument();
    expect(menu.state.documents.find((document) => document.id === "trip")).toBeUndefined();
  });
});

describe("the tags", () => {
  it("picks tags from the catalogue and shows them under the title", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Tags");
    const dialog = await screen.findByRole("dialog", { name: "Tags" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Travel/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const chips = await screen.findByRole("list", { name: "Tags" });
    expect(within(chips).getByText("Travel")).toBeInTheDocument();
    await waitFor(() => expect(lastSavedDocument(menu)?.tagIds).toEqual(["tag-travel"]));

    await userEvent.click(within(chips).getByRole("button", { name: "Remove the tag Travel" }));
    expect(screen.queryByRole("list", { name: "Tags" })).toBeNull();
    await waitFor(() => expect(lastSavedDocument(menu)?.tagIds).toEqual([]));
  });

  it("says so when the workspace has no tags", async () => {
    backend({ tags: [] });
    renderTrip();
    await openAction("Tags");
    expect(await screen.findByText(/The workspace has no tags yet/)).toBeInTheDocument();
  });

  it("creates a tag, refusing a name the catalogue has", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Tags");
    await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    const dialog = await screen.findByRole("dialog", { name: "New tag" });

    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await userEvent.type(name, "travel");
    expect(within(dialog).getByText("A tag with this name exists already.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.clear(name);
    await userEvent.type(name, "Food");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Description" }), "Eating");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const chips = await screen.findByRole("list", { name: "Tags" });
    expect(within(chips).getByText("Food")).toBeInTheDocument();
    const created = menu.state.tags.find((tag) => tag.name === "Food");
    expect(created).toMatchObject({ description: "Eating", workspaceId: WORKSPACE_ID });
    await waitFor(() => expect(lastSavedDocument(menu)?.tagIds).toEqual([created!.id]));
  });

  it("lets the AI write a tag to change before saving", async () => {
    backend();
    let asked: unknown;
    server.use(
      http.post(apiUrl("/ai/tag-create"), async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ name: "Portugal", description: "Trips to Portugal" });
      }),
    );
    renderTrip();
    await openAction("Tags");
    await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    const dialog = await screen.findByRole("dialog", { name: "New tag" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest with AI" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Portugal"),
    );
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue(
      "Trips to Portugal",
    );
    expect(asked).toEqual({
      documentTitle: "Trip",
      documentText: "Lisbon in May",
      existingTagNames: ["Travel", "Work"],
    });
  });
});

describe("publishing", () => {
  it("publishes, shows the public link, and unpublishes", async () => {
    const menu = backend();
    renderTrip();
    await openAction("Publish to web");
    const dialog = await screen.findByRole("dialog", { name: "Publish to web" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "Publish" }));

    expect(await within(dialog).findByRole("link")).toHaveAttribute(
      "href",
      "http://localhost:3000/site/trip",
    );
    expect(menu.published.value).toBe(true);

    await userEvent.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    await within(dialog).findByRole("button", { name: "Publish" });
    expect(menu.published.value).toBe(false);
  });

  it("copies the public link", async () => {
    const menu = backend();
    menu.published.value = true;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderTrip();
    await openAction("Publish to web");
    const dialog = await screen.findByRole("dialog", { name: "Publish to web" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/site/trip");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("is for premium users", async () => {
    backend();
    server.use(http.get(apiUrl("/docs/workspace/:ws/document/:id"), () => HttpResponse.json(trip)));
    renderTrip("FREE");
    await openAction("Publish to web");

    const dialog = await screen.findByRole("dialog", { name: "Premium feature" });
    expect(within(dialog).getByText(/only available for premium users/)).toBeInTheDocument();
  });

  it("shows the premium dialog when the backend refuses", async () => {
    backend();
    server.use(
      http.get(
        apiUrl("/docs/workspace/:ws/document/:id/published"),
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    renderTrip();
    await openAction("Publish to web");

    expect(await screen.findByRole("dialog", { name: "Premium feature" })).toBeInTheDocument();
  });
});

describe("export", () => {
  let saved: { name: string; blob: Blob }[];

  beforeEach(() => {
    saved = [];
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value;
      return "blob:export";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, blob: blob! });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("downloads the document as Markdown", async () => {
    backend();
    renderTrip();
    await openAction("Export as Markdown");

    expect(saved.map((file) => file.name)).toEqual(["Trip.md"]);
    expect(await saved[0]!.blob.text()).toBe("# Trip\nLisbon in May\n");
  });

  it("downloads the document as JSON", async () => {
    backend();
    renderTrip();
    await openAction("Export as JSON");

    expect(saved.map((file) => file.name)).toEqual(["Trip.json"]);
    const json = JSON.parse(await saved[0]!.blob.text()) as { id: string; content: unknown[] };
    expect(json.id).toBe("trip");
    expect(json.content).toHaveLength(2);
  });
});

describe("the side panel", () => {
  it("changes the editor font, remembered by the browser", async () => {
    backend();
    renderTrip();
    await screen.findByRole("textbox", { name: "Title" });
    await userEvent.click(screen.getByRole("button", { name: "Document options" }));
    const panel = screen.getByRole("complementary", { name: "Document options" });

    await userEvent.click(within(panel).getByRole("radio", { name: "Serif" }));

    expect(window.localStorage.getItem(FONT_KEY)).toBe("Serif");
    expect(useEditorFont.getState().font).toBe("Serif");
    useEditorFont.getState().setFont("System");
  });

  it("changes the focused line from the text tab", async () => {
    backend();
    renderTrip();
    const line = await screen.findByRole("textbox", { name: "Paragraph" });
    await userEvent.click(screen.getByRole("button", { name: "Document options" }));
    const panel = screen.getByRole("complementary", { name: "Document options" });
    await userEvent.click(within(panel).getByRole("tab", { name: "Text" }));
    expect(within(panel).getByRole("button", { name: "Checkbox" })).toBeDisabled();

    await userEvent.click(line);
    await userEvent.click(within(panel).getByRole("button", { name: "Checkbox" }));

    expect(await screen.findByRole("checkbox", { name: /Lisbon in May/ })).toBeInTheDocument();
  });
});
