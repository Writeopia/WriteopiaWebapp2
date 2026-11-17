import type { Page, Route } from "@playwright/test";

/**
 * A Writeopia backend in the test process: the browser's calls to /api are answered here, and
 * what the editor saves stays here, across reloads of the page. Only the calls the journeys
 * make are known; any other answers 404 so a missing one shows up.
 */

type Step = Record<string, unknown> & { id: string; position: string };

export const WORKSPACE_ID = "workspace-e2e";

const user = { id: "user-1", email: "ana@writeopia.io", name: "Ana", tier: "PREMIUM" };
const workspace = {
  id: WORKSPACE_ID,
  userId: "user-1",
  name: "Personal",
  role: "ADMIN",
  documentCount: 1,
};

export function step(id: string, position: string, fields: Record<string, unknown> = {}): Step {
  return {
    id,
    type: { name: "message", number: 0 },
    text: "",
    position,
    ...fields,
  };
}

export function titleStep(text: string): Step {
  return step("title", "0001000000", { type: { name: "title", number: 11 }, text });
}

export class FakeBackend {
  readonly steps = new Map<string, Step>();
  readonly syncs: { changes: { storyStep: Step; position: string }[]; deletions: string[] }[] = [];
  readonly uploads: string[] = [];
  locked = false;
  /** Like the real backend: a deleted step id is never stored again. */
  readonly tombstones = new Set<string>();

  constructor(
    readonly documentId: string,
    steps: Step[],
  ) {
    for (const each of steps) this.steps.set(each.id, each);
  }

  /** The texts of the document as saved, in order. */
  texts(): unknown[] {
    return this.ordered().map((each) => each.text ?? null);
  }

  ordered(): Step[] {
    return [...this.steps.values()].sort((a, b) => (a.position < b.position ? -1 : 1));
  }

  document() {
    return {
      id: this.documentId,
      title: (this.steps.get("title")?.text as string | undefined) ?? "",
      workspaceId: WORKSPACE_ID,
      content: this.ordered(),
      createdAt: 1_700_000_000_000,
      lastUpdatedAt: 1_700_000_000_000,
      parentId: "root",
      isLocked: this.locked,
    };
  }

  async install(page: Page) {
    await page.addInitScript((id) => {
      window.localStorage.setItem("writeopia.selectedWorkspace", id);
    }, WORKSPACE_ID);
    // Only the API: the dev server serves modules under paths like /app/core/api/ too.
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) => this.answer(route),
    );
  }

  private async answer(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();
    const docs = `/docs/workspace/${WORKSPACE_ID}`;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });

    if (path === "/auth/user/current") return json(user);
    if (path === "/auth/session/status") return json({ authenticated: true });
    if (path === "/workspace/user") return json([workspace]);
    if (path === `${docs}/user/favorites`) return json([]);
    if (path.startsWith(`${docs}/folder/`) && path.endsWith("/contents/preview")) {
      return json({ folders: [], documents: [{ ...this.document(), content: [] }], tags: [] });
    }
    if (path === `${docs}/document/${this.documentId}` && method === "GET") {
      return json(this.document());
    }
    if (path === `${docs}/document/${this.documentId}/steps/sync`) {
      const body = request.postDataJSON() as (typeof this.syncs)[number];
      this.syncs.push(body);
      for (const change of body.changes) {
        if (this.tombstones.has(change.storyStep.id)) continue;
        this.steps.set(change.storyStep.id, { ...change.storyStep, position: change.position });
      }
      for (const id of body.deletions) {
        this.steps.delete(id);
        this.tombstones.add(id);
      }
      return json({ serverTimestamp: Date.now(), updatedSteps: [], deletedIds: [] });
    }
    if (path === "/media/upload") {
      const url = `https://images.example/${this.uploads.length + 1}.png`;
      this.uploads.push(url);
      return json({ imageUrl: url }, 201);
    }
    if (path.endsWith("/link-card/describe")) {
      const body = request.postDataJSON() as { storyStep: Step };
      return json({ storyStep: { ...body.storyStep, text: "A page about things" } });
    }
    if (path === "/docs/workspace/document" && method === "POST") {
      const body = request.postDataJSON() as { documents: { id: string; isLocked: boolean }[] };
      const saved = body.documents.find((document) => document.id === this.documentId);
      if (saved) this.locked = saved.isLocked;
      return route.fulfill({ status: 200 });
    }
    if (path === "/ai/status") return json({ available: false });
    if (path === `/ai/header-images/${WORKSPACE_ID}`) return json({ images: [] });
    console.warn(`Not faked: ${method} ${path}`);
    return route.fulfill({ status: 404, body: `Not faked: ${method} ${path}` });
  }
}
