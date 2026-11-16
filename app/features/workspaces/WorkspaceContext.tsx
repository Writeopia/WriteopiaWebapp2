import { createContext, type ReactNode, useContext } from "react";

import type { User, Workspace } from "~/core/models";

/** Who is signed in and the workspace being worked in: what every screen of the app needs. */
export type WorkspaceSession = { user: User; workspace: Workspace };

const WorkspaceContext = createContext<WorkspaceSession | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceSession;
  children: ReactNode;
}) {
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace(): WorkspaceSession {
  const session = useContext(WorkspaceContext);
  if (!session) throw new Error("useWorkspace needs a WorkspaceProvider above it");
  return session;
}
