import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";
import SiteRoute from "~/routes/site";

import { aDocument, aStep } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { renderRoute } from "../../../test/render";

const RED = -65536;

const published = aDocument({
  id: "pub",
  title: "Lisbon guide",
  icon: { label: "map", tint: null },
  content: [
    aStep({
      id: "title",
      type: StoryTypes.TITLE,
      text: "Lisbon guide",
      position: rankAt(0),
      decoration: { backgroundColor: RED },
    }),
    aStep({ id: "line", text: "Take tram 28.", position: rankAt(1) }),
    aStep({
      id: "link",
      type: StoryTypes.DOCUMENT_LINK,
      text: "Food",
      documentLink: { id: "food", title: "Food" },
      position: rankAt(2),
    }),
  ],
});

function renderSite(documentId: string) {
  return renderRoute(SiteRoute as never, {
    path: `/site/${documentId}`,
    route: "/site/:documentId",
  });
}

describe("the published site", () => {
  it("shows the document read-only, with its header, without a session", async () => {
    // No session handler is set: a call that needs one would fail the test.
    server.use(http.get(apiUrl("/site/:id"), () => HttpResponse.json(published)));
    renderSite("pub");

    expect(await screen.findByText("Take tram 28.")).toBeInTheDocument();
    expect(screen.getByText("Lisbon guide")).toBeInTheDocument();
    expect(document.querySelector("[data-header='color']")).not.toBeNull();
    expect(document.querySelector("[contenteditable='true']")).toBeNull();
    expect(screen.getByText("Published with Writeopia")).toBeInTheDocument();
    expect(document.title).toBe("Lisbon guide");
  });

  it("opens a linked document as a site page too", async () => {
    server.use(
      http.get(apiUrl("/site/:id"), ({ params }) =>
        params.id === "pub"
          ? HttpResponse.json(published)
          : new HttpResponse("Document not found or not published", { status: 404 }),
      ),
    );
    renderSite("pub");

    await userEvent.click(await screen.findByRole("button", { name: /Food/ }));

    expect(await screen.findByText("This page is not here")).toBeInTheDocument();
  });

  it("says when the document is not published", async () => {
    server.use(http.get(apiUrl("/site/:id"), () => new HttpResponse("Not found", { status: 404 })));
    renderSite("gone");

    expect(await screen.findByText("This page is not here")).toBeInTheDocument();
    expect(
      screen.getByText("The document does not exist, or it is no longer published."),
    ).toBeInTheDocument();
  });

  it("offers to try again when the server fails", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl("/site/:id"), () => {
        calls += 1;
        return calls === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(published);
      }),
    );
    renderSite("pub");

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Take tram 28.")).toBeInTheDocument();
  });
});
