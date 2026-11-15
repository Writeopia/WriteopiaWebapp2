import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { aDocument, aUser, WORKSPACE_ID } from "../../../test/fixtures";
import { apiUrl as mockUrl, signedIn } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { documentSchema, userSchema } from "../models";
import {
  api,
  ApiError,
  ApiParseError,
  apiRequest,
  apiUrl,
  NetworkError,
  onSessionExpired,
} from ".";

const okSchema = z.object({ ok: z.boolean() });

describe("apiUrl", () => {
  it("puts the path under /api on the origin of the page", () => {
    expect(apiUrl("/auth/user/current")).toBe("http://localhost:3000/api/auth/user/current");
  });

  it("adds the query, without the empty values", () => {
    expect(apiUrl("/search", { q: "to do & more", page: 2, skip: undefined, none: null })).toBe(
      "http://localhost:3000/api/search?q=to+do+%26+more&page=2",
    );
  });
});

describe("requests", () => {
  it("reads and checks a JSON answer", async () => {
    server.use(...signedIn(aUser({ tier: "PREMIUM" })));

    const user = await api.get("/auth/user/current", userSchema);

    expect(user).toEqual(aUser({ tier: "PREMIUM" }));
  });

  it("reads a document through its schema", async () => {
    const document = aDocument();
    server.use(
      http.get(mockUrl(`/docs/workspace/${WORKSPACE_ID}/document/${document.id}`), () =>
        HttpResponse.json(document),
      ),
    );

    const loaded = await api.get(
      `/docs/workspace/${WORKSPACE_ID}/document/${document.id}`,
      documentSchema,
    );

    expect(loaded).toEqual(document);
  });

  it("sends the body as JSON, with the cookies of the session", async () => {
    let received: unknown = null;
    server.use(
      http.post(mockUrl("/auth/login/web"), async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await api.post("/auth/login/web", { identifier: "ana", password: "secret!" }, okSchema);

    expect(received).toEqual({ identifier: "ana", password: "secret!" });
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends a form as multipart, leaving the content type to the browser", async () => {
    // jsdom's FormData cannot go through Node's fetch, so the request stops at the call.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ imageUrl: "https://cdn/img.png" }, { status: 201 }));

    const form = new FormData();
    form.append("image", new File(["png"], "photo.png", { type: "image/png" }));
    const answer = await api.post("/media/upload", form, z.object({ imageUrl: z.string() }));

    expect(answer.imageUrl).toBe("https://cdn/img.png");
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:3000/api/media/upload");
    expect(init?.body).toBe(form);
    expect(init?.headers).not.toHaveProperty("Content-Type");
  });

  it("sends a request that has nothing to read back", async () => {
    let called = false;
    server.use(
      http.post(mockUrl("/workspace/w1/export"), () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(api.send("POST", "/workspace/w1/export")).resolves.toBeUndefined();
    expect(called).toBe(true);
  });
});

describe("errors", () => {
  it("carries the plain text the backend explains a failure with", async () => {
    server.use(
      http.post(
        mockUrl("/workspace/user"),
        () => new HttpResponse("User not found", { status: 404 }),
      ),
    );

    const error = await api.send("POST", "/workspace/user", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "User not found", isNotFound: true });
  });

  it("carries the message of a JSON failure", async () => {
    server.use(
      http.post(mockUrl("/auth/email/confirm"), () =>
        HttpResponse.json({ success: false, message: "Invalid code" }, { status: 400 }),
      ),
      http.post(mockUrl("/ai/image"), () =>
        HttpResponse.json({ error: "Quota exceeded" }, { status: 429 }),
      ),
    );

    await expect(api.send("POST", "/auth/email/confirm", {})).rejects.toMatchObject({
      status: 400,
      message: "Invalid code",
    });
    await expect(api.send("POST", "/ai/image", {})).rejects.toMatchObject({
      status: 429,
      message: "Quota exceeded",
    });
  });

  it("falls back to the status when the failure has no body", async () => {
    server.use(
      http.get(
        mockUrl("/down"),
        () => new HttpResponse(null, { status: 503, statusText: "Service Unavailable" }),
      ),
    );

    await expect(api.get("/down", okSchema)).rejects.toMatchObject({
      status: 503,
      message: "Service Unavailable",
    });
  });

  it("says so when the answer does not have the expected shape", async () => {
    server.use(http.get(mockUrl("/auth/user/current"), () => HttpResponse.json({ id: 1 })));

    const error = await api
      .get("/auth/user/current", userSchema, { renewSession: false })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiParseError);
    expect((error as ApiParseError).path).toBe("/auth/user/current");
  });

  it("says so when the backend is not reached", async () => {
    server.use(http.get(mockUrl("/offline"), () => HttpResponse.error()));

    const error = await api.get("/offline", okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(false);
  });

  it("gives up after the timeout", async () => {
    server.use(
      http.get(mockUrl("/slow"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ ok: true });
      }),
    );

    const error = await api.get("/slow", okSchema, { timeoutMs: 20 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(true);
  });

  it("lets the caller cancel a request", async () => {
    server.use(
      http.get(mockUrl("/slow"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ ok: true });
      }),
    );
    const controller = new AbortController();

    const request = api.get("/slow", okSchema, { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("session", () => {
  /** A backend whose access cookie has expired, and that renews it when asked to. */
  function expiredSession({ renewable }: { renewable: boolean }) {
    const state = { valid: false, refreshes: 0, expired: vi.fn() };

    server.use(
      http.post(mockUrl("/auth/refresh/web"), async () => {
        state.refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (!renewable)
          return new HttpResponse("Invalid or expired refresh token", { status: 401 });
        state.valid = true;
        return new HttpResponse("Token refreshed");
      }),
      http.get(mockUrl("/auth/user/current"), () =>
        state.valid
          ? HttpResponse.json(aUser())
          : new HttpResponse("Unauthorized", { status: 401 }),
      ),
    );

    const stopListening = onSessionExpired(state.expired);
    return { state, stopListening };
  }

  it("renews an expired session and repeats the request", async () => {
    const { state, stopListening } = expiredSession({ renewable: true });

    const user = await api.get("/auth/user/current", userSchema);

    expect(user).toEqual(aUser());
    expect(state.refreshes).toBe(1);
    expect(state.expired).not.toHaveBeenCalled();
    stopListening();
  });

  it("renews once for all the requests that found the session expired", async () => {
    const { state, stopListening } = expiredSession({ renewable: true });

    const users = await Promise.all([
      api.get("/auth/user/current", userSchema),
      api.get("/auth/user/current", userSchema),
      api.get("/auth/user/current", userSchema),
    ]);

    expect(users).toHaveLength(3);
    expect(state.refreshes).toBe(1);
    stopListening();
  });

  it("tells the app when the session cannot be renewed", async () => {
    const { state, stopListening } = expiredSession({ renewable: false });

    await expect(api.get("/auth/user/current", userSchema)).rejects.toMatchObject({ status: 401 });

    expect(state.refreshes).toBe(1);
    expect(state.expired).toHaveBeenCalledOnce();
    stopListening();
  });

  it("stops telling a listener that was removed", async () => {
    const { state, stopListening } = expiredSession({ renewable: false });
    stopListening();

    await expect(api.get("/auth/user/current", userSchema)).rejects.toBeInstanceOf(ApiError);

    expect(state.expired).not.toHaveBeenCalled();
  });

  it("does not renew for the requests that are about the session itself", async () => {
    const { state, stopListening } = expiredSession({ renewable: true });
    server.use(
      http.post(
        mockUrl("/auth/login/web"),
        () => new HttpResponse("Invalid credentials", { status: 401 }),
      ),
    );

    await expect(
      api.post("/auth/login/web", {}, okSchema, { renewSession: false }),
    ).rejects.toMatchObject({ status: 401, message: "Invalid credentials" });

    expect(state.refreshes).toBe(0);
    expect(state.expired).not.toHaveBeenCalled();
    stopListening();
  });

  it("gives the answer back to be read as a stream", async () => {
    server.use(
      http.post(
        mockUrl("/ai/generate"),
        () => new HttpResponse('data: {"response":"Hi","done":true}\n'),
      ),
    );

    const response = await apiRequest("/ai/generate", { method: "POST", body: { prompt: "Hi" } });

    expect(await response.text()).toBe('data: {"response":"Hi","done":true}\n');
  });
});
