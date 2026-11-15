import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { NetworkError } from "~/core/api";
import { selectWorkspace } from "~/features/workspaces/api";

import { aUser, aWorkspace } from "../../../test/fixtures";
import { apiUrl, signedIn } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import {
  decideStart,
  guestOnly,
  loadSessionUser,
  paths,
  requireSession,
  requireWorkspace,
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

function withWorkspaces(...workspaces: object[]) {
  server.use(http.get(apiUrl("/workspace/user"), () => HttpResponse.json(workspaces)));
}

describe("decideStart", () => {
  const workspaces = [aWorkspace({ id: "w1" }), aWorkspace({ id: "w2" })];

  it("goes to the login without a session", () => {
    expect(decideStart(null, [], null)).toBe(paths.login);
    expect(decideStart(null, workspaces, "w1")).toBe(paths.login);
  });

  it("goes to the choice of a workspace when none is selected", () => {
    expect(decideStart(aUser(), workspaces, null)).toBe(paths.workspaces);
  });

  it("goes to the choice of a workspace when the selected one is gone", () => {
    expect(decideStart(aUser(), workspaces, "deleted")).toBe(paths.workspaces);
  });

  it("goes to the app with a session and a workspace", () => {
    expect(decideStart(aUser(), workspaces, "w2")).toBe(paths.app);
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

  it("guestOnly lets a guest in and sends a signed-in user to the start", async () => {
    expect(await redirectOf(guestOnly)).toBeNull();
  });

  it("guestOnly sends a signed-in user to the start", async () => {
    server.use(...signedIn(aUser()));

    expect(await redirectOf(guestOnly)).toBe(paths.start);
  });

  it("guestOnly still opens the screen when the backend is unreachable", async () => {
    server.use(http.get(apiUrl("/auth/user/current"), () => HttpResponse.error()));

    expect(await redirectOf(guestOnly)).toBeNull();
  });
});
