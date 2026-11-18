import { redirect } from "react-router";

import type { User, Workspace } from "~/core/models";
import { queryClient } from "~/core/query/queryClient";
import { readPreference, removePreference, writePreference } from "~/core/storage";
import {
  clearSelectedWorkspace,
  getSelectedWorkspaceId,
  workspacesQuery,
} from "~/features/workspaces/api";

import { findSessionUser, getSessionUser } from "./api";

/**
 * Who is signed in, and the guards the routes put in their loaders. The session itself is in
 * HttpOnly cookies; what is kept here is only the user the backend answered with.
 */

export const sessionUserKey = ["session", "user"] as const;

const USER_STALE_MS = 5 * 60_000;

/**
 * The page cannot read the session cookies, so the browser keeps a note that it was signed in
 * the last time. Without the note the login opens right away, without waiting for the backend.
 */
const SESSION_HINT_KEY = "writeopia.signedIn";

/** Whether this browser was signed in the last time it was here. Not a proof of a session. */
export function hasSessionHint(): boolean {
  return readPreference(SESSION_HINT_KEY) !== null;
}

/** The signed-in user, or null. Throws when the backend cannot be reached. */
export async function loadSessionUser(): Promise<User | null> {
  const user = await queryClient.fetchQuery({
    queryKey: sessionUserKey,
    queryFn: getSessionUser,
    staleTime: USER_STALE_MS,
  });

  if (user) writePreference(SESSION_HINT_KEY, "1");
  return user;
}

/**
 * Asks who is signed in from a screen that opened without asking: a browser with no hint may
 * still have a session (storage was cleared, or it signed in before the hint existed).
 */
export async function findSessionQuietly(): Promise<User | null> {
  const user = await findSessionUser();
  if (user) setSessionUser(user);
  return user;
}

/** Records the user of a session that just started. */
export function setSessionUser(user: User): void {
  queryClient.setQueryData(sessionUserKey, user);
  writePreference(SESSION_HINT_KEY, "1");
}

/** Forgets everything about the session that ended: the user, the cache, the workspace. */
export function clearSession(): void {
  queryClient.clear();
  clearSelectedWorkspace();
  removePreference(SESSION_HINT_KEY);
}

export const paths = {
  start: "/",
  login: "/auth/login",
  register: "/auth/register",
  registerCode: "/auth/register/code",
  registerDetails: "/auth/register/details",
  confirmEmail: "/auth/confirm-email",
  forgotPassword: "/auth/forgot-password",
  forgotPasswordCode: "/auth/forgot-password/code",
  forgotPasswordNew: "/auth/forgot-password/new",
  resetPassword: "/auth/reset-password",
  workspaces: "/workspaces",
  accountDeletionStarted: "/account-deletion-started",
  app: "/app",
} as const;

/**
 * Where the app goes when it opens: the login without a session, the choice of a workspace
 * when none is selected (or the selected one is gone), the app otherwise.
 */
export function decideStart(
  user: User | null,
  workspaces: Workspace[],
  selectedWorkspaceId: string | null,
): string {
  if (!user) return paths.login;
  if (!workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
    return paths.workspaces;
  }
  return paths.app;
}

/** For the routes that need a session: answers the user, or sends to the login. */
export async function requireSession(): Promise<User> {
  const user = await loadSessionUser();
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- how React Router redirects
  if (!user) throw redirect(paths.login);
  return user;
}

/** For the routes of the app: answers the user and the workspace being worked in. */
export async function requireWorkspace(): Promise<{ user: User; workspace: Workspace }> {
  const user = await requireSession();
  const workspaces = await queryClient.fetchQuery(workspacesQuery);
  const selectedId = getSelectedWorkspaceId();
  const workspace = workspaces.find((candidate) => candidate.id === selectedId);

  // eslint-disable-next-line @typescript-eslint/only-throw-error -- how React Router redirects
  if (!workspace) throw redirect(paths.workspaces);
  return { user, workspace };
}

/** For the sign-in and sign-up routes: someone already signed in goes to the app. */
export async function guestOnly(): Promise<null> {
  // The screen opens at once for a browser that was not signed in; its layout asks afterwards.
  if (!hasSessionHint()) return null;

  // When the backend cannot be reached the screen still opens; its own request will say so.
  const user = await loadSessionUser().catch(() => null);

  // eslint-disable-next-line @typescript-eslint/only-throw-error -- how React Router redirects
  if (user) throw redirect(paths.start);
  return null;
}
