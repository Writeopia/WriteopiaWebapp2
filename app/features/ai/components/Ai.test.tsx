import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ComponentProps } from "react";
import { useParams } from "react-router";
import { describe, expect, it } from "vitest";

import { type StoryStep, StoryTypes } from "~/core/models";
import { rankAt } from "~/core/rank/rank";
import DocumentRoute from "~/routes/app/document";

import { aDocument, aStep, aUser, aWorkspace } from "../../../../test/fixtures";
import { apiUrl } from "../../../../test/msw/handlers";
import { menuBackend } from "../../../../test/msw/menuBackend";
import { server } from "../../../../test/msw/server";
import { renderAppRoute } from "../../../../test/render";

const DRAG_HANDLE = "Drag to move, click to select";

const notes = aDocument({
  id: "notes",
  title: "Notes",
  content: [
    aStep({ id: "title", type: StoryTypes.TITLE, text: "Notes", position: rankAt(0) }),
    aStep({ id: "line-1", text: "first line", position: rankAt(1) }),
    aStep({ id: "line-2", text: "second line", position: rankAt(2) }),
  ],
});

function sse(...answers: string[]) {
  const body = answers
    .map(
      (answer, index) =>
        `data: ${JSON.stringify({ response: answer, done: index === answers.length - 1 })}\n\n`,
    )
    .join("");
  return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
}

type Options = {
  available?: boolean;
  intent?: "ADD" | "REPLACE" | "REWRITE";
  answer?: () => Response;
};

function backend({
  available = true,
  intent = "ADD",
  answer = () => sse("An answer"),
}: Options = {}) {
  menuBackend({ documents: [notes] });
  const synced: StoryStep[] = [];
  const prompts: Record<string, unknown>[] = [];
  let usageCalls = 0;

  server.use(
    http.post(apiUrl("/docs/workspace/:ws/document/:id/steps/sync"), async ({ request }) => {
      const body = (await request.json()) as { changes: { storyStep: StoryStep }[] };
      synced.push(...body.changes.map((change) => change.storyStep));
      return HttpResponse.json({ serverTimestamp: Date.now(), updatedSteps: [], deletedIds: [] });
    }),
    http.get(apiUrl("/ai/status"), () => HttpResponse.json({ available })),
    http.get(apiUrl("/ai/usage"), () => {
      usageCalls++;
      return HttpResponse.json({ totalTokens: 1200 * usageCalls, quota: 100000 });
    }),
    http.post(apiUrl("/ai/writing-suggestions"), () => HttpResponse.json({ suggestions: [] })),
    http.post(apiUrl("/ai/command-intent"), () => HttpResponse.json({ intent })),
    http.post(apiUrl("/ai/command"), async ({ request }) => {
      prompts.push((await request.json()) as Record<string, unknown>);
      return answer();
    }),
    http.post(apiUrl("/ai/summary"), async ({ request }) => {
      prompts.push((await request.json()) as Record<string, unknown>);
      return answer();
    }),
  );
  return { synced, prompts, usageCalls: () => usageCalls };
}

function DocumentScreen() {
  const params = useParams();
  return <DocumentRoute {...({ params } as ComponentProps<typeof DocumentRoute>)} />;
}

function renderNotes(tier: "FREE" | "PREMIUM" = "PREMIUM") {
  return renderAppRoute(DocumentScreen, {
    path: "/app/document/notes",
    route: "/app/document/:documentId",
    session: { user: aUser({ tier }), workspace: aWorkspace() },
  });
}

async function askAi(command: string) {
  const button = await screen.findByRole("button", { name: "Ask AI" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  const field = await screen.findByRole("textbox", { name: "Ask AI…" });
  await userEvent.type(field, `${command}{Enter}`);
}

describe("the AI command bar", () => {
  it("suggests the answer and saves it once kept", async () => {
    const server = backend({ answer: () => sse("An", "An added line") });
    renderNotes();

    await askAi("add a line");

    expect(await screen.findByText("Keep the AI's answer?")).toBeInTheDocument();
    expect(screen.getByText("An added line")).toBeInTheDocument();
    expect(server.prompts[0]).toMatchObject({ command: "add a line", intent: "ADD" });
    expect(server.synced.some((step) => step.text === "An added line")).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(screen.queryByText("Keep the AI's answer?")).not.toBeInTheDocument();
    await waitFor(
      () => expect(server.synced.some((step) => step.text === "An added line")).toBe(true),
      { timeout: 3000 },
    );
  });

  it("puts the lines back when the answer is discarded", async () => {
    backend({ intent: "REPLACE", answer: () => sse("REWRITTEN") });
    renderNotes();

    await askAi("shout");
    await screen.findByText("Keep the AI's answer?");
    expect(screen.getByText("REWRITTEN")).toBeInTheDocument();
    expect(screen.queryByText("first line")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByText("REWRITTEN")).not.toBeInTheDocument();
    expect(screen.getByText("first line")).toBeInTheDocument();
    expect(screen.getByText("second line")).toBeInTheDocument();
  });

  it("keeps with the keyboard and discards with Escape", async () => {
    backend({ answer: () => sse("Kept by key") });
    renderNotes();

    await askAi("go");
    await screen.findByText("Keep the AI's answer?");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Kept by key")).not.toBeInTheDocument();

    await askAi("go");
    await screen.findByText("Keep the AI's answer?");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(screen.queryByText("Keep the AI's answer?")).not.toBeInTheDocument();
    expect(screen.getByText("Kept by key")).toBeInTheDocument();
  });

  it("leaves the answer alone when Escape or ⌘Enter are for a dialog or a field", async () => {
    backend({ answer: () => sse("Still here") });
    renderNotes();

    await askAi("go");
    await screen.findByText("Keep the AI's answer?");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const field = document.createElement("input");
    dialog.append(field);
    document.body.append(dialog);
    field.focus();

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(screen.getByText("Keep the AI's answer?")).toBeInTheDocument();
    dialog.remove();
  });

  it("says when the tokens of the month are used up", async () => {
    backend({ answer: () => HttpResponse.json({ error: "Quota" }, { status: 429 }) });
    renderNotes();

    await askAi("go");

    expect(
      await screen.findByText("You have used all your AI tokens this month."),
    ).toBeInTheDocument();
    expect(screen.getByText("first line")).toBeInTheDocument();
  });

  it("offers premium to a FREE user", async () => {
    backend();
    renderNotes("FREE");

    await userEvent.click(await screen.findByRole("button", { name: "Ask AI" }));

    expect(await screen.findByRole("dialog", { name: "Premium feature" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ask AI…" })).not.toBeInTheDocument();
  });

  it("is disabled, with the reason, when the backend has no AI", async () => {
    backend({ available: false });
    renderNotes();

    const button = await screen.findByRole("button", { name: "Ask AI" });
    await waitFor(() => expect(button).toHaveAttribute("title", "AI is not available."));
    expect(button).toBeDisabled();
  });
});

describe("the AI tab of the side panel", () => {
  async function openAiTab() {
    await userEvent.click(await screen.findByRole("button", { name: "Document options" }));
    await userEvent.click(screen.getByRole("tab", { name: "AI" }));
    return screen.getByRole("tabpanel");
  }

  it("summarizes the document into a suggestion and refreshes the usage", async () => {
    const server = backend({ answer: () => sse("Short summary.") });
    renderNotes();

    const panel = await openAiTab();
    expect(await within(panel).findByText("1,200 of 100,000 tokens")).toBeInTheDocument();
    const summary = within(panel).getByRole("button", { name: "Summary" });
    await waitFor(() => expect(summary).toBeEnabled());
    await userEvent.click(summary);

    expect(await screen.findByText("Short summary.")).toBeInTheDocument();
    expect(server.prompts[0]).toEqual({ prompt: "first line\nsecond line", stream: true });
    expect(await within(panel).findByText("2,400 of 100,000 tokens")).toBeInTheDocument();
  });

  it("asks for lines first when the target is the selected lines", async () => {
    backend();
    renderNotes();

    const panel = await openAiTab();
    await userEvent.click(within(panel).getByRole("radio", { name: "Selected lines" }));

    expect(within(panel).getByText("Select lines in the document first")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Summary" })).toBeDisabled();
    expect(within(panel).getByRole("radio", { name: "Cursor" })).toBeDisabled();
  });

  it("draws an image for the selected paragraph, below it", async () => {
    backend();
    let paragraph = "";
    server.use(
      http.post(apiUrl("/ai/image"), async ({ request }) => {
        paragraph = ((await request.json()) as { paragraph: string }).paragraph;
        return HttpResponse.json({ imageUrl: "https://cdn/drawn.png" });
      }),
    );
    renderNotes();

    const handles = await screen.findAllByRole("button", { name: DRAG_HANDLE });
    await userEvent.click(handles[1]!);
    const panel = await openAiTab();
    const draw = within(panel).getByRole("button", { name: "Draw an image for this paragraph" });
    await waitFor(() => expect(draw).toBeEnabled());
    await userEvent.click(draw);

    await screen.findByText("Keep the AI's answer?");
    expect(paragraph).toBe("second line");
    expect(document.querySelector('img[src="https://cdn/drawn.png"]')).not.toBeNull();
  });

  it("cannot draw an image with no paragraph chosen", async () => {
    backend();
    renderNotes();

    const panel = await openAiTab();
    expect(
      within(panel).getByRole("button", { name: "Draw an image for this paragraph" }),
    ).toBeDisabled();
  });
});
