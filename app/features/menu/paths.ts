import { ROOT_FOLDER_ID } from "~/core/models";

/** The addresses of the screens inside the app. */
export const appPaths = {
  home: `/app/folder/${ROOT_FOLDER_ID}`,
  folder: (folderId: string) => `/app/folder/${encodeURIComponent(folderId)}`,
  favorites: "/app/favorites",
  tag: (tagId: string) => `/app/tag/${encodeURIComponent(tagId)}`,
  document: (documentId: string) => `/app/document/${encodeURIComponent(documentId)}`,
  graph: "/app/graph",
  search: "/app/search",
  notifications: "/app/notifications",
} as const;
