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

  it("opens the app for a browser that was signed in and still is", async () => {
    server.use(
      ...signedIn(aUser()),
      http.get(apiUrl("/workspace/user"), () => HttpResponse.json([aWorkspace({ id: "w1" })])),
    );
    await loadSessionUser();
    queryClient.clear();
    selectWorkspace("w1");

    expect(await destination()).toBe(paths.app);
  });
});
