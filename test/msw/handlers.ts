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
  http.get(apiUrl("/auth/subscription"), () => new HttpResponse("Unauthorized", { status: 401 })),
  http.post(
    apiUrl("/auth/refresh/web"),
    () => new HttpResponse("No refresh token", { status: 401 }),
  ),
];

/** What GET /auth/subscription answers; premium unless a test says otherwise. */
export function aSubscription(premium = true) {
  return {
    premium,
    tier: premium ? "PREMIUM" : "FREE",
    monthlyPriceCents: 499,
    currency: "USD",
  };
}

/** Answers the subscription of the signed-in user, to pass to server.use(...). */
export function subscribed(premium: boolean) {
  return http.get(apiUrl("/auth/subscription"), () => HttpResponse.json(aSubscription(premium)));
}

/**
 * Handlers for a signed-in session, to pass to server.use(...). The user has a subscription
 * unless [premium] is false.
 */
export function signedIn(user: object, { premium = true }: { premium?: boolean } = {}) {
  return [
    subscribed(premium),
    http.get(apiUrl("/auth/session/status"), () =>
      HttpResponse.json({ authenticated: true, userId: "user-1" }),
    ),
    http.get(apiUrl("/auth/user/current"), () => HttpResponse.json(user)),
    http.post(apiUrl("/auth/refresh/web"), () => new HttpResponse("Token refreshed")),
  ];
}
