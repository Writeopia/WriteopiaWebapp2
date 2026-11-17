import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "~/core/api";

import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import {
  aiFailure,
  askAi,
  commandIntent,
  folderSuggestions,
  getAiUsage,
  paragraphImage,
  streamCommand,
  streamQuickAction,
  tagSuggestions,
  writingSuggestions,
} from "./api";

function sse(...events: object[]): HttpResponse<string> {
  return new HttpResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function all(answers: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const answer of answers) out.push(answer);
  return out;
}

describe("AI endpoints", () => {
  it("streams a quick action with the text as the prompt", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/ai/action-points"), async ({ request }) => {
        body = await request.json();
        return sse({ response: "- a" }, { response: "- a\n- b", done: true });
      }),
    );

    expect(await all(streamQuickAction("actionPoints", "The text"))).toEqual(["- a", "- a\n- b"]);
    expect(body).toEqual({ prompt: "The text", stream: true });
  });

  it("asks the intent of a command, and null when the backend cannot decide", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(apiUrl("/ai/command-intent"), async ({ request }) => {
        bodies.push(await request.json());
        return bodies.length === 1
          ? HttpResponse.json({ intent: "REPLACE", replaceProbability: 0.9 })
          : HttpResponse.json({ error: "unsure" });
      }),
    );
    const request = { command: "shorter", selectedText: "a", documentTitle: "T", documentText: "a" };

    expect(await commandIntent(request)).toBe("REPLACE");
    expect(await commandIntent(request)).toBeNull();
    expect(bodies[0]).toEqual({ ...request, stream: false });
  });

  it("streams a command with its intent", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/ai/command"), async ({ request }) => {
        body = await request.json();
        return sse({ response: "Done", done: true });
      }),
    );
    const request = { command: "c", selectedText: "", documentTitle: "", documentText: "d" };

    expect(await all(streamCommand({ ...request, intent: "ADD" }))).toEqual(["Done"]);
    expect(body).toEqual({ ...request, intent: "ADD", stream: true });
  });

  it("asks once for a whole answer, trimmed", async () => {
    server.use(
      http.post(apiUrl("/ai/generate"), () =>
        sse({ response: "  A tit" }, { response: "  A title  ", done: true }),
      ),
    );
    expect(await askAi("prompt")).toBe("A title");
  });

  it("fails an empty answer", async () => {
    server.use(http.post(apiUrl("/ai/generate"), () => sse({ response: " ", done: true })));
    await expect(askAi("prompt")).rejects.toThrow();
  });

  it("reads the writing suggestions", async () => {
    server.use(
      http.post(apiUrl("/ai/writing-suggestions"), () =>
        HttpResponse.json({
          suggestions: [
            { action: "LIST", probability: 0.8 },
            { action: "SOMETHING_NEW", probability: 0.9 },
          ],
        }),
      ),
    );
    const suggestions = await writingSuggestions({ scope: "WRITING", text: "Steps:" });
    expect(suggestions).toEqual([{ action: "LIST", probability: 0.8 }]);
  });

  it("reads the folder and tag suggestions", async () => {
    server.use(
      http.post(apiUrl("/ai/folder-suggestions"), () =>
        HttpResponse.json({
          suggestions: [{ folderId: "f1", probability: 0.7, folderName: "Recipes" }],
        }),
      ),
      http.post(apiUrl("/ai/tag-suggestions"), () =>
        HttpResponse.json({ suggestions: [{ tagId: "t1", probability: 0.6 }] }),
      ),
    );
    expect(
      await folderSuggestions({ documentTitle: "", documentText: "x", workspaceId: "w" }),
    ).toEqual([{ folderId: "f1", probability: 0.7, folderName: "Recipes" }]);
    expect(await tagSuggestions({ documentTitle: "", documentText: "x", tags: [] })).toEqual([
      { tagId: "t1", probability: 0.6 },
    ]);
  });

  it("draws a picture for a paragraph, and fails with the reason when there is none", async () => {
    server.use(
      http.post(apiUrl("/ai/image"), async ({ request }) => {
        const body = (await request.json()) as { paragraph: string };
        return body.paragraph === "ok"
          ? HttpResponse.json({ imageUrl: "https://cdn/x.png" })
          : HttpResponse.json({ error: "Blocked" });
      }),
    );
    const context = { documentTitle: "T", documentText: "D" };
    expect(await paragraphImage({ paragraph: "ok", ...context })).toBe("https://cdn/x.png");
    await expect(paragraphImage({ paragraph: "no", ...context })).rejects.toThrow("Blocked");
  });

  it("reads the usage", async () => {
    server.use(
      http.get(apiUrl("/ai/usage"), () =>
        HttpResponse.json({
          totalInputTokens: 1,
          totalOutputTokens: 2,
          totalTokens: 3,
          requestCount: 1,
          periodStart: 0,
          periodEnd: 10,
          quota: 100,
        }),
      ),
    );
    expect(await getAiUsage()).toMatchObject({ totalTokens: 3, quota: 100 });
  });
});

describe("aiFailure", () => {
  it("tells a premium refusal, a used-up quota and other failures apart", () => {
    expect(aiFailure(new ApiError(403, "Premium", ""))).toBe("premium");
    expect(aiFailure(new ApiError(429, "Quota", ""))).toBe("quota");
    expect(aiFailure(new Error("x"))).toBe("other");
  });
});
