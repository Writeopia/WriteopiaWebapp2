import type { Document, Folder, FolderContents } from "~/core/models";

import { entryParentId, type MenuEntry } from "./model";

/**
 * Changes to the cached lists of the menu, applied before the backend answers. Every cached
 * list has the shape of a folder's contents; its scope says what it lists, because a new
 * document belongs in the list of its folder only, while a rename shows wherever the document
 * is listed. All functions return the same object when nothing changes.
 */
export type CacheScope =
  | { kind: "folder"; folderId: string }
  | { kind: "favorites" }
  /** Every document of the workspace: what the tag views filter. */
  | { kind: "workspace" };

export function patchDocument(
  contents: FolderContents,
  documentId: string,
  patch: Partial<Document>,
): FolderContents {
  if (!contents.documents.some((document) => document.id === documentId)) return contents;

  return {
    ...contents,
    documents: contents.documents.map((document) =>
      document.id === documentId ? { ...document, ...patch } : document,
    ),
  };
}

export function patchFolder(
  contents: FolderContents,
  folderId: string,
  patch: Partial<Folder>,
): FolderContents {
  if (!contents.folders.some((folder) => folder.id === folderId)) return contents;

  return {
    ...contents,
    folders: contents.folders.map((folder) =>
      folder.id === folderId ? { ...folder, ...patch } : folder,
    ),
  };
}

/** Takes entries out of a list, and out of the item count of the folders that held them. */
export function removeEntries(
  contents: FolderContents,
  entries: readonly MenuEntry[],
): FolderContents {
  const ids = new Set(entries.map((entry) => entry.id));
  const folders = contents.folders.filter((folder) => !ids.has(folder.id));
  const documents = contents.documents.filter((document) => !ids.has(document.id));
  const counted = countItems(folders, entries, -1);

  if (
    folders.length === contents.folders.length &&
    documents.length === contents.documents.length &&
    counted === folders
  ) {
    return contents;
  }
  return { ...contents, folders: counted, documents };
}

/** Adds documents to the list of the folder they are in, and to that folder's item count. */
export function insertDocuments(
  scope: CacheScope,
  contents: FolderContents,
  documents: readonly Document[],
): FolderContents {
  const known = new Set(contents.documents.map((document) => document.id));
  const added = documents.filter(
    (document) => !known.has(document.id) && belongsIn(scope, document.parentId),
  );
  const folders = countItems(
    contents.folders,
    documents.map((document) => ({ kind: "document", id: document.id, document })),
    1,
  );

  if (added.length === 0 && folders === contents.folders) return contents;
  return { ...contents, folders, documents: [...contents.documents, ...added] };
}

export function insertFolder(
  scope: CacheScope,
  contents: FolderContents,
  folder: Folder,
): FolderContents {
  const folders = countItems(contents.folders, [{ kind: "folder", id: folder.id, folder }], 1);
  const listed = scope.kind === "folder" && scope.folderId === folder.parentId;

  if (!listed || folders.some((known) => known.id === folder.id)) {
    return folders === contents.folders ? contents : { ...contents, folders };
  }
  return { ...contents, folders: [...folders, folder] };
}

/**
 * Moves entries to the folder [targetId]: out of the list of the folder they were in, into the
 * list of the target when it is cached, with the item counts of both following.
 */
export function moveEntries(
  scope: CacheScope,
  contents: FolderContents,
  entries: readonly MenuEntry[],
  targetId: string,
): FolderContents {
  const moving = entries.filter((entry) => entryParentId(entry) !== targetId);
  if (moving.length === 0) return contents;

  const moved = moving.map((entry) => reparent(entry, targetId));
  const ids = new Set(moving.map((entry) => entry.id));
  const here = scope.kind === "folder";
  const isTarget = here && scope.folderId === targetId;

  // The favorites and the tag views list documents wherever they are: only the parent changes.
  let folders = here ? contents.folders.filter((folder) => !ids.has(folder.id)) : contents.folders;
  let documents = here
    ? contents.documents.filter((document) => !ids.has(document.id))
    : contents.documents.map((document) =>
        ids.has(document.id) ? { ...document, parentId: targetId } : document,
      );

  if (isTarget) {
    folders = [
      ...folders,
      ...moved.flatMap((entry) => (entry.kind === "folder" ? [entry.folder] : [])),
    ];
    documents = [
      ...documents,
      ...moved.flatMap((entry) => (entry.kind === "document" ? [entry.document] : [])),
    ];
  }

  folders = countItems(countItems(folders, moving, -1), moved, 1);
  return { ...contents, folders, documents };
}

function reparent(entry: MenuEntry, parentId: string): MenuEntry {
  return entry.kind === "folder"
    ? { ...entry, folder: { ...entry.folder, parentId } }
    : { ...entry, document: { ...entry.document, parentId } };
}

function belongsIn(scope: CacheScope, parentId: string | null): boolean {
  if (scope.kind === "folder") return scope.folderId === parentId;
  return scope.kind === "workspace";
}

/** Adds [change] to the item count of each folder, once per entry it is the parent of. */
function countItems(folders: Folder[], entries: readonly MenuEntry[], change: number): Folder[] {
  const changes = new Map<string, number>();
  for (const entry of entries) {
    const parentId = entryParentId(entry);
    if (parentId !== null) changes.set(parentId, (changes.get(parentId) ?? 0) + change);
  }

  if (!folders.some((folder) => changes.has(folder.id))) return folders;
  return folders.map((folder) =>
    changes.has(folder.id)
      ? { ...folder, itemCount: Math.max(0, folder.itemCount + (changes.get(folder.id) ?? 0)) }
      : folder,
  );
}
