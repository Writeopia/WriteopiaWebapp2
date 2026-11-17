import { z } from "zod";

import { api } from "~/core/api";
import { documentSchema, type Icon } from "~/core/models";

/**
 * The search of a workspace (SearchApi.kt): its documents and its presentations, in one
 * request. A document found by its words comes with the step it was found in as its only
 * content. PREMIUM only: a FREE user gets a 403.
 */

const presentationSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  title: z.string().default(""),
});

const searchResponseSchema = z.object({
  documents: z.array(documentSchema).default([]),
  presentations: z.array(presentationSchema).default([]),
});

/** At most this many documents are shown, like SearchRepository.kt. */
export const SEARCH_RESULTS_LIMIT = 12;

export type SearchResult =
  | {
      kind: "document";
      id: string;
      title: string;
      icon: Icon | null;
      /** The text the query was found in, when it was found by its words. */
      snippet: string | null;
    }
  /** Opens over the document it was made from. */
  | { kind: "presentation"; id: string; title: string; documentId: string };

export async function searchWorkspace(
  workspaceId: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const response = await api.get(
    `/docs/workspace/${encodeURIComponent(workspaceId)}/document/search`,
    searchResponseSchema,
    { query: { q: query }, signal },
  );

  const documents: SearchResult[] = response.documents
    .filter((document) => !document.deleted)
    .slice(0, SEARCH_RESULTS_LIMIT)
    .map((document) => {
      const snippet = document.content[0]?.text?.trim();
      return {
        kind: "document",
        id: document.id,
        title: document.title,
        icon: document.icon,
        // A blank step is no snippet: the document was found by its title.
        snippet: snippet === "" ? null : (snippet ?? null),
      };
    });
  const presentations: SearchResult[] = response.presentations.map((presentation) => ({
    kind: "presentation",
    id: presentation.id,
    title: presentation.title,
    documentId: presentation.documentId,
  }));

  return [...documents, ...presentations];
}
