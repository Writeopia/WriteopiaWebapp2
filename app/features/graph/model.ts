import { queryOptions } from "@tanstack/react-query";

import { type Document, type DocumentTag, type Folder, ROOT_FOLDER_ID } from "~/core/models";
import * as menuApi from "~/features/menu/api";
import { menuKeys } from "~/features/menu/queries";

import type { GraphLink, GraphNode } from "./layout";

/** Everything the graph draws: the folders, the documents and the tags of the workspace. */
export type WorkspaceGraphData = {
  folders: Folder[];
  documents: Document[];
  tags: DocumentTag[];
};

/** Folders asked at the same time, and in total, when the whole workspace is read. */
const WALK_CONCURRENCY = 6;
const WALK_MAX_FOLDERS = 500;

/** The folder tree read one level at a time, as the backend has no list of a workspace. */
export function workspaceGraphQuery(workspaceId: string) {
  return queryOptions({
    queryKey: [...menuKeys.all(workspaceId), "graph"] as const,
    queryFn: async ({ signal }): Promise<WorkspaceGraphData> => {
      const folders: Folder[] = [];
      const documents: Document[] = [];
      let tags: DocumentTag[] = [];
      const seen = new Set([ROOT_FOLDER_ID]);
      let pending = [ROOT_FOLDER_ID];

      while (pending.length > 0) {
        const batch = pending.slice(0, WALK_CONCURRENCY);
        pending = pending.slice(WALK_CONCURRENCY);
        const loaded = await Promise.all(
          batch.map((folderId) => menuApi.getFolderContents(workspaceId, folderId, signal)),
        );

        for (const contents of loaded) {
          documents.push(...contents.documents.filter((document) => !document.deleted));
          if (contents.tags.length > 0) tags = contents.tags.filter((tag) => !tag.deleted);
          for (const folder of contents.folders) {
            if (seen.size >= WALK_MAX_FOLDERS || seen.has(folder.id)) continue;
            seen.add(folder.id);
            folders.push(folder);
            pending.push(folder.id);
          }
        }
      }

      return { folders, documents, tags };
    },
  });
}

export type GraphGrouping = "folders" | "tags";

type Item = { id: string; title: string; isFolder: boolean; isTag: boolean };

/**
 * The nodes and links of a grouping (GraphRepository.kt). By folders: each folder links to
 * what it holds. By tags: each tag links to the documents that carry it, and the documents
 * without a tag stand alone. The root is never a node: what it holds are the top pieces.
 */
export function buildGraph(
  data: WorkspaceGraphData,
  grouping: GraphGrouping,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const adjacency = new Map<string, Item[]>();
  const add = (parentId: string, item: Item) => {
    const list = adjacency.get(parentId) ?? [];
    list.push(item);
    adjacency.set(parentId, list);
  };
  const documentItem = (document: Document): Item => ({
    id: document.id,
    title: document.title,
    isFolder: false,
    isTag: false,
  });

  if (grouping === "folders") {
    for (const folder of data.folders) {
      add(folder.parentId, { id: folder.id, title: folder.title, isFolder: true, isTag: false });
    }
    for (const document of data.documents)
      add(document.parentId ?? ROOT_FOLDER_ID, documentItem(document));
  } else {
    const tagIds = new Set(data.tags.map((tag) => tag.id));
    for (const tag of data.tags) {
      add(ROOT_FOLDER_ID, { id: tag.id, title: tag.name, isFolder: true, isTag: true });
    }
    for (const document of data.documents) {
      const carried = document.tagIds.filter((id) => tagIds.has(id));
      if (carried.length === 0) add(ROOT_FOLDER_ID, documentItem(document));
      for (const tagId of carried) add(tagId, documentItem(document));
    }
  }

  // An item listed under several hubs (a document with several tags) is one node.
  const nodes = new Map<string, GraphNode>();
  for (const items of adjacency.values()) {
    for (const item of items) {
      if (nodes.has(item.id)) continue;
      nodes.set(item.id, {
        id: item.id,
        label: item.title,
        isFolder: item.isFolder,
        isTag: item.isTag,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isDragged: false,
      });
    }
  }

  const links: GraphLink[] = [];
  for (const [parentId, items] of adjacency) {
    const source = nodes.get(parentId);
    if (!source) continue;
    for (const item of items) links.push({ source, target: nodes.get(item.id)! });
  }

  return { nodes: [...nodes.values()], links };
}

/** What the card says about the node the user clicked (GraphItemDetails.kt). */
export type GraphItemDetails =
  | {
      kind: "document";
      id: string;
      title: string;
      lastUpdatedAt: number;
      folderName: string | null;
      tagNames: string[];
    }
  | { kind: "folder"; id: string; title: string; folderCount: number; documentCount: number }
  | { kind: "tag"; id: string; title: string; description: string; documentIds: string[] };

export function itemDetails(data: WorkspaceGraphData, id: string): GraphItemDetails | null {
  const tag = data.tags.find((each) => each.id === id);
  if (tag) {
    return {
      kind: "tag",
      id,
      title: tag.name,
      description: tag.description,
      documentIds: data.documents
        .filter((document) => document.tagIds.includes(id))
        .map((d) => d.id),
    };
  }

  const folder = data.folders.find((each) => each.id === id);
  if (folder) {
    return {
      kind: "folder",
      id,
      title: folder.title,
      folderCount: data.folders.filter((each) => each.parentId === id).length,
      documentCount: data.documents.filter((each) => each.parentId === id).length,
    };
  }

  const document = data.documents.find((each) => each.id === id);
  if (!document) return null;
  const parent =
    document.parentId && document.parentId !== ROOT_FOLDER_ID
      ? data.folders.find((each) => each.id === document.parentId)
      : undefined;
  return {
    kind: "document",
    id,
    title: document.title,
    lastUpdatedAt: document.lastUpdatedAt,
    folderName: parent?.title ?? null,
    tagNames: document.tagIds
      .map((tagId) => data.tags.find((each) => each.id === tagId)?.name)
      .filter((name): name is string => name !== undefined),
  };
}
