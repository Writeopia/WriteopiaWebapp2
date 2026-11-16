import type { Document, Folder, FolderContents, Icon } from "~/core/models";

/** One thing the document menu lists: a folder or a document. */
export type MenuEntry =
  | { kind: "folder"; id: string; folder: Folder }
  | { kind: "document"; id: string; document: Document };

/** The order the user can sort the menu by (OrderBy of the Compose app). */
export const ORDER_BY = ["last_updated_at", "created_at", "title"] as const;
export type OrderBy = (typeof ORDER_BY)[number];

/** How the cards are laid out (NotesArrangement of the Compose app). */
export const ARRANGEMENTS = ["grid", "staggered_grid", "list"] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];

export const EMPTY_CONTENTS: FolderContents = { folders: [], documents: [], tags: [] };

export function folderEntry(folder: Folder): MenuEntry {
  return { kind: "folder", id: folder.id, folder };
}

export function documentEntry(document: Document): MenuEntry {
  return { kind: "document", id: document.id, document };
}

export function entriesOf(contents: FolderContents): MenuEntry[] {
  return [...contents.folders.map(folderEntry), ...contents.documents.map(documentEntry)];
}

export function entryTitle(entry: MenuEntry): string {
  return entry.kind === "folder" ? entry.folder.title : entry.document.title;
}

export function entryIcon(entry: MenuEntry): Icon | null {
  return entry.kind === "folder" ? entry.folder.icon : entry.document.icon;
}

export function entryIsFavorite(entry: MenuEntry): boolean {
  return entry.kind === "folder" ? entry.folder.favorite : entry.document.isFavorite;
}

/** The folder the entry is in. */
export function entryParentId(entry: MenuEntry): string | null {
  return entry.kind === "folder" ? entry.folder.parentId : entry.document.parentId;
}
