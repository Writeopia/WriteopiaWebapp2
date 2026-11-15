import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiUrl } from "./handlers";
import { server } from "./server";

describe("mocked backend", () => {
  it("answers with the default handlers", async () => {
    const response = await fetch(apiUrl("/auth/session/status"));

    expect(await response.json()).toEqual({ authenticated: false });
  });

  it("lets a test override a handler", async () => {
    server.use(
      http.get(apiUrl("/auth/session/status"), () =>
        HttpResponse.json({ authenticated: true, userId: "user-1" }),
      ),
    );

    const response = await fetch(apiUrl("/auth/session/status"));

    expect(await response.json()).toEqual({ authenticated: true, userId: "user-1" });
  });
});
