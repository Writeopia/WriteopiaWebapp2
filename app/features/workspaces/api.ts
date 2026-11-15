import { z } from "zod";

import { api } from "~/core/api";
import { type Workspace, workspaceSchema } from "~/core/models";
import { readPreference, removePreference, writePreference } from "~/core/storage";

/** The workspaces the signed-in user belongs to. */
export function getWorkspaces(): Promise<Workspace[]> {
  return api.get("/workspace/user", z.array(workspaceSchema));
}

export function createWorkspace(name: string): Promise<void> {
  return api.send("POST", "/workspace/create", { name });
}

export const workspacesQuery = {
  queryKey: ["workspaces"] as const,
  queryFn: getWorkspaces,
};

const SELECTED_WORKSPACE_KEY = "writeopia.selectedWorkspace";

/** The workspace the user is working in, remembered by this browser. Only its id is kept. */
export function getSelectedWorkspaceId(): string | null {
  return readPreference(SELECTED_WORKSPACE_KEY);
}

export function selectWorkspace(workspaceId: string): void {
  writePreference(SELECTED_WORKSPACE_KEY, workspaceId);
}

export function clearSelectedWorkspace(): void {
  removePreference(SELECTED_WORKSPACE_KEY);
}
