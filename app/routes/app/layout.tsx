import { Outlet } from "react-router";

import { requireWorkspace } from "~/features/auth/session";
import { MenuActionsProvider } from "~/features/menu/actions";
import { MenuDialogs } from "~/features/menu/components/MenuDialogs";
import { AppShell } from "~/features/shell/components/AppShell";
import { WorkspaceProvider } from "~/features/workspaces/WorkspaceContext";

import type { Route } from "./+types/layout";

/** Everything under /app needs a session and a workspace to work in. */
export const clientLoader = requireWorkspace;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return (
    // A key: nothing of one workspace stays on screen when the user changes to another.
    <WorkspaceProvider key={loaderData.workspace.id} value={loaderData}>
      <MenuActionsProvider>
        <AppShell>
          <Outlet />
        </AppShell>
        <MenuDialogs />
      </MenuActionsProvider>
    </WorkspaceProvider>
  );
}
