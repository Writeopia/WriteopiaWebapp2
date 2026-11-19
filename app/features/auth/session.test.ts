import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { NetworkError, onSessionExpired } from "~/core/api";
import { queryClient } from "~/core/query/queryClient";
import { selectWorkspace } from "~/features/workspaces/api";

import { aUser, aWorkspace } from "../../../test/fixtures";
import { apiUrl, aSubscription, signedIn } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import {
  clearSession,
  decideStart,
  findSessionQuietly,
  guestOnly,
  hasSessionHint,
  loadSessionUser,
  paths,
  requireSession,
  requireSignedIn,
  requireWorkspace,
  setSessionUser,
} from "./session";

/** The path a guard redirected to; null when it let the route open. */
async function redirectOf(guard: () => Promise<unknown>): Promise<string | null> {
  try {
    await guard();
    return null;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.headers.get("Location");
    throw thrown;
  }
}

/** Counts the times the backend is asked who is signed in, answering that nobody is. */
function countSessionRequests() {
  const counter = { requests: 0 };
  server.use(
    http.get(apiUrl("/auth/user/current"), () => {
      counter.requests++;
      return new HttpResponse("Unauthorized", { status: 401 });
    }),
  );
  return counter;
}

/** A browser that was signed in the last time it was here. */
async function withSessionHint() {
  server.use(...signedIn(aUser()));
  await loadSessionUser();
  queryClient.clear();
}

function withWorkspaces(...workspaces: object[]) {
  server.use(http.get(apiUrl("/workspace/user"), () => HttpResponse.json(workspaces)));
}

describe("decideStart", () => {
  const workspaces = [aWorkspace({ id: "w1" }), aWorkspace({ id: "w2" })];

  it("goes to the login without a session", () => {
    expect(decideStart(null, false, [], null)).toBe(paths.login);
    expect(decideStart(null, true, workspaces, "w1")).toBe(paths.login);
  });

  it("goes to the paywall without a subscription", () => {
    expect(decideStart(aUser(), false, workspaces, "w1")).toBe(paths.paywall);
    expect(decideStart(aUser(), false, [], null)).toBe(paths.paywall);
  });

  it("goes to the choice of a workspace when none is selected", () => {
    expect(decideStart(aUser(), true, workspaces, null)).toBe(paths.workspaces);
  });

  it("goes to the choice of a workspace when the selected one is gone", () => {
    expect(decideStart(aUser(), true, workspaces, "deleted")).toBe(paths.workspaces);
  });

  it("goes to the app with a session and a workspace", () => {
    expect(decideStart(aUser(), true, workspaces, "w2")).toBe(paths.app);
  });
});

describe("loadSessionUser", () => {
  it("answers null when nobody is signed in", async () => {
    expect(await loadSessionUser()).toBeNull();
  });

  it("answers the user, and asks the backend only once", async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl("/auth/user/current"), () => {
        requests++;
        return HttpResponse.json(aUser());
      }),
    );

    expect(await loadSessionUser()).toEqual(aUser());
    expect(await loadSessionUser()).toEqual(aUser());
    expect(requests).toBe(1);
  });

  it("does not take an unreachable backend for a signed-out user", async () => {
    server.use(http.get(apiUrl("/auth/user/current"), () => HttpResponse.error()));

    await expect(loadSessionUser()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("session hint", () => {
  it("is not there in a browser that never signed in", async () => {
    await loadSessionUser();

    expect(hasSessionHint()).toBe(false);
  });

  it("is there once the backend answered with a user", async () => {
    server.use(...signedIn(aUser()));

    await loadSessionUser();

    expect(hasSessionHint()).toBe(true);
  });

  it("is gone when the session ends", async () => {
    await withSessionHint();

    clearSession();

    expect(hasSessionHint()).toBe(false);
  });
});

describe("findSessionQuietly", () => {
  it("answers null for a guest without announcing an expired session", async () => {
    let expired = 0;
    const remove = onSessionExpired(() => expired++);

    expect(await findSessionQuietly()).toBeNull();
    expect(expired).toBe(0);
    remove();
  });

  it("answers the user and remembers the session", async () => {
    server.use(...signedIn(aUser()));

    expect(await findSessionQuietly()).toEqual(aUser());
    expect(hasSessionHint()).toBe(true);
    expect(await loadSessionUser()).toEqual(aUser());
  });

  it("renews a session whose access expired", async () => {
    let renewed = false;
    server.use(
      http.get(apiUrl("/auth/user/current"), () =>
        renewed ? HttpResponse.json(aUser()) : new HttpResponse("Unauthorized", { status: 401 }),
      ),
      http.post(apiUrl("/auth/refresh/web"), () => {
        renewed = true;
        return new HttpResponse("Token refreshed");
      }),
    );

    expect(await findSessionQuietly()).toEqual(aUser());
  });
});

describe("guards", () => {
  it("requireSession sends a guest to the login", async () => {
    expect(await redirectOf(requireSession)).toBe(paths.login);
  });

  it("requireSession answers the user", async () => {
    server.use(...signedIn(aUser()));

    expect(await requireSession()).toEqual(aUser());
  });

  it("requireWorkspace sends to the choice when no workspace is selected", async () => {
    server.use(...signedIn(aUser()));
    withWorkspaces(aWorkspace());

    expect(await redirectOf(requireWorkspace)).toBe(paths.workspaces);
  });

  it("requireWorkspace sends to the choice when the selected workspace is gone", async () => {
    server.use(...signedIn(aUser()));
    withWorkspaces(aWorkspace({ id: "w1" }));
    selectWorkspace("deleted");

    expect(await redirectOf(requireWorkspace)).toBe(paths.workspaces);
  });

  it("requireWorkspace answers the user and the selected workspace", async () => {
    server.use(...signedIn(aUser()));
    withWorkspaces(aWorkspace({ id: "w1" }), aWorkspace({ id: "w2", name: "Team" }));
    selectWorkspace("w2");

    expect(await requireWorkspace()).toEqual({
      user: aUser(),
      workspace: aWorkspace({ id: "w2", name: "Team" }),
    });
  });

  it("requireSession sends a user without a subscription to the paywall", async () => {
    server.use(...signedIn(aUser(), { premium: false }));

    expect(await redirectOf(requireSession)).toBe(paths.paywall);
  });

  it("requireSession sends to the paywall when the subscription cannot be asked", async () => {
    server.use(...signedIn(aUser()));
    server.use(http.get(apiUrl("/auth/subscription"), () => HttpResponse.error()));

    expect(await redirectOf(requireSession)).toBe(paths.paywall);
  });

  it("requireSession asks for the subscription once per page", async () => {
    let requests = 0;
    server.use(...signedIn(aUser()));
    server.use(
      http.get(apiUrl("/auth/subscription"), () => {
        requests++;
        return HttpResponse.json(aSubscription(true));
      }),
    );

    await requireSession();
    await requireSession();

    expect(requests).toBe(1);
  });

  it("asks for the subscription again after a new sign-in", async () => {
    let premium = false;
    server.use(...signedIn(aUser()));
    server.use(
      http.get(apiUrl("/auth/subscription"), () => HttpResponse.json(aSubscription(premium))),
    );
    expect(await redirectOf(requireSession)).toBe(paths.paywall);

    premium = true;
    setSessionUser(aUser());

    expect(await requireSession()).toEqual(aUser());
  });

  it("requireSignedIn lets a user without a subscription in", async () => {
    server.use(...signedIn(aUser(), { premium: false }));

    expect(await requireSignedIn()).toEqual(aUser());
  });

  it("requireWorkspace sends a user without a subscription to the paywall", async () => {
    server.use(...signedIn(aUser(), { premium: false }));
    withWorkspaces(aWorkspace({ id: "w1" }));
    selectWorkspace("w1");

    expect(await redirectOf(requireWorkspace)).toBe(paths.paywall);
  });

  it("guestOnly lets a guest in without asking the backend", async () => {
    const counter = countSessionRequests();

    expect(await redirectOf(guestOnly)).toBeNull();
    expect(counter.requests).toBe(0);
  });

  it("guestOnly lets in a guest whose session is gone", async () => {
    await withSessionHint();
    server.resetHandlers();

    expect(await redirectOf(guestOnly)).toBeNull();
  });

  it("guestOnly sends a signed-in user to the start", async () => {
    await withSessionHint();

    expect(await redirectOf(guestOnly)).toBe(paths.start);
  });

  it("guestOnly still opens the screen when the backend is unreachable", async () => {
    await withSessionHint();
    server.use(http.get(apiUrl("/auth/user/current"), () => HttpResponse.error()));

    expect(await redirectOf(guestOnly)).toBeNull();
  });
});
