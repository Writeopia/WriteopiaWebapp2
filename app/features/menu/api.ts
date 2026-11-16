import { z } from "zod";

import { AI_TIMEOUT_MS, api, ApiError } from "~/core/api";
import {
  type Document,
  documentSchema,
  type Folder,
  type FolderContents,
  folderContentsSchema,
  folderSchema,
  type Icon,
} from "~/core/models";

/**
 * The documents and folders endpoints, as DocumentsApi.kt of the Compose app calls them. Every
 * one of them answers 403 to a user of the FREE tier.
 */

/** Steps each document of a folder comes with: enough to draw its card. */
export const PREVIEW_STEPS = 7;

function workspacePath(workspaceId: string): string {
  return `/docs/workspace/${encodeURIComponent(workspaceId)}`;
}

function folderPath(workspaceId: string, folderId: string): string {
  return `${workspacePath(workspaceId)}/folder/${encodeURIComponent(folderId)}`;
}

function documentPath(workspaceId: string, documentId: string): string {
  return `${workspacePath(workspaceId)}/document/${encodeURIComponent(documentId)}`;
}

/** The folders and the documents of a folder, each document with its first steps only. */
export function getFolderContents(
  workspaceId: string,
  folderId: string,
  signal?: AbortSignal,
): Promise<FolderContents> {
  return api.get(`${folderPath(workspaceId, folderId)}/contents/preview`, folderContentsSchema, {
    query: { steps: PREVIEW_STEPS },
    signal,
  });
}

/** The folders from the top one down to [folderId], included. Not for the root folder. */
export function getFolderPath(
  workspaceId: string,
  folderId: string,
  signal?: AbortSignal,
): Promise<Folder[]> {
  return api.get(`${folderPath(workspaceId, folderId)}/path`, z.array(folderSchema), { signal });
}

export function createFolder(
  workspaceId: string,
  parentId: string,
  folder: { title: string; icon: Icon | null },
): Promise<Folder> {
  return api.post(`${folderPath(workspaceId, parentId)}/create`, folder, folderSchema);
}

/** Changes what is given; a field left out keeps its value. An icon cannot be removed. */
export function updateFolder(
  workspaceId: string,
  folderId: string,
  changes: { title?: string; icon?: Icon; favorite?: boolean },
): Promise<Folder> {
  return api.put(folderPath(workspaceId, folderId), changes, folderSchema);
}

/** Deletes the folder and everything inside it. */
export function deleteFolder(workspaceId: string, folderId: string): Promise<void> {
  return api.send("DELETE", folderPath(workspaceId, folderId));
}

export function moveFolder(
  workspaceId: string,
  folderId: string,
  targetParentId: string,
): Promise<void> {
  return api.send("POST", `${folderPath(workspaceId, folderId)}/move`, { targetParentId });
}

export function getDocument(
  workspaceId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<Document> {
  return api.get(documentPath(workspaceId, documentId), documentSchema, { signal });
}

/**
 * Creates documents, or updates the ones that exist. The steps sent are added to the stored
 * ones, never taken from them, so a document sent with no content changes only its own fields
 * (title, icon, tags).
 */
export function saveDocuments(workspaceId: string, documents: Document[]): Promise<void> {
  return api.send("POST", "/docs/workspace/document", { documents, workspaceId });
}

export function deleteDocuments(workspaceId: string, documentIds: string[]): Promise<void> {
  return api.send("POST", `${workspacePath(workspaceId)}/document/delete`, { documentIds });
}

/** Copies documents next to the originals; answers the copies. */
export function cloneDocuments(workspaceId: string, documentIds: string[]): Promise<Document[]> {
  return api.post(
    `${workspacePath(workspaceId)}/document/clone`,
    { documentIds },
    z.array(documentSchema),
  );
}

export function moveDocument(
  workspaceId: string,
  documentId: string,
  targetParentId: string,
): Promise<void> {
  return api.send("POST", `${documentPath(workspaceId, documentId)}/move`, { targetParentId });
}

/** The favorite is of the signed-in user, not of the document. */
export function favoriteDocument(
  workspaceId: string,
  documentId: string,
  favorite: boolean,
): Promise<void> {
  return api.send("POST", `${documentPath(workspaceId, documentId)}/favorite`, { favorite });
}

/** The ids of the documents the signed-in user marked as favorites. */
export function getFavoriteDocumentIds(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  return api.get(`${workspacePath(workspaceId)}/user/favorites`, z.array(z.string()), { signal });
}

const summaryResponseSchema = z.object({ document: documentSchema.nullish() });

export type SummaryResult =
  | { kind: "created"; document: Document }
  /** The backend has no AI to ask. */
  | { kind: "aiUnavailable" }
  | { kind: "premiumRequired" };

/**
 * Writes a new document in [targetFolderId] that summarizes [documentIds]. The backend holds
 * the only copy of a document on the web, so its check for unsynced documents is skipped.
 */
export async function generateSummary(
  workspaceId: string,
  documentIds: string[],
  targetFolderId: string,
): Promise<SummaryResult> {
  try {
    const response = await api.post(
      `${workspacePath(workspaceId)}/document/generate-summary`,
      {
        documents: documentIds.map((documentId) => ({ documentId, lastSyncedAt: null })),
        targetFolderId,
        summaryTitle: null,
        model: null,
        ignoreSyncCheck: true,
      },
      summaryResponseSchema,
      { timeoutMs: AI_TIMEOUT_MS },
    );

    if (!response.document) throw new ApiError(201, "Response missing document");
    return { kind: "created", document: response.document };
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { kind: "aiUnavailable" };
    if (error instanceof ApiError && error.isForbidden) return { kind: "premiumRequired" };
    throw error;
  }
}
