import { http, HttpResponse } from "msw";

/** The page origin in tests; the app calls the API on its own origin. */
export const ORIGIN = "http://localhost:3000";

export function apiUrl(path: string): string {
  return `${ORIGIN}/api${path}`;
}

/**
 * The backend as tests see it by default: nobody is signed in. A test that needs something
 * else overrides a handler with server.use(...).
 */
export const handlers = [
  http.get(apiUrl("/auth/session/status"), () => HttpResponse.json({ authenticated: false })),
];
