import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { queryClient } from "~/core/query/queryClient";
import { loadSessionUser, paths } from "~/features/auth/session";
import { selectWorkspace } from "~/features/workspaces/api";

import { aUser, aWorkspace } from "../../test/fixtures";
import { apiUrl, signedIn } from "../../test/msw/handlers";
import { server } from "../../test/msw/server";
import { clientLoader } from "./start";

async function destination(): Promise<string | null> {
  return (await clientLoader()).headers.get("Location");
}

/** A browser that was signed in the last time it was here, with workspace w1 selected. */
async function returningUser(premium: boolean) {
  server.use(
    ...signedIn(aUser(), { premium }),
    http.get(apiUrl("/workspace/user"), () => HttpResponse.json([aWorkspace({ id: "w1" })])),
  );
  await loadSessionUser();
  queryClient.clear();
  selectWorkspace("w1");
}

describe("start", () => {
  it("opens the login without asking the backend when the browser never signed in", async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl("/auth/user/current"), () => {
        requests++;
        return new HttpResponse("Unauthorized", { status: 401 });
      }),
    );

    expect(await destination()).toBe(paths.login);
    expect(requests).toBe(0);
  });

  it("opens the app for a browser that was signed in and has a subscription", async () => {
    await returningUser(true);

    expect(await destination()).toBe(paths.app);
  });

  it("opens the paywall for a user without a subscription", async () => {
    let workspaceRequests = 0;
    await returningUser(false);
    server.use(
      http.get(apiUrl("/workspace/user"), () => {
        workspaceRequests++;
        return HttpResponse.json([]);
      }),
    );

    expect(await destination()).toBe(paths.paywall);
    expect(workspaceRequests).toBe(0);
  });

  it("opens the paywall when the subscription cannot be asked", async () => {
    await returningUser(true);
    server.use(http.get(apiUrl("/auth/subscription"), () => HttpResponse.error()));

    expect(await destination()).toBe(paths.paywall);
  });
});
