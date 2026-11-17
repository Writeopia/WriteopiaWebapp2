import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ComponentProps } from "react";
import { useParams } from "react-router";
import { describe, expect, it } from "vitest";

import { type Document, type DocumentTag, StoryTypes } from "~/core/models";
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

const LONG = "We walked through Alfama and ate pastéis de nata. ".repeat(5);

function aStory(fields: Partial<Document> = {}, title = "Lisbon", text = LONG) {
  return aDocument({
    id: "story",
    title,
    content: [
      aStep({ id: "title", type: StoryTypes.TITLE, text: title, position: rankAt(0) }),
      aStep({ id: "p1", text, position: rankAt(1) }),
    ],
    ...fields,
  });
}

const travel: DocumentTag = {
  id: "tag-travel",
  workspaceId: WORKSPACE_ID,
  name: "Travel",
  description: "Trips",
  createdAt: 1,
  lastUpdatedAt: 1,
  deleted: false,
};
const food: DocumentTag = { ...travel, id: "tag-food", name: "Food", description: "" };

function sse(answer: string) {
  return new HttpResponse(`data: ${JSON.stringify({ response: answer, done: true })}\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function backend(document: Document, suggestions: object[] = []) {
  const recipes = aFolder({ id: "recipes", title: "Recipes" });
  const menu = menuBackend({ documents: [document], folders: [recipes], tags: [travel, food] });
  server.use(
    http.post(apiUrl("/docs/workspace/:ws/document/:id/steps/sync"), () =>
      HttpResponse.json({ serverTimestamp: Date.now(), updatedSteps: [], deletedIds: [] }),
    ),
    http.get(apiUrl("/ai/status"), () => HttpResponse.json({ available: true })),
    http.get(apiUrl("/ai/usage"), () => HttpResponse.json({ totalTokens: 0 })),
    http.post(apiUrl("/ai/writing-suggestions"), () => HttpResponse.json({ suggestions })),
    http.post(apiUrl("/ai/generate"), () => sse("All in all, a sweet trip.")),
    http.post(apiUrl("/ai/folder-suggestions"), () =>
      HttpResponse.json({
        suggestions: [{ folderId: "recipes", probability: 0.8, folderName: "Recipes" }],
      }),
    ),
    http.post(apiUrl("/ai/tag-suggestions"), () =>
      HttpResponse.json({ suggestions: [{ tagId: "tag-travel", probability: 0.9 }] }),
    ),
  );
  return menu;
}

function DocumentScreen() {
  const params = useParams();
  return <DocumentRoute {...({ params } as ComponentProps<typeof DocumentRoute>)} />;
}

function renderStory() {
  return renderAppRoute(DocumentScreen, {
    path: "/app/document/story",
    route: "/app/document/:documentId",
    session: { user: aUser({ tier: "PREMIUM" }), workspace: aWorkspace() },
  });
}

async function suggestionsBox() {
  return screen.findByRole("region", { name: "AI suggestions" });
}

describe("the writing suggestions", () => {
  it("offers a conclusion when a long document opens, and suggests it at the end", async () => {
    backend(aStory({ parentId: "elsewhere", tagIds: ["tag-travel"] }), [
      { action: "CONCLUSION", probability: 0.8 },
    ]);
    renderStory();

    const box = await suggestionsBox();
    await userEvent.click(await within(box).findByRole("button", { name: "Write a conclusion" }));

    expect(await screen.findByText("All in all, a sweet trip.")).toBeInTheDocument();
    expect(screen.getByText("Keep the AI's answer?")).toBeInTheDocument();
    expect(
      within(box).queryByRole("button", { name: "Write a conclusion" }),
    ).not.toBeInTheDocument();
  });

  it("offers a title to a document without one and writes it", async () => {
    backend(aStory({ parentId: "elsewhere", tagIds: ["tag-travel"], title: "" }, "", "Short."));
    server.use(http.post(apiUrl("/ai/generate"), () => sse('"Sweet Lisbon"')));
    renderStory();

    const box = await suggestionsBox();
    await userEvent.click(within(box).getByRole("button", { name: "Give the document a title" }));

    expect(await screen.findByText("Sweet Lisbon")).toBeInTheDocument();
  });

  it("hides the suggestions", async () => {
    backend(aStory({ parentId: "elsewhere", tagIds: ["tag-travel"] }), [
      { action: "TLDR", probability: 0.8 },
    ]);
    renderStory();

    const box = await suggestionsBox();
    await within(box).findByRole("button", { name: "Add a TL;DR at the top" });
    await userEvent.click(within(box).getByRole("button", { name: "Hide the suggestions" }));

    expect(screen.queryByRole("region", { name: "AI suggestions" })).not.toBeInTheDocument();
  });

  it("moves a document of the root to the folder the AI suggests", async () => {
    const menu = backend(aStory({ tagIds: ["tag-travel"] }));
    renderStory();

    const box = await suggestionsBox();
    await userEvent.click(within(box).getByRole("button", { name: "Move to a folder" }));
    const dialog = await screen.findByRole("dialog", { name: "Move to a folder" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Recipes" }));

    await waitFor(() =>
      expect(menu.calls).toContainEqual(
        expect.objectContaining({
          path: `/api/docs/workspace/${WORKSPACE_ID}/document/story/move`,
          body: { targetParentId: "recipes" },
        }),
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Move to a folder" })).not.toBeInTheDocument();
  });

  it("adds the tags the AI suggests to an untagged document", async () => {
    const menu = backend(aStory({ parentId: "elsewhere" }));
    renderStory();

    const box = await suggestionsBox();
    await userEvent.click(within(box).getByRole("button", { name: "Add tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Add tags" });
    const travelBox = await within(dialog).findByRole("checkbox", { name: /Travel/ });
    expect(travelBox).toBeChecked();
    expect(within(dialog).queryByRole("checkbox", { name: /Food/ })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const saves = menu.calls.filter((call) => call.path === "/api/docs/workspace/document");
      const last = saves.at(-1)?.body as { documents: { tagIds: string[] }[] } | undefined;
      expect(last?.documents[0]?.tagIds).toEqual(["tag-travel"]);
    });
  });
});
