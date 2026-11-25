import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aUser } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { loginWithGoogle } from "./api";

const route = apiUrl("/auth/login/google/web");

describe("loginWithGoogle", () => {
  it("signs in with the ID token", async () => {
    let received: unknown = null;
    server.use(
      http.post(route, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ writeopiaUser: aUser(), enabled: true });
      }),
    );

    const result = await loginWithGoogle({ idToken: "google-token" });

    expect(received).toEqual({ idToken: "google-token" });
    expect(result).toEqual({ kind: "signedIn", user: aUser() });
  });

  it("asks for a sign-up when the Google account has no account yet", async () => {
    const signUp = {
      idToken: "verified",
      email: "ana@example.com",
      name: "Ana",
      suggestedUsername: "ana",
    };
    server.use(http.post(route, () => HttpResponse.json(signUp, { status: 422 })));

    expect(await loginWithGoogle({ idToken: "google-token" })).toEqual({
      kind: "signUpRequired",
      signUp,
    });
  });

  it("tells a taken username apart, and the other refusals", async () => {
    server.use(http.post(route, () => new HttpResponse("Username taken", { status: 409 })));
    expect(
      await loginWithGoogle({ idToken: "t", username: "ana", acceptedLegalVersion: "v" }),
    ).toEqual({ kind: "usernameTaken" });

    server.use(http.post(route, () => new HttpResponse("Invalid", { status: 401 })));
    expect(await loginWithGoogle({ idToken: "t" })).toEqual({ kind: "invalidCredentials" });

    server.use(http.post(route, () => new HttpResponse("Deleting", { status: 403 })));
    expect(await loginWithGoogle({ idToken: "t" })).toEqual({ kind: "deletionPending" });
  });
});
