import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { StoryTypes } from "~/core/models";
import { appPaths } from "~/features/menu/paths";
import { AppShell } from "~/features/shell/components/AppShell";

import { aDocument, aStep, aUser, aWorkspace } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { menuBackend } from "../../../test/msw/menuBackend";
import { server } from "../../../test/msw/server";
import { renderAppRoute } from "../../../test/render";
import { SearchScreen } from "./components/SearchScreen";

function renderSearch(tier: "FREE" | "PREMIUM" = "PREMIUM", search?: string) {
  return renderAppRoute(SearchScreen, {
    path: appPaths.search,
    search,
    destinations: ["/app/document/:documentId"],
    session: { user: aUser({ tier }), workspace: aWorkspace() },
  });
}

const older = aDocument({ id: "older", title: "Older", lastUpdatedAt: 1 });
const newer = aDocument({ id: "newer", title: "Newer", lastUpdatedAt: 2 });

function searchBackend() {
  const queries: string[] = [];
  server.use(
    http.get(apiUrl("/docs/workspace/:ws/document/search"), ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      queries.push(q);
      return HttpResponse.json({
        documents: [
          {
            ...aDocument({ id: "trip", title: "Trip to Lisbon" }),
            content: [aStep({ id: "hit", type: StoryTypes.TEXT, text: "Pack the lisbon guide" })],
          },
          aDocument({ id: "lists", title: "Lists" }),
        ],
        presentations: [{ id: "deck", documentId: "trip", title: "Lisbon deck", createdAt: 1 }],
      });
    }),
  );
  return queries;
}

describe("the search screen", () => {
  it("shows the recently updated documents before anything is typed", async () => {
    menuBackend({ documents: [older, newer] });
    renderSearch();

    const list = await screen.findByRole("listbox", { name: "Recent" });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Newer", "Older"]),
    );
  });

  it("finds documents and presentations, with the matching words marked", async () => {
    menuBackend();
    const queries = searchBackend();
    renderSearch();

    await userEvent.type(screen.getByRole("combobox", { name: "Search documents" }), "lisbon");

    const list = await screen.findByRole("listbox", { name: "Results" });
    const options = await within(list).findAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Trip to Lisbon");
    expect(options[0]).toHaveTextContent("Pack the lisbon guide");
    expect(within(options[0]!).getAllByText(/lisbon/i, { selector: "mark" })).toHaveLength(2);
    expect(options[2]).toHaveTextContent("Lisbon deck");
    expect(options[2]).toHaveTextContent("Presentation");
    // Typing is debounced: one request for the whole word.
    expect(queries).toEqual(["lisbon"]);
  });

  it("moves with the arrows and opens with Enter", async () => {
    menuBackend();
    searchBackend();
    renderSearch();
    const field = screen.getByRole("combobox", { name: "Search documents" });

    await userEvent.type(field, "lis");
    await screen.findAllByRole("option");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1]!.id);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");

    // A presentation opens over the document it was made from.
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText(`at ${appPaths.document("trip")}`)).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    menuBackend();
    server.use(
      http.get(apiUrl("/docs/workspace/:ws/document/search"), () =>
        HttpResponse.json({ documents: [], presentations: [] }),
      ),
    );
    renderSearch();

    await userEvent.type(screen.getByRole("combobox", { name: "Search documents" }), "zzz");

    expect(await screen.findByText("Nothing found.")).toBeInTheDocument();
  });

  it("keeps the words in the address and starts from them", async () => {
    menuBackend();
    const queries = searchBackend();
    renderSearch("PREMIUM", "?q=lisbon");

    expect(screen.getByRole("combobox", { name: "Search documents" })).toHaveValue("lisbon");
    expect(await screen.findByRole("listbox", { name: "Results" })).toBeInTheDocument();
    await waitFor(() => expect(queries).toEqual(["lisbon"]));
  });

  it("is for premium users only", () => {
    renderSearch("FREE");

    expect(screen.getByRole("combobox", { name: "Search documents" })).toBeDisabled();
    expect(screen.getByText(/only available for premium users/)).toBeInTheDocument();
  });
});

describe("the search shortcut", () => {
  it("goes to the search with ⌘K or Ctrl+K", async () => {
    menuBackend();
    renderAppRoute(
      () => (
        <AppShell>
          <p>The screen</p>
        </AppShell>
      ),
      { path: appPaths.home, route: "/app/folder/:folderId", destinations: [appPaths.search] },
    );
    await screen.findByRole("navigation", { name: "Side menu" });

    await userEvent.keyboard("{Control>}k{/Control}");

    expect(await screen.findByText(`at ${appPaths.search}`)).toBeInTheDocument();
  });
});
