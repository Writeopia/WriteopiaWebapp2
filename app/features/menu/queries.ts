import {
  type QueryClient,
  type QueryKey,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { ApiError } from "~/core/api";
import { type StringKey, t } from "~/core/i18n";
import { generateId } from "~/core/id";
import {
  type Document,
  type Folder,
  type FolderContents,
  type Icon,
  ROOT_FOLDER_ID,
  StoryTypes,
} from "~/core/models";
import { RANK_FIRST } from "~/core/rank/rank";
import { showToast } from "~/core/ui";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import * as menuApi from "./api";
import {
  type CacheScope,
  insertDocuments,
  insertFolder,
  moveEntries,
  patchDocument,
  patchFolder,
  removeEntries,
} from "./cache";
import { entryParentId, entryTitle, type MenuEntry } from "./model";

/**
 * What the menu reads from the backend and how it changes it. The backend is the source of
 * truth: lists are always refetched when a screen opens, every change shows at once and is
 * taken back when the backend refuses it, and the lists are asked again after each change.
 */

export const menuKeys = {
  all: (workspaceId: string) => ["menu", workspaceId] as const,
  /** Everything cached in the shape of a folder's contents. */
  contents: (workspaceId: string) => ["menu", workspaceId, "contents"] as const,
  folder: (workspaceId: string, folderId: string) =>
    ["menu", workspaceId, "contents", "folder", folderId] as const,
  favorites: (workspaceId: string) => ["menu", workspaceId, "contents", "favorites"] as const,
  workspace: (workspaceId: string) => ["menu", workspaceId, "contents", "workspace"] as const,
  path: (workspaceId: string, folderId: string) => ["menu", workspaceId, "path", folderId] as const,
};

function scopeOf(key: QueryKey): CacheScope | null {
  if (key[3] === "folder" && typeof key[4] === "string") {
    return { kind: "folder", folderId: key[4] };
  }
  if (key[3] === "favorites") return { kind: "favorites" };
  if (key[3] === "workspace") return { kind: "workspace" };
  return null;
}

export function folderContentsQuery(workspaceId: string, folderId: string) {
  return queryOptions({
    queryKey: menuKeys.folder(workspaceId, folderId),
    queryFn: ({ signal }) => menuApi.getFolderContents(workspaceId, folderId, signal),
    staleTime: 0,
  });
}

/** The folders from the top down to this one, for the breadcrumb. The root has no path. */
export function folderPathQuery(workspaceId: string, folderId: string) {
  return queryOptions({
    queryKey: menuKeys.path(workspaceId, folderId),
    queryFn: ({ signal }) => menuApi.getFolderPath(workspaceId, folderId, signal),
    enabled: folderId !== ROOT_FOLDER_ID,
    staleTime: 0,
  });
}

/**
 * The favorite documents of the user. The backend lists their ids only, so each document is
 * asked for; one that is gone since is left out.
 */
export function favoritesQuery(workspaceId: string) {
  return queryOptions({
    queryKey: menuKeys.favorites(workspaceId),
    queryFn: async ({ signal }): Promise<FolderContents> => {
      const ids = await menuApi.getFavoriteDocumentIds(workspaceId, signal);
      const documents = await Promise.all(
        ids.map((id) =>
          menuApi.getDocument(workspaceId, id, signal).catch((error: unknown) => {
            if (error instanceof ApiError && error.isNotFound) return null;
            throw error;
          }),
        ),
      );

      return {
        folders: [],
        documents: documents
          .filter((document): document is Document => document !== null && !document.deleted)
          .map((document) => ({
            ...document,
            isFavorite: true,
            content: document.content.slice(0, menuApi.PREVIEW_STEPS),
          })),
        tags: [],
      };
    },
    staleTime: 0,
  });
}

/** Folders asked at the same time, and in total, when the whole workspace is read. */
const WALK_CONCURRENCY = 6;
const WALK_MAX_FOLDERS = 500;

/**
 * Every document of the workspace and its tag catalogue, for the tag views. The backend has
 * no list of the documents of a tag, so the folders are read one level at a time.
 */
export function workspaceDocumentsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: menuKeys.workspace(workspaceId),
    queryFn: async ({ signal }): Promise<FolderContents> => {
      const documents: Document[] = [];
      let tags: FolderContents["tags"] = [];
      const seen = new Set([ROOT_FOLDER_ID]);
      let pending = [ROOT_FOLDER_ID];

      while (pending.length > 0) {
        const batch = pending.slice(0, WALK_CONCURRENCY);
        pending = pending.slice(WALK_CONCURRENCY);

        const loaded = await Promise.all(
          batch.map((folderId) => menuApi.getFolderContents(workspaceId, folderId, signal)),
        );

        for (const contents of loaded) {
          documents.push(...contents.documents);
          if (contents.tags.length > 0) tags = contents.tags;

          for (const folder of contents.folders) {
            if (seen.size >= WALK_MAX_FOLDERS || seen.has(folder.id)) continue;
            seen.add(folder.id);
            pending.push(folder.id);
          }
        }
      }

      return { folders: [], documents, tags };
    },
    staleTime: 0,
  });
}

type Snapshot = [QueryKey, FolderContents | undefined][];

/** Applies a change to every cached list of the workspace; answers what they were before. */
function updateCachedContents(
  queryClient: QueryClient,
  workspaceId: string,
  update: (scope: CacheScope, contents: FolderContents) => FolderContents,
): Snapshot {
  const snapshot = queryClient.getQueriesData<FolderContents>({
    queryKey: menuKeys.contents(workspaceId),
  });

  for (const [key, contents] of snapshot) {
    const scope = scopeOf(key);
    if (contents && scope) queryClient.setQueryData(key, update(scope, contents));
  }
  return snapshot;
}

type OptimisticOptions<Variables, Result> = {
  request: (workspaceId: string, variables: Variables) => Promise<Result>;
  /** The change, as each cached list should show it before the backend answers. */
  apply?: (scope: CacheScope, contents: FolderContents, variables: Variables) => FolderContents;
  /** The change that needs the answer of the backend: a new folder, the copies. */
  applyResult?: (scope: CacheScope, contents: FolderContents, result: Result) => FolderContents;
  /** What to tell the user when the backend refuses. */
  failure: StringKey;
};

function useOptimisticMutation<Variables, Result = void>(
  options: OptimisticOptions<Variables, Result>,
) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspace().workspace.id;
  const { request, apply, applyResult, failure } = options;

  return useMutation({
    mutationFn: (variables: Variables) => request(workspaceId, variables),
    onMutate: async (variables): Promise<Snapshot> => {
      if (!apply) return [];

      // An answer on its way would write the old lists over the change.
      await queryClient.cancelQueries({ queryKey: menuKeys.contents(workspaceId) });
      return updateCachedContents(queryClient, workspaceId, (scope, contents) =>
        apply(scope, contents, variables),
      );
    },
    onSuccess: (result) => {
      if (!applyResult) return;
      updateCachedContents(queryClient, workspaceId, (scope, contents) =>
        applyResult(scope, contents, result),
      );
    },
    onError: (error, _variables, snapshot) => {
      for (const [key, contents] of snapshot ?? []) queryClient.setQueryData(key, contents);

      const forbidden = error instanceof ApiError && error.isForbidden;
      showToast(t(forbidden ? "premiumFeatureMessage" : failure), { kind: "error" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: menuKeys.all(workspaceId) }),
  });
}

/** A document with nothing in it but its title line, as the editor expects to find it. */
export function newDocument(workspaceId: string, parentId: string): Document {
  const now = Date.now();

  return {
    id: generateId(),
    title: "",
    workspaceId,
    content: [
      {
        id: generateId(),
        type: StoryTypes.TITLE,
        parentId: null,
        url: null,
        path: null,
        text: "",
        checked: false,
        steps: [],
        tags: [],
        spans: [],
        decoration: { backgroundColor: null },
        position: RANK_FIRST,
        documentLink: null,
        lastUpdatedAt: now,
      },
    ],
    createdAt: now,
    lastUpdatedAt: now,
    lastSyncedAt: null,
    isFavorite: false,
    parentId,
    isLocked: false,
    icon: null,
    deleted: false,
    published: false,
    commentConversations: [],
    tagIds: [],
  };
}

export type FolderChanges = { title?: string; icon?: Icon; favorite?: boolean };

/** Where entries go: a folder, with the name to tell the user. */
export type MoveTarget = { id: string; title: string };

const UNDO_TOAST_MS = 8000;

/** Everything the menu can change. */
export function useMenuMutations() {
  const createDocument = useOptimisticMutation({
    request: async (workspaceId, document: Document) => {
      await menuApi.saveDocuments(workspaceId, [document]);
      return document;
    },
    apply: (scope, contents, document) => insertDocuments(scope, contents, [document]),
    failure: "createDocumentFailed",
  });

  const createFolder = useOptimisticMutation({
    request: (workspaceId, folder: { parentId: string; title: string; icon: Icon | null }) =>
      menuApi.createFolder(workspaceId, folder.parentId, {
        title: folder.title,
        icon: folder.icon,
      }),
    applyResult: (scope, contents, folder: Folder) => insertFolder(scope, contents, folder),
    failure: "createFolderFailed",
  });

  const updateFolder = useOptimisticMutation({
    request: (workspaceId, { folder, changes }: { folder: Folder; changes: FolderChanges }) =>
      menuApi.updateFolder(workspaceId, folder.id, changes),
    apply: (_scope, contents, { folder, changes }) => patchFolder(contents, folder.id, changes),
    failure: "saveFailed",
  });

  const changeDocumentIcon = useOptimisticMutation({
    // Sent without its steps: the card holds only the first ones, and none is needed to
    // change the icon.
    request: (workspaceId, { document, icon }: { document: Document; icon: Icon | null }) =>
      menuApi.saveDocuments(workspaceId, [
        { ...document, content: [], icon, lastUpdatedAt: Date.now() },
      ]),
    apply: (_scope, contents, { document, icon }) => patchDocument(contents, document.id, { icon }),
    failure: "saveFailed",
  });

  const setFavorite = useOptimisticMutation({
    request: async (
      workspaceId,
      { entries, favorite }: { entries: MenuEntry[]; favorite: boolean },
    ) => {
      await Promise.all(
        entries.map((entry) =>
          entry.kind === "folder"
            ? menuApi.updateFolder(workspaceId, entry.id, { favorite })
            : menuApi.favoriteDocument(workspaceId, entry.id, favorite),
        ),
      );
    },
    apply: (scope, contents, { entries, favorite }) => {
      let next = contents;
      for (const entry of entries) {
        next =
          entry.kind === "folder"
            ? patchFolder(next, entry.id, { favorite })
            : patchDocument(next, entry.id, { isFavorite: favorite });
      }
      // A document that stops being a favorite leaves the favorites.
      return scope.kind === "favorites" && !favorite ? removeEntries(next, entries) : next;
    },
    failure: "saveFailed",
  });

  const duplicate = useOptimisticMutation({
    request: (workspaceId, documentIds: string[]) =>
      menuApi.cloneDocuments(workspaceId, documentIds),
    applyResult: (scope, contents, copies: Document[]) => insertDocuments(scope, contents, copies),
    failure: "duplicateFailed",
  });

  const remove = useOptimisticMutation({
    request: async (workspaceId, entries: MenuEntry[]) => {
      const documentIds = entries.filter((entry) => entry.kind === "document").map((e) => e.id);
      const folderIds = entries.filter((entry) => entry.kind === "folder").map((e) => e.id);

      await Promise.all([
        ...folderIds.map((folderId) => menuApi.deleteFolder(workspaceId, folderId)),
        documentIds.length > 0 ? menuApi.deleteDocuments(workspaceId, documentIds) : null,
      ]);
    },
    apply: (_scope, contents, entries) => removeEntries(contents, entries),
    failure: "deleteFailed",
  });

  const moveMutation = useOptimisticMutation({
    request: async (
      workspaceId,
      { entries, targetId }: { entries: MenuEntry[]; targetId: string },
    ) => {
      await Promise.all(
        entries
          .filter((entry) => entryParentId(entry) !== targetId && entry.id !== targetId)
          .map((entry) =>
            entry.kind === "folder"
              ? menuApi.moveFolder(workspaceId, entry.id, targetId)
              : menuApi.moveDocument(workspaceId, entry.id, targetId),
          ),
      );
    },
    apply: (scope, contents, { entries, targetId }) =>
      moveEntries(
        scope,
        contents,
        entries.filter((entry) => entry.id !== targetId),
        targetId,
      ),
    failure: "moveFailed",
  });

  /**
   * Moves entries to a folder and offers to take the move back. [onMoved] is told the folder
   * the entries are in once the backend moved them, and again after an undo.
   */
  const move = (entries: MenuEntry[], target: MoveTarget, onMoved?: (folderId: string) => void) => {
    const moving = entries.filter(
      (entry) => entry.id !== target.id && entryParentId(entry) !== target.id,
    );
    if (moving.length === 0) return;

    moveMutation.mutate(
      { entries: moving, targetId: target.id },
      {
        onSuccess: () => {
          onMoved?.(target.id);
          const message =
            moving.length === 1
              ? t("movedItemToFolder", { item: displayTitle(moving[0]!), folder: target.title })
              : t("movedItemsToFolder", { count: moving.length, folder: target.title });

          showToast(message, {
            duration: UNDO_TOAST_MS,
            action: { label: t("undo"), onClick: () => undoMove(moving, target.id, onMoved) },
          });
        },
      },
    );
  };

  /** Sends each entry back to the folder it came from. */
  const undoMove = (moved: MenuEntry[], fromId: string, onMoved?: (folderId: string) => void) => {
    const byOrigin = new Map<string, MenuEntry[]>();
    for (const entry of moved) {
      const origin = entryParentId(entry) ?? ROOT_FOLDER_ID;
      const now: MenuEntry =
        entry.kind === "folder"
          ? { ...entry, folder: { ...entry.folder, parentId: fromId } }
          : { ...entry, document: { ...entry.document, parentId: fromId } };
      byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), now]);
    }

    for (const [origin, entries] of byOrigin) {
      moveMutation.mutate({ entries, targetId: origin }, { onSuccess: () => onMoved?.(origin) });
    }
  };

  return {
    createDocument,
    createFolder,
    updateFolder,
    changeDocumentIcon,
    setFavorite,
    duplicate,
    remove,
    move,
    isMoving: moveMutation.isPending,
  };
}

/** The title of an entry as the user reads it: a document without one is "Untitled". */
export function displayTitle(entry: MenuEntry): string {
  return entryTitle(entry).trim() === "" ? t("untitled") : entryTitle(entry);
}

/** Asks the AI for a document that summarizes others, and says how it went. */
export function useSummarize(onCreated: (document: Document) => void) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspace().workspace.id;

  return useMutation({
    mutationFn: ({ documentIds, folderId }: { documentIds: string[]; folderId: string }) =>
      menuApi.generateSummary(workspaceId, documentIds, folderId),
    onSuccess: (result) => {
      switch (result.kind) {
        case "created":
          showToast(t("summaryCreated"), {
            kind: "success",
            duration: UNDO_TOAST_MS,
            action: { label: t("open"), onClick: () => onCreated(result.document) },
          });
          break;
        case "aiUnavailable":
          showToast(t("aiUnavailable"), { kind: "error" });
          break;
        case "premiumRequired":
          showToast(t("premiumFeatureMessage"), { kind: "error" });
          break;
      }
    },
    onError: () => showToast(t("summaryFailed"), { kind: "error" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: menuKeys.all(workspaceId) }),
  });
}
