import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useParams } from "react-router";
import { describe, expect, it } from "vitest";

import { relativeTime } from "~/core/i18n";
import { ROOT_FOLDER_ID } from "~/core/models";
import { readPreference } from "~/core/storage";

import { aDocument, aFolder, aStep, WORKSPACE_ID } from "../../../../test/fixtures";
import { apiUrl } from "../../../../test/msw/handlers";
import { menuBackend } from "../../../../test/msw/menuBackend";
import { server } from "../../../../test/msw/server";
import { renderAppRoute } from "../../../../test/render";
import { appPaths } from "../paths";
import { ARRANGEMENT_KEY, ORDER_BY_KEY, useMenuPreferences } from "../preferences";
import { MenuScreen } from "./MenuScreen";

function FolderScreen() {
  const { folderId = ROOT_FOLDER_ID } = useParams();
  return <MenuScreen key={folderId} view={{ kind: "folder", folderId }} />;
}

function FavoritesScreen() {
  return <MenuScreen view={{ kind: "favorites" }} />;
}

function TagScreen() {
  const { tagId = "" } = useParams();
  return <MenuScreen view={{ kind: "tag", tagId }} />;
}

const FOLDER_ROUTE = "/app/folder/:folderId";
const DOCUMENT_ROUTE = "/app/document/:documentId";

function renderFolder(folderId = ROOT_FOLDER_ID) {
  return renderAppRoute(FolderScreen, {
    path: appPaths.folder(folderId),
    route: FOLDER_ROUTE,
    destinations: [DOCUMENT_ROUTE],
  });
}

const work = aFolder({ id: "work", title: "Work" });
const groceries = aDocument({ id: "groceries", title: "Groceries", lastUpdatedAt: 300 });
const trip = aDocument({
  id: "trip",
  title: "Trip",
  lastUpdatedAt: 200,
  content: [aStep({ id: "trip-1", text: "Pack the bags" })],
});
const untitled = aDocument({ id: "untitled", title: "", lastUpdatedAt: 100, content: [] });

/** The titles of the cards, in the order they are drawn. */
function cardTitles(): string[] {
  return screen
    .getAllByRole("article")
    .map((card) => within(card).getByRole("heading").textContent);
}

const card = (title: string) =>
  screen.getByRole("heading", { name: title, level: 3 }).closest("article")!;

async function chooseAction(title: string, action: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for ${title}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: action }));
}

describe("MenuScreen, a folder", () => {
  it("lists the folders first, then the documents, with their previews", async () => {
    menuBackend({
      folders: [work],
      documents: [groceries, trip, untitled, aDocument({ id: "report", parentId: "work" })],
    });
    renderFolder();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Work" })).toBeInTheDocument();

    expect(cardTitles()).toEqual(["Work", "Groceries", "Trip", "Untitled"]);
    // A folder shows when it was last changed, not how many items it holds.
    expect(within(card("Work")).getByText(relativeTime(work.lastUpdatedAt))).toBeInTheDocument();
    expect(within(card("Groceries")).getByText("Corn")).toBeInTheDocument();
    expect(within(card("Trip")).getByText("Pack the bags")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
  });

  it("shows the path to a folder, with links to the folders above it", async () => {
    menuBackend({
      folders: [work, aFolder({ id: "plans", title: "Plans", parentId: "work" })],
      documents: [aDocument({ id: "q1", title: "Q1", parentId: "plans" })],
    });
    renderFolder("plans");

    const breadcrumb = await screen.findByRole("navigation", { name: "Folder path" });
    expect(await within(breadcrumb).findByRole("heading", { name: "Plans" })).toBeInTheDocument();
    expect(within(breadcrumb).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      appPaths.home,
    );
    expect(within(breadcrumb).getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      appPaths.folder("work"),
    );
    expect(await screen.findByRole("heading", { name: "Q1" })).toBeInTheDocument();
  });

  it("changes the arrangement and remembers it", async () => {
    menuBackend({ documents: [groceries] });
    renderFolder();
    await screen.findByRole("heading", { name: "Groceries" });
    expect(card("Groceries")).toHaveClass("h-56");

    await userEvent.click(screen.getByRole("button", { name: "Arrangement" }));
    expect(screen.getByRole("menuitemradio", { name: "Grid" })).toBeChecked();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Staggered grid" }));
    expect(card("Groceries")).toHaveClass("break-inside-avoid");

    await userEvent.click(screen.getByRole("button", { name: "Arrangement" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "List" }));
    expect(card("Groceries")).not.toHaveClass("h-56");
    expect(within(card("Groceries")).getByText("Corn")).toBeInTheDocument();
    expect(readPreference(ARRANGEMENT_KEY)).toBe("list");
  });

  it("opens in the arrangement and the order that were remembered", async () => {
    window.localStorage.setItem(ARRANGEMENT_KEY, "staggered_grid");
    window.localStorage.setItem(ORDER_BY_KEY, "title");
    useMenuPreferences.getState().reload();
    menuBackend({ documents: [trip, groceries] });
    renderFolder();

    await screen.findByRole("heading", { name: "Groceries" });
    expect(cardTitles()).toEqual(["Groceries", "Trip"]);
    expect(card("Trip")).toHaveClass("break-inside-avoid");
  });

  it("sorts by name and remembers it", async () => {
    menuBackend({
      documents: [groceries, trip, aDocument({ id: "a", title: "Apples", lastUpdatedAt: 1 })],
    });
    renderFolder();
    await screen.findByRole("heading", { name: "Groceries" });
    expect(cardTitles()).toEqual(["Groceries", "Trip", "Apples"]);

    await userEvent.click(screen.getByRole("button", { name: "Sorting" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Sort by name" }));

    expect(cardTitles()).toEqual(["Apples", "Groceries", "Trip"]);
    expect(readPreference(ORDER_BY_KEY)).toBe("title");
  });

  it("offers to create a note in an empty folder, and opens the new document", async () => {
    const backend = menuBackend();
    renderFolder();

    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create a note" }));

    expect(await screen.findByText(/^at \/app\/document\//)).toBeInTheDocument();
    expect(backend.state.documents).toHaveLength(1);
    expect(backend.state.documents[0]).toMatchObject({
      title: "",
      parentId: ROOT_FOLDER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(backend.state.documents[0]?.content).toHaveLength(1);
    expect(backend.state.documents[0]?.content[0]?.type.name).toBe("title");
  });

  it("creates a document in the folder on screen", async () => {
    const backend = menuBackend({ folders: [work] });
    renderFolder("work");
    await screen.findByText("This folder is empty.");

    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New document" }));

    await screen.findByText(/^at \/app\/document\//);
    expect(backend.state.documents[0]?.parentId).toBe("work");
  });

  it("creates a folder with a name and an icon", async () => {
    const backend = menuBackend();
    renderFolder();
    await screen.findByText("This folder is empty.");

    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New folder" }));

    const dialog = screen.getByRole("dialog", { name: "New folder" });
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Folder name"), " Recipes ");
    await userEvent.click(within(dialog).getByRole("radio", { name: "favorites" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "#ff0000" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("heading", { name: "Recipes" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(backend.state.folders[0]).toMatchObject({
      title: "Recipes",
      parentId: ROOT_FOLDER_ID,
      icon: { label: "favorites", tint: -65536 },
    });
  });

  it("says so when the folder cannot be created, and keeps the dialog", async () => {
    menuBackend();
    server.use(
      http.post(
        apiUrl("/docs/workspace/:workspaceId/folder/:parentId/create"),
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    renderFolder();
    await screen.findByText("This folder is empty.");

    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("Folder name"), "Recipes");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The folder could not be created.");
    expect(screen.getByRole("dialog", { name: "New folder" })).toBeInTheDocument();
  });

  it("renames a folder", async () => {
    const backend = menuBackend({ folders: [work] });
    renderFolder();

    await chooseAction("Work", "Edit folder");
    const name = within(screen.getByRole("dialog", { name: "Edit folder" })).getByLabelText(
      "Folder name",
    );
    expect(name).toHaveValue("Work");
    await userEvent.clear(name);
    await userEvent.type(name, "Job");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Job" })).toBeInTheDocument();
    await waitFor(() => expect(backend.state.folders[0]?.title).toBe("Job"));
    expect(backend.calls.at(-1)?.body).toEqual({ title: "Job" });
  });

  it("changes the icon of a document without sending its steps", async () => {
    const backend = menuBackend({ documents: [groceries] });
    renderFolder();

    await chooseAction("Groceries", "Change icon");
    const dialog = screen.getByRole("dialog", { name: "Change icon" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "zap" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(backend.state.documents[0]?.icon).toEqual({ label: "zap", tint: null }),
    );
    const sent = backend.calls.at(-1)?.body as { documents: { id: string; content: unknown[] }[] };
    expect(sent.documents).toHaveLength(1);
    expect(sent.documents[0]).toMatchObject({ id: "groceries", content: [] });
    // What the backend holds is untouched.
    expect(backend.state.documents[0]?.content).toHaveLength(2);
  });

  it("marks a document as a favorite, and takes the mark back when refused", async () => {
    const backend = menuBackend({ documents: [groceries] });
    renderFolder();

    await chooseAction("Groceries", "Favorite");
    expect(await within(card("Groceries")).findByRole("img", { name: "Favorite" })).toBeVisible();
    await waitFor(() => expect(backend.state.favorites.has("groceries")).toBe(true));

    server.use(
      http.post(
        apiUrl("/docs/workspace/:workspaceId/document/:documentId/favorite"),
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    await chooseAction("Groceries", "Remove from favorites");

    expect(await screen.findByRole("alert")).toHaveTextContent("The change could not be saved.");
    expect(await within(card("Groceries")).findByRole("img", { name: "Favorite" })).toBeVisible();
  });

  it("duplicates a document", async () => {
    const backend = menuBackend({ documents: [groceries] });
    renderFolder();

    await chooseAction("Groceries", "Duplicate");

    expect(await screen.findByRole("heading", { name: "Groceries (Copy)" })).toBeInTheDocument();
    expect(backend.calls.at(-1)?.body).toEqual({ documentIds: ["groceries"] });
  });

  it("deletes a document after a confirmation", async () => {
    const backend = menuBackend({ documents: [groceries, trip] });
    renderFolder();

    await chooseAction("Groceries", "Delete");
    const dialog = screen.getByRole("dialog", { name: "Delete “Groceries”?" });
    expect(backend.state.documents).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Groceries" })).toBeNull());
    await waitFor(() => expect(backend.state.documents.map((d) => d.id)).toEqual(["trip"]));
    expect(screen.getByRole("heading", { name: "Trip" })).toBeInTheDocument();
  });

  it("selects several entries and deletes them, warning about the folders", async () => {
    const backend = menuBackend({
      folders: [work],
      documents: [groceries, trip, aDocument({ id: "report", parentId: "work" })],
    });
    renderFolder();
    await screen.findByRole("heading", { name: "Work" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Work" }));
    // With something selected a click on a card selects it instead of opening it.
    await userEvent.click(screen.getByRole("link", { name: /Groceries/ }));

    const bar = screen.getByRole("toolbar", { name: "2 selected" });
    await userEvent.click(within(bar).getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete 2 items?" });
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Work", "Groceries"]);
    expect(
      within(dialog).getByText("Everything inside the folders is deleted too."),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(cardTitles()).toEqual(["Trip"]));
    await waitFor(() => expect(backend.state.documents.map((d) => d.id)).toEqual(["trip"]));
    expect(backend.state.folders).toEqual([]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const backend = menuBackend({ documents: [groceries] });
    renderFolder();

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "1 selected" })).toBeInTheDocument();
    expect(backend.calls).toEqual([]);
  });

  it("selects with a modifier key, and clears the selection", async () => {
    menuBackend({ documents: [groceries, trip] });
    renderFolder();
    await screen.findByRole("heading", { name: "Trip" });

    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("link", { name: /Trip/ }));
    await user.keyboard("{/Meta}");

    expect(screen.getByRole("checkbox", { name: "Select Trip" })).toBeChecked();
    expect(screen.getByRole("toolbar", { name: "1 selected" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear the selection" }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("favorites and duplicates the selection", async () => {
    const backend = menuBackend({ documents: [groceries, trip] });
    renderFolder();

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Groceries" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Trip" }));
    await userEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => expect([...backend.state.favorites].sort()).toEqual(["groceries", "trip"]));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Trip" }));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(await screen.findByRole("heading", { name: "Trip (Copy)" })).toBeInTheDocument();
  });

  it("moves a document with the dialog, and takes the move back with Undo", async () => {
    const backend = menuBackend({
      folders: [work, aFolder({ id: "plans", title: "Plans", parentId: "work" })],
      documents: [groceries],
    });
    renderFolder();

    await chooseAction("Groceries", "Move to...");
    const dialog = screen.getByRole("dialog", { name: "Move to..." });
    expect(within(dialog).getByRole("button", { name: "Move here" })).toBeDisabled();
    expect(within(dialog).getByText("It's already here")).toBeInTheDocument();

    await userEvent.click(await within(dialog).findByRole("button", { name: "Work" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Plans" }));
    expect(await within(dialog).findByText("No folders here")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Groceries" })).toBeNull());
    await waitFor(() => expect(backend.state.documents[0]?.parentId).toBe("plans"));
    expect(await screen.findByText("“Groceries” moved to “Plans”")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("heading", { name: "Groceries" })).toBeInTheDocument();
    await waitFor(() => expect(backend.state.documents[0]?.parentId).toBe(ROOT_FOLDER_ID));
  });

  it("does not offer a folder as its own destination", async () => {
    menuBackend({ folders: [work, aFolder({ id: "archive", title: "Archive" })] });
    renderFolder();

    await chooseAction("Work", "Move to...");
    const dialog = screen.getByRole("dialog", { name: "Move to..." });

    expect(await within(dialog).findByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Work" })).not.toBeInTheDocument();
  });

  it("moves the selection by dropping it on a folder card", async () => {
    const backend = menuBackend({ folders: [work], documents: [groceries, trip] });
    renderFolder();
    await screen.findByRole("heading", { name: "Work" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Groceries" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Trip" }));

    const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card("Trip"), { dataTransfer });
    fireEvent.dragOver(card("Work"), { dataTransfer });
    expect(card("Work")).toHaveClass("ring-2");
    fireEvent.drop(card("Work"), { dataTransfer });

    await waitFor(() => expect(cardTitles()).toEqual(["Work"]));
    expect(await screen.findByText("2 items moved to “Work”")).toBeInTheDocument();
    await waitFor(() =>
      expect(backend.state.documents.map((document) => document.parentId)).toEqual([
        "work",
        "work",
      ]),
    );
  });

  it("does not take a folder dropped on itself", async () => {
    const backend = menuBackend({ folders: [work] });
    renderFolder();
    await screen.findByRole("heading", { name: "Work" });

    const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card("Work"), { dataTransfer });
    fireEvent.dragOver(card("Work"), { dataTransfer });
    fireEvent.drop(card("Work"), { dataTransfer });

    expect(card("Work")).not.toHaveClass("ring-2");
    expect(backend.calls).toEqual([]);
  });

  it("puts a moved document back when the backend refuses the move", async () => {
    menuBackend({ folders: [work], documents: [groceries] });
    server.use(
      http.post(
        apiUrl("/docs/workspace/:workspaceId/document/:documentId/move"),
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    renderFolder();
    await screen.findByRole("heading", { name: "Work" });

    const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card("Groceries"), { dataTransfer });
    fireEvent.dragOver(card("Work"), { dataTransfer });
    fireEvent.drop(card("Work"), { dataTransfer });

    expect(await screen.findByRole("alert")).toHaveTextContent("The items could not be moved.");
    expect(await screen.findByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  });

  it("opens the actions of a card with a right click", async () => {
    menuBackend({ documents: [groceries] });
    renderFolder();
    await screen.findByRole("heading", { name: "Groceries" });

    fireEvent.contextMenu(card("Groceries"), { clientX: 40, clientY: 60 });

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("summarizes the selected documents and offers to open the summary", async () => {
    const backend = menuBackend({ folders: [work], documents: [groceries, trip] });
    renderFolder();

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Groceries" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Trip" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Summarize with AI" }));

    expect(await screen.findByText("The summary is ready.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(backend.calls.at(-1)?.body).toEqual({
      documents: [
        { documentId: "groceries", lastSyncedAt: null },
        { documentId: "trip", lastSyncedAt: null },
      ],
      targetFolderId: ROOT_FOLDER_ID,
      summaryTitle: null,
      model: null,
      ignoreSyncCheck: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("at /app/document/summary-1")).toBeInTheDocument();
  });

  it.each([
    [503, "AI is not available."],
    [403, "This feature is only available for premium users using an online workspace"],
    [500, "The summary could not be written. Try again."],
  ])("says why there is no summary when the backend answers %i", async (status, message) => {
    const backend = menuBackend({ documents: [groceries] });
    backend.summary.status = status;
    renderFolder();

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Groceries" }));
    await userEvent.click(screen.getByRole("button", { name: "Summarize with AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("offers to try again when the folder cannot be loaded", async () => {
    const backend = menuBackend({ documents: [groceries] });
    let fail = true;
    server.use(
      http.get(apiUrl("/docs/workspace/:workspaceId/folder/:folderId/contents/preview"), () =>
        fail
          ? new HttpResponse("boom", { status: 500 })
          : HttpResponse.json({ folders: [], documents: backend.state.documents, tags: [] }),
      ),
    );
    renderFolder();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The documents could not be loaded.",
    );

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Groceries" })).toBeInTheDocument();
  });

  it("explains that documents need the premium tier", async () => {
    server.use(
      http.get(
        apiUrl("/docs/workspace/:workspaceId/folder/:folderId/contents/preview"),
        () => new HttpResponse("Premium required", { status: 403 }),
      ),
    );
    renderFolder();

    expect(await screen.findByRole("heading", { name: "Premium Feature" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("MenuScreen, the favorites", () => {
  it("lists the favorite documents, wherever they are", async () => {
    menuBackend({
      folders: [work],
      documents: [groceries, aDocument({ id: "report", title: "Report", parentId: "work" }), trip],
      favorites: ["report", "trip", "gone"],
    });
    renderAppRoute(FavoritesScreen, { path: appPaths.favorites });

    expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument();
    expect(cardTitles().sort()).toEqual(["Report", "Trip"]);
    expect(screen.getByRole("heading", { name: "Favorites", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
  });

  it("drops a document that stops being a favorite", async () => {
    menuBackend({ documents: [groceries, trip], favorites: ["groceries", "trip"] });
    renderAppRoute(FavoritesScreen, { path: appPaths.favorites });

    await chooseAction("Trip", "Remove from favorites");

    await waitFor(() => expect(cardTitles()).toEqual(["Groceries"]));
  });

  it("says so when there are none", async () => {
    menuBackend({ documents: [groceries] });
    renderAppRoute(FavoritesScreen, { path: appPaths.favorites });

    expect(await screen.findByText("No favorite documents yet.")).toBeInTheDocument();
  });
});

describe("MenuScreen, a tag", () => {
  const tag = {
    id: "tag-1",
    workspaceId: WORKSPACE_ID,
    name: "Travel",
    description: "",
    createdAt: 1,
    lastUpdatedAt: 1,
    deleted: false,
  };

  it("lists the documents that carry the tag, from every folder", async () => {
    menuBackend({
      folders: [work],
      tags: [tag],
      documents: [
        groceries,
        { ...trip, tagIds: ["tag-1"] },
        aDocument({ id: "report", title: "Report", parentId: "work", tagIds: ["tag-1"] }),
      ],
    });
    renderAppRoute(TagScreen, { path: appPaths.tag("tag-1"), route: "/app/tag/:tagId" });

    expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument();
    expect(cardTitles().sort()).toEqual(["Report", "Trip"]);
    expect(screen.getByRole("heading", { name: "Travel", level: 1 })).toBeInTheDocument();
  });

  it("says so when no document carries the tag", async () => {
    menuBackend({ tags: [tag], documents: [groceries] });
    renderAppRoute(TagScreen, { path: appPaths.tag("tag-1"), route: "/app/tag/:tagId" });

    expect(await screen.findByText("No documents carry this tag yet.")).toBeInTheDocument();
  });
});
