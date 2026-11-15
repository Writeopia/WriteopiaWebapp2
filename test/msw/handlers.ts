import { http, HttpResponse } from "msw";

/** The page origin in tests; the app calls the API on its own origin. */
export const ORIGIN = "http://localhost:3000";

export function apiUrl(path: string): string {
  return `${ORIGIN}/api${path}`;
}

/**
 * The backend as tests see it by default: nobody is signed in, and the session cannot be
 * renewed. A test that needs something else overrides a handler with server.use(...).
 */
export const handlers = [
  http.get(apiUrl("/auth/session/status"), () => HttpResponse.json({ authenticated: false })),
  http.get(apiUrl("/auth/user/current"), () => new HttpResponse("Unauthorized", { status: 401 })),
  http.post(
    apiUrl("/auth/refresh/web"),
    () => new HttpResponse("No refresh token", { status: 401 }),
  ),
];

/** Handlers for a signed-in session, to pass to server.use(...). */
export function signedIn(user: object) {
  return [
    http.get(apiUrl("/auth/session/status"), () =>
      HttpResponse.json({ authenticated: true, userId: "user-1" }),
    ),
    http.get(apiUrl("/auth/user/current"), () => HttpResponse.json(user)),
    http.post(apiUrl("/auth/refresh/web"), () => new HttpResponse("Token refreshed")),
  ];
}
