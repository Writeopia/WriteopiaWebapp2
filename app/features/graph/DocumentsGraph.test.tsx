import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DocumentTag } from "~/core/models";
import { appPaths } from "~/features/menu/paths";
import GraphRoute from "~/routes/app/graph";
import NotificationsRoute from "~/routes/app/notifications";

import { aDocument, aFolder, WORKSPACE_ID } from "../../../test/fixtures";
import { menuBackend } from "../../../test/msw/menuBackend";
import { renderAppRoute } from "../../../test/render";
import { nodePath } from "./components/DocumentsGraph";

const travel: DocumentTag = {
  id: "travel",
  workspaceId: WORKSPACE_ID,
  name: "Travel",
  description: "Trips",
  createdAt: 0,
  lastUpdatedAt: 0,
  deleted: false,
};

function renderGraph() {
  menuBackend({
    folders: [aFolder({ id: "work", title: "Work", parentId: "root" })],
    documents: [
      aDocument({ id: "trip", title: "Trip", parentId: "root", tagIds: ["travel"] }),
      aDocument({ id: "report", title: "Report", parentId: "work" }),
    ],
    tags: [travel],
  });
  return renderAppRoute(GraphRoute, {
    path: appPaths.graph,
    destinations: ["/app/document/:documentId", "/app/folder/:folderId", "/app/tag/:tagId"],
  });
}

const items = () => screen.getByRole("list", { name: "Items of the graph" });

describe("the documents graph", () => {
  it("reads the whole workspace and lists its folders and documents", async () => {
    renderGraph();

    expect(await within(items()).findByRole("button", { name: "Report" })).toBeInTheDocument();
    expect(
      within(items())
        .getAllByRole("button")
        .map((button) => button.textContent)
        .sort(),
    ).toEqual(["Report", "Trip", "Work"]);
    expect(screen.getByRole("img", { name: "Documents graph" })).toBeInTheDocument();
  });

  it("groups by tags", async () => {
    renderGraph();
    await within(items()).findByRole("button", { name: "Work" });

    await userEvent.click(screen.getByRole("radio", { name: "Tags" }));

    expect(
      within(items())
        .getAllByRole("button")
        .map((button) => button.textContent)
        .sort(),
    ).toEqual(["Report", "Travel", "Trip"]);
  });

  it("shows the card of a node and opens it", async () => {
    renderGraph();

    await userEvent.click(await within(items()).findByRole("button", { name: "Work" }));
    const card = screen.getByRole("region", { name: "Work" });
    expect(within(card).getByText("Folder")).toBeInTheDocument();
    expect(within(card).getByText("0 folders · 1 documents")).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Open" }));
    expect(await screen.findByText(`at ${appPaths.folder("work")}`)).toBeInTheDocument();
  });

  it("closes the card", async () => {
    renderGraph();

    await userEvent.click(await within(items()).findByRole("button", { name: "Trip" }));
    const card = screen.getByRole("region", { name: "Trip" });
    expect(within(card).getByText("At the top of the workspace")).toBeInTheDocument();
    expect(within(card).getByText("Travel")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("region", { name: "Trip" })).not.toBeInTheDocument();
  });

  it("opens each kind of node in its place", () => {
    expect(nodePath({ id: "d", isFolder: false, isTag: false })).toBe(appPaths.document("d"));
    expect(nodePath({ id: "f", isFolder: true, isTag: false })).toBe(appPaths.folder("f"));
    expect(nodePath({ id: "t", isFolder: true, isTag: true })).toBe(appPaths.tag("t"));
  });
});

describe("the notifications", () => {
  it("says there are none", () => {
    renderAppRoute(NotificationsRoute, { path: appPaths.notifications });

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });
});
