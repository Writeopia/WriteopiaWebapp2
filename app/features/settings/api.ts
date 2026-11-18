import { z } from "zod";

import { api, ApiError } from "~/core/api";
import { type Role, workspaceUserSchema } from "~/core/models";

/**
 * The endpoints the settings use that no other screen does: the export of a workspace, the
 * deletion of the account, the header pictures with their ids, and the members of a workspace
 * (WorkspaceApi.kt, AuthApi.kt, WorkspaceRouting.kt).
 */

function workspacePath(workspaceId: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}`;
}

// ---------------------------------------------------------------------------------------------
// Account

/** Asks for a copy of the workspace; the backend emails a download link when it is ready. */
export function exportWorkspace(workspaceId: string): Promise<void> {
  return api.send("POST", `${workspacePath(workspaceId)}/export`);
}

/**
 * Starts the deletion of the account. It is not immediate: the backend marks the account and
 * removes its data afterwards, and the user can no longer sign in.
 */
export function deleteAccount(): Promise<void> {
  return api.send("DELETE", "/auth/account");
}

// ---------------------------------------------------------------------------------------------
// Header pictures

function headerImagesPath(workspaceId: string): string {
  return `/ai/header-images/${encodeURIComponent(workspaceId)}`;
}

const headerImageListSchema = z.object({
  images: z.array(z.object({ id: z.string(), url: z.string() })).default([]),
});

export type HeaderImage = { id: string; url: string };

/** The header pictures of the workspace, the newest first. */
export async function listHeaderImages(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<HeaderImage[]> {
  const response = await api.get(headerImagesPath(workspaceId), headerImageListSchema, { signal });
  return response.images;
}

/** Takes a picture out of the workspace. Documents that use it keep it. */
export function deleteHeaderImage(workspaceId: string, imageId: string): Promise<void> {
  return api.send("DELETE", `${headerImagesPath(workspaceId)}/${encodeURIComponent(imageId)}`);
}

// ---------------------------------------------------------------------------------------------
// Members

export const MEMBERS_PAGE_SIZE = 20;
export const USER_SEARCH_PAGE_SIZE = 5;
/** The backend refuses a shorter search. */
export const USER_SEARCH_MIN_LENGTH = 2;

const membersPageSchema = z.object({
  users: z.array(workspaceUserSchema).default([]),
  page: z.number().default(1),
  totalCount: z.number().default(0),
  hasNextPage: z.boolean().default(false),
});

export type MembersPage = z.output<typeof membersPageSchema>;

export function getMembers(
  workspaceId: string,
  page: number,
  signal?: AbortSignal,
): Promise<MembersPage> {
  return api.get(`${workspacePath(workspaceId)}/users/paginated`, membersPageSchema, {
    query: { page, pageSize: MEMBERS_PAGE_SIZE },
    signal,
  });
}

const searchUserSchema = z.object({ id: z.string(), name: z.string(), username: z.string() });

export type FoundUser = z.output<typeof searchUserSchema>;

/** Users whose username matches [query] and who are not in the workspace yet. Admins only. */
export async function searchUsers(
  workspaceId: string,
  query: string,
  signal?: AbortSignal,
): Promise<FoundUser[]> {
  const response = await api.get(
    `${workspacePath(workspaceId)}/users/search`,
    z.object({ users: z.array(searchUserSchema).default([]) }),
    { query: { username: query, page: 1, pageSize: USER_SEARCH_PAGE_SIZE }, signal },
  );
  return response.users;
}

export type AddUserResult = "added" | "alreadyInWorkspace" | "notFound";

export async function addUserToWorkspace(
  workspaceId: string,
  username: string,
  role: Role,
): Promise<AddUserResult> {
  try {
    await api.send("POST", "/workspace/user", { username, workspaceId, role });
    return "added";
  } catch (error) {
    if (error instanceof ApiError && error.isConflict) return "alreadyInWorkspace";
    if (error instanceof ApiError && error.isNotFound) return "notFound";
    throw error;
  }
}

export type RoleChangeResult = "changed" | "lastAdmin";

export async function changeRole(
  workspaceId: string,
  userId: string,
  newRole: Role,
): Promise<RoleChangeResult> {
  try {
    await api.send("PUT", "/workspace/role", { workspaceId, userId, newRole });
    return "changed";
  } catch (error) {
    // The backend keeps at least one admin in every workspace.
    if (error instanceof ApiError && error.isConflict) return "lastAdmin";
    throw error;
  }
}
