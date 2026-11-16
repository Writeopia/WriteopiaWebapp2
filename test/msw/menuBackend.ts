import { http, HttpResponse } from "msw";

import type { Document, DocumentTag, Folder } from "~/core/models";

import { aDocument, aFolder, WORKSPACE_ID } from "../fixtures";
import { apiUrl } from "./handlers";
import { server } from "./server";

type MenuBackendState = {
  folders: Folder[];
  documents: Document[];
  tags: DocumentTag[];
  /** The ids of the documents the user marked as favorites. */
  favorites: Set<string>;
};

type Call = { method: string; path: string; body: unknown };

const docs = (path: string) => apiUrl(`/docs/workspace/:workspaceId${path}`);

/**
 * A backend for the document menu that remembers what it is told, so a test can drive a
 * screen and then look at what the backend holds and at the calls it received.
 */
export function menuBackend(
  initial: Partial<Omit<MenuBackendState, "favorites">> & {
    favorites?: string[];
  } = {},
) {
  const state: MenuBackendState = {
    // Copies: the backend changes what it holds, and tests share their fixtures.
    folders: structuredClone(initial.folders ?? []),
    documents: structuredClone(initial.documents ?? []),
    tags: structuredClone(initial.tags ?? []),
    favorites: new Set(initial.favorites ?? []),
  };
  const calls: Call[] = [];
  /** What the summary endpoint answers; a test changes it to try the other branches. */
  const summary = { status: 201 };
  let created = 0;

  const record = async (request: Request) => {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => null);
    calls.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };

  const withFavorite = (document: Document): Document => ({
    ...document,
    isFavorite: state.favorites.has(document.id),
  });

  const itemCount = (folderId: string) =>
    state.folders.filter((folder) => folder.parentId === folderId).length +
    state.documents.filter((document) => document.parentId === folderId).length;

  const withCount = (folder: Folder): Folder => ({ ...folder, itemCount: itemCount(folder.id) });

  const deleteFolder = (folderId: string) => {
    state.folders
      .filter((folder) => folder.parentId === folderId)
      .forEach((folder) => deleteFolder(folder.id));
    state.documents = state.documents.filter((document) => document.parentId !== folderId);
    state.folders = state.folders.filter((folder) => folder.id !== folderId);
  };

  server.use(
    http.get(docs("/folder/:folderId/contents/preview"), ({ params }) =>
      HttpResponse.json({
        folders: state.folders
          .filter((folder) => folder.parentId === params.folderId)
          .map(withCount),
        documents: state.documents
          .filter((document) => document.parentId === params.folderId)
          .map(withFavorite),
        tags: state.tags,
      }),
    ),

    http.get(docs("/folder/:folderId/path"), ({ params }) => {
      const path: Folder[] = [];
      let current = state.folders.find((folder) => folder.id === params.folderId);
      while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        current = state.folders.find((folder) => folder.id === parentId);
      }

      return path.length > 0
        ? HttpResponse.json(path)
        : new HttpResponse("No folder", { status: 404 });
    }),

    http.post(docs("/folder/:parentId/create"), async ({ request, params }) => {
      const body = (await record(request)) as { title: string; icon: Folder["icon"] };
      const folder = aFolder({
        id: `new-folder-${++created}`,
        parentId: String(params.parentId),
        title: body.title,
        icon: body.icon ?? null,
      });
      state.folders.push(folder);
      return HttpResponse.json(folder, { status: 201 });
    }),

    http.put(docs("/folder/:folderId"), async ({ request, params }) => {
      const body = (await record(request)) as Partial<Folder>;
      const folder = state.folders.find((candidate) => candidate.id === params.folderId);
      if (!folder) return new HttpResponse("Folder not found", { status: 404 });

      Object.assign(folder, body);
      return HttpResponse.json(folder);
    }),

    http.delete(docs("/folder/:folderId"), async ({ request, params }) => {
      await record(request);
      deleteFolder(String(params.folderId));
      return new HttpResponse("Folder deleted successfully");
    }),

    http.post(docs("/folder/:folderId/move"), async ({ request, params }) => {
      const body = (await record(request)) as { targetParentId: string };
      const folder = state.folders.find((candidate) => candidate.id === params.folderId);
      if (!folder) return new HttpResponse("Folder not found", { status: 404 });

      folder.parentId = body.targetParentId;
      return new HttpResponse("Moved");
    }),

    http.get(docs("/user/favorites"), () => HttpResponse.json([...state.favorites])),

    http.get(docs("/document/:documentId"), ({ params }) => {
      const document = state.documents.find((candidate) => candidate.id === params.documentId);
      return document
        ? HttpResponse.json(withFavorite(document))
        : new HttpResponse("Not found", { status: 404 });
    }),

    http.post(apiUrl("/docs/workspace/document"), async ({ request }) => {
      const body = (await record(request)) as { documents: Document[] };
      for (const sent of body.documents) {
        const stored = state.documents.find((candidate) => candidate.id === sent.id);
        // Like the backend: steps that are not sent stay as they are.
        if (stored) Object.assign(stored, { ...sent, content: stored.content });
        else state.documents.push(sent);
      }
      return new HttpResponse("Accepted");
    }),

    http.post(docs("/document/delete"), async ({ request }) => {
      const body = (await record(request)) as { documentIds: string[] };
      state.documents = state.documents.filter(
        (document) => !body.documentIds.includes(document.id),
      );
      return new HttpResponse("Deleted");
    }),

    http.post(docs("/document/clone"), async ({ request }) => {
      const body = (await record(request)) as { documentIds: string[] };
      const copies = state.documents
        .filter((document) => body.documentIds.includes(document.id))
        .map((document) => ({
          ...document,
          id: `${document.id}-copy`,
          title: `${document.title} (Copy)`,
        }));
      state.documents.push(...copies);
      return HttpResponse.json(copies, { status: 201 });
    }),

    http.post(docs("/document/generate-summary"), async ({ request }) => {
      const body = (await record(request)) as { targetFolderId: string };
      if (summary.status !== 201) {
        return HttpResponse.json({ error: "refused" }, { status: summary.status });
      }

      const document = aDocument({
        id: "summary-1",
        title: "Summary",
        parentId: body.targetFolderId,
      });
      state.documents.push(document);
      return HttpResponse.json({ document }, { status: 201 });
    }),

    http.post(docs("/document/:documentId/move"), async ({ request, params }) => {
      const body = (await record(request)) as { targetParentId: string };
      const document = state.documents.find((candidate) => candidate.id === params.documentId);
      if (!document) return new HttpResponse("Not found", { status: 404 });

      document.parentId = body.targetParentId;
      return new HttpResponse("Moved");
    }),

    http.post(docs("/document/:documentId/favorite"), async ({ request, params }) => {
      const body = (await record(request)) as { favorite: boolean };
      const documentId = String(params.documentId);
      if (body.favorite) state.favorites.add(documentId);
      else state.favorites.delete(documentId);
      return new HttpResponse("OK");
    }),
  );

  return {
    state,
    calls,
    summary,
    /** The calls that changed something, as "METHOD path-after-the-workspace". */
    changes: () =>
      calls.map(
        (call) =>
          `${call.method} ${call.path.replace(`/api/docs/workspace/${WORKSPACE_ID}`, "").replace("/api/docs/workspace", "")}`,
      ),
  };
}
