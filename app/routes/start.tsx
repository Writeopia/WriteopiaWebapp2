import { redirect } from "react-router";

import { queryClient } from "~/core/query/queryClient";
import { decideStart, loadSessionUser } from "~/features/auth/session";
import { getSelectedWorkspaceId, workspacesQuery } from "~/features/workspaces/api";

/** The entry of the app: it only decides where to go. */
export async function clientLoader() {
  const user = await loadSessionUser();
  const workspaces = user ? await queryClient.fetchQuery(workspacesQuery) : [];

  return redirect(decideStart(user, workspaces, getSelectedWorkspaceId()));
}

export default function Start() {
  return null;
}
