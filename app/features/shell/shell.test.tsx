import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { readPreference } from "~/core/storage";
import { paths } from "~/features/auth/session";
import { appPaths } from "~/features/menu/paths";
import { getSelectedWorkspaceId, selectWorkspace } from "~/features/workspaces/api";

import { aDocument, aFolder, WORKSPACE_ID } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { menuBackend } from "../../../test/msw/menuBackend";
import { server } from "../../../test/msw/server";
import { renderAppRoute } from "../../../test/render";
import { AppShell } from "./components/AppShell";
import { TopBar } from "./components/TopBar";
import {
  clampSideMenuWidth,
  SIDE_MENU_COLLAPSED_KEY,
  SIDE_MENU_DEFAULT_WIDTH,
  SIDE_MENU_MAX_WIDTH,
  SIDE_MENU_MIN_WIDTH,
  SIDE_MENU_WIDTH_KEY,
  useShellStore,
} from "./store";

function Shell() {
  return (
    <AppShell>
      <TopBar>
        <h1>The screen</h1>
      </TopBar>
    </AppShell>
  );
}

function renderShell() {
  return renderAppRoute(Shell, {
    path: appPaths.home,
    route: "/app/folder/:folderId",
    destinations: [paths.workspaces, paths.login, "/app/document/:documentId", appPaths.search],
  });
}

const sideMenu = () => screen.getByRole("navigation", { name: "Side menu" });

const work = aFolder({ id: "work", title: "Work" });
const plans = aFolder({ id: "plans", title: "Plans", parentId: "work" });
const groceries = aDocument({ id: "groceries", title: "Groceries" });
const report = aDocument({ id: "report", title: "Report", parentId: "work" });

describe("the side menu", () => {
  it("shows the workspace, the user and the places of the app", async () => {
    menuBackend();
    renderShell();

    const menu = sideMenu();
    expect(within(menu).getByRole("button", { name: "Workspace: Personal" })).toHaveTextContent(
      "Ana",
    );
    expect(within(menu).getByRole("link", { name: "Home" })).toHaveAttribute("href", appPaths.home);
    expect(within(menu).getByRole("link", { name: "Favorites" })).toHaveAttribute(
      "href",
      appPaths.favorites,
    );
    expect(within(menu).getByRole("link", { name: "Documents graph" })).toHaveAttribute(
      "href",
      appPaths.graph,
    );
    expect(within(menu).getByRole("link", { name: "Search" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    await waitFor(() => expect(within(menu).queryByRole("status")).not.toBeInTheDocument());
  });

  it("asks for the contents of a folder only when it is opened", async () => {
    menuBackend({ folders: [work, plans], documents: [groceries, report] });
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const match = /folder\/([^/]+)\/contents/.exec(request.url);
      if (match) asked.push(match[1]!);
    });
    renderShell();

    const menu = sideMenu();
    expect(await within(menu).findByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      appPaths.folder("work"),
    );
    expect(within(menu).getByRole("link", { name: "Groceries" })).toHaveAttribute(
      "href",
      appPaths.document("groceries"),
    );
    expect(within(menu).queryByRole("link", { name: "Report" })).not.toBeInTheDocument();
    expect(asked).toEqual(["root"]);

    await userEvent.click(within(menu).getByRole("button", { name: "Expand Work" }));

    expect(await within(menu).findByRole("link", { name: "Report" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Plans" })).toBeInTheDocument();
    expect(asked).toEqual(["root", "work"]);

    await userEvent.click(within(menu).getByRole("button", { name: "Collapse Work" }));
    expect(within(menu).queryByRole("link", { name: "Report" })).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it("says that an opened folder is empty", async () => {
    menuBackend({ folders: [work] });
    renderShell();

    await userEvent.click(await screen.findByRole("button", { name: "Expand Work" }));

    expect(await within(sideMenu()).findByText("Empty")).toBeInTheDocument();
  });

  it("creates a folder inside a folder of the tree", async () => {
    const backend = menuBackend({ folders: [work] });
    renderShell();

    await userEvent.click(await screen.findByRole("button", { name: "Actions for Work" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("Folder name"), "Plans");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(backend.state.folders.map((folder) => [folder.title, folder.parentId])).toEqual([
        ["Work", "root"],
        ["Plans", "work"],
      ]),
    );
  });

  it("creates a document at the root and opens it", async () => {
    const backend = menuBackend();
    renderShell();

    await userEvent.click(within(sideMenu()).getByRole("button", { name: "New document" }));

    expect(await screen.findByText(/^at \/app\/document\//)).toBeInTheDocument();
    expect(backend.state.documents[0]?.parentId).toBe("root");
  });

  it("deletes a folder of the tree after a confirmation", async () => {
    const backend = menuBackend({ folders: [work], documents: [report] });
    renderShell();

    await userEvent.click(await screen.findByRole("button", { name: "Actions for Work" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Work”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(within(sideMenu()).queryByRole("link", { name: "Work" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(backend.state.folders).toEqual([]));
    expect(backend.state.documents).toEqual([]);
  });

  it("moves a document dropped on a folder of the tree, and back on Home", async () => {
    const backend = menuBackend({ folders: [work], documents: [groceries] });
    renderShell();

    const menu = sideMenu();
    const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
    const row = (name: string) => within(menu).getByRole("link", { name }).parentElement!;

    await within(menu).findByRole("link", { name: "Groceries" });
    fireEvent.dragStart(row("Groceries"), { dataTransfer });
    fireEvent.dragOver(row("Work"), { dataTransfer });
    fireEvent.drop(row("Work"), { dataTransfer });

    await waitFor(() => expect(backend.state.documents[0]?.parentId).toBe("work"));
    expect(await screen.findByText("“Groceries” moved to “Work”")).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole("button", { name: "Expand Work" }));
    await within(menu).findByRole("link", { name: "Groceries" });
    fireEvent.dragStart(row("Groceries"), { dataTransfer });
    fireEvent.dragOver(row("Home"), { dataTransfer });
    fireEvent.drop(row("Home"), { dataTransfer });

    await waitFor(() => expect(backend.state.documents[0]?.parentId).toBe("root"));
  });

  it("lists the tags of the workspace", async () => {
    menuBackend({
      tags: [
        {
          id: "tag-1",
          workspaceId: WORKSPACE_ID,
          name: "Travel",
          description: "",
          createdAt: 1,
          lastUpdatedAt: 1,
          deleted: false,
        },
      ],
    });
    renderShell();

    expect(await screen.findByRole("link", { name: "Travel" })).toHaveAttribute(
      "href",
      appPaths.tag("tag-1"),
    );
  });

  it("changes workspace and signs out from the workspace menu", async () => {
    menuBackend();
    server.use(http.post(apiUrl("/auth/logout/web"), () => new HttpResponse("Logged out")));
    selectWorkspace(WORKSPACE_ID);
    const first = renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Workspace: Personal" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change workspace" }));
    expect(await screen.findByText(`at ${paths.workspaces}`)).toBeInTheDocument();
    first.unmount();

    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Workspace: Personal" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    expect(await screen.findByText(`at ${paths.login}`)).toBeInTheDocument();
    expect(getSelectedWorkspaceId()).toBeNull();
  });
});

describe("the shell", () => {
  it("hides the side menu and brings it back, remembering the choice", async () => {
    menuBackend();
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Close the side menu" }));
    expect(screen.queryByRole("navigation", { name: "Side menu" })).not.toBeInTheDocument();
    expect(readPreference(SIDE_MENU_COLLAPSED_KEY)).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: "Open the side menu" }));
    // Wide and narrow screens each have their own copy; the styles show one of them.
    expect(screen.getAllByRole("navigation", { name: "Side menu" }).length).toBeGreaterThan(0);
    expect(readPreference(SIDE_MENU_COLLAPSED_KEY)).toBe("false");
  });

  it("starts hidden when that was the choice", () => {
    window.localStorage.setItem(SIDE_MENU_COLLAPSED_KEY, "true");
    useShellStore.getState().reload();
    menuBackend();
    renderShell();

    expect(screen.queryByRole("navigation", { name: "Side menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The screen" })).toBeInTheDocument();
  });

  it("resizes the side menu with the keyboard and remembers the width", async () => {
    menuBackend();
    renderShell();

    const handle = screen.getByRole("separator", { name: "Resize the side menu" });
    expect(handle).toHaveAttribute("aria-valuenow", String(SIDE_MENU_DEFAULT_WIDTH));

    handle.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    const width = SIDE_MENU_DEFAULT_WIDTH + 32;
    expect(handle).toHaveAttribute("aria-valuenow", String(width));
    expect(handle.parentElement).toHaveStyle({ width: `${width}px` });
    expect(readPreference(SIDE_MENU_WIDTH_KEY)).toBe(String(width));
  });

  it("resizes the side menu by dragging its edge", () => {
    menuBackend();
    renderShell();

    const handle = screen.getByRole("separator", { name: "Resize the side menu" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 280 });
    fireEvent.pointerMove(window, { clientX: 350 });
    expect(handle).toHaveAttribute("aria-valuenow", "350");
    expect(readPreference(SIDE_MENU_WIDTH_KEY)).toBeNull();

    fireEvent.pointerUp(window, { clientX: 9999 });
    expect(handle).toHaveAttribute("aria-valuenow", String(SIDE_MENU_MAX_WIDTH));
    expect(readPreference(SIDE_MENU_WIDTH_KEY)).toBe(String(SIDE_MENU_MAX_WIDTH));
  });

  it("keeps the width within its limits", () => {
    expect(clampSideMenuWidth(10)).toBe(SIDE_MENU_MIN_WIDTH);
    expect(clampSideMenuWidth(5000)).toBe(SIDE_MENU_MAX_WIDTH);
    expect(clampSideMenuWidth(Number.NaN)).toBe(SIDE_MENU_DEFAULT_WIDTH);
  });

  it("opens the settings over the page, where the theme can be changed", async () => {
    menuBackend();
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).getByText(/Account: Ana - PREMIUM/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Appearance" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Green" }));
    expect(document.documentElement.dataset.accent).toBe("green");
    expect(within(dialog).getByRole("radio", { name: "Green" })).toBeChecked();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("goes to the search screen", async () => {
    menuBackend();
    renderShell();

    await userEvent.click(within(sideMenu()).getByRole("link", { name: "Search" }));
    expect(await screen.findByText(`at ${appPaths.search}`)).toBeInTheDocument();
  });
});
