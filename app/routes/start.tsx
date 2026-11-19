import { redirect } from "react-router";

import { findStart, hasSessionHint, loadSessionUser, paths } from "~/features/auth/session";

/** The entry of the app: it only decides where to go. */
export async function clientLoader() {
  // A browser that was not signed in gets the login without waiting for the backend.
  if (!hasSessionHint()) return redirect(paths.login);

  return redirect(await findStart(await loadSessionUser()));
}

export default function Start() {
  return null;
}
