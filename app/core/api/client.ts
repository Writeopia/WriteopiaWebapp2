import type { z } from "zod";

import { ApiError, ApiParseError, NetworkError } from "./errors";

/**
 * The HTTP client of the app. The API lives on the page's own origin under /api, and the
 * session is two HttpOnly cookies the backend sets (Path=/api, SameSite=Strict): this code
 * never sees a token. When the access cookie expires a request answers 401; the client then
 * renews the session once, for all the requests waiting on it, and repeats the request.
 */

const API_PREFIX = "/api";
const DEFAULT_TIMEOUT_MS = 30_000;

/** For the calls that wait on the AI, like the Kotlin client does. */
export const AI_TIMEOUT_MS = 300_000;

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON, or as multipart when it is a FormData. */
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * False for the requests that are about the session itself (login, refresh, logout): a 401
   * from them is their answer, not an expired session.
   */
  renewSession?: boolean;
};

type SessionExpiredListener = () => void;

const sessionExpiredListeners = new Set<SessionExpiredListener>();

/**
 * Registers what to do when the session is gone and cannot be renewed (go to the login
 * screen). Returns the function that removes the listener.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** The address of an API path, on the origin of the page. */
export function apiUrl(path: string, query?: QueryParams): string {
  const url = new URL(API_PREFIX + path, window.location.origin);

  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(name, String(value));
  }

  return url.toString();
}

/**
 * Sends a request and returns the answer when it is a success. Throws ApiError for any other
 * status and NetworkError when the backend is not reached. For the answers that are read as a
 * stream; the others go through [api].
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const response = await send(path, options);

  if (response.status === 401 && options.renewSession !== false) {
    if (await renewSession()) {
      const retried = await send(path, options);
      if (retried.ok) return retried;
      if (retried.status === 401) notifySessionExpired();
      throw await toApiError(retried);
    }

    notifySessionExpired();
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

let renewal: Promise<boolean> | null = null;

/**
 * Renews the session cookies. Requests that find the session expired at the same time share
 * one renewal: the refresh token is rotated on use, so a second call would be refused.
 */
export function renewSession(): Promise<boolean> {
  renewal ??= send("/auth/refresh/web", { method: "POST" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      renewal = null;
    });

  return renewal;
}

function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;

  if (body instanceof FormData) {
    // The browser writes the multipart Content-Type itself, with the boundary.
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const timeout = AbortSignal.timeout(timeoutMs);

  try {
    return await fetch(apiUrl(path, query), {
      method,
      headers,
      body: payload,
      // The session cookies. Only ever sent to our own origin: apiUrl builds nothing else.
      credentials: "include",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (timeout.aborted)
      throw new NetworkError(`Request timed out: ${path}`, true, { cause: error });
    if (signal?.aborted) throw error;
    throw new NetworkError(`Could not reach the server: ${path}`, false, { cause: error });
  }
}

/**
 * The error of an answer. The backend explains failures in plain text ("Invalid
 * credentials") or in JSON with a `message` or an `error` field.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.text().catch(() => "");
  return new ApiError(response.status, errorMessage(body) || response.statusText, body);
}

function errorMessage(body: string): string {
  const text = body.trim();
  if (!text.startsWith("{")) return text;

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const message = json.message ?? json.error;
    return typeof message === "string" ? message : text;
  } catch {
    return text;
  }
}

async function parse<S extends z.ZodType>(
  path: string,
  response: Response,
  schema: S,
): Promise<z.output<S>> {
  try {
    return schema.parse(await response.json());
  } catch (error) {
    throw new ApiParseError(path, { cause: error });
  }
}

type BodyOptions = Omit<RequestOptions, "method" | "body">;

export const api = {
  /** GET, with the answer checked against [schema]. */
  async get<S extends z.ZodType>(path: string, schema: S, options?: BodyOptions) {
    return parse(path, await apiRequest(path, { ...options, method: "GET" }), schema);
  },

  /** POST, with the answer checked against [schema]. */
  async post<S extends z.ZodType>(path: string, body: unknown, schema: S, options?: BodyOptions) {
    return parse(path, await apiRequest(path, { ...options, method: "POST", body }), schema);
  },

  /** PUT, with the answer checked against [schema]. */
  async put<S extends z.ZodType>(path: string, body: unknown, schema: S, options?: BodyOptions) {
    return parse(path, await apiRequest(path, { ...options, method: "PUT", body }), schema);
  },

  /** DELETE, with the answer checked against [schema]. */
  async delete<S extends z.ZodType>(path: string, schema: S, options?: BodyOptions) {
    return parse(path, await apiRequest(path, { ...options, method: "DELETE" }), schema);
  },

  /** A request whose answer has nothing to read: only its success matters. */
  async send(
    method: "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: BodyOptions,
  ): Promise<void> {
    await apiRequest(path, { ...options, method, body });
  },
};
