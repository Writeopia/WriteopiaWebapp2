import { api, ApiError } from "~/core/api";
import { type Document, documentSchema } from "~/core/models";

/**
 * A published document, for anyone with its address (SiteViewModel.kt). No session is needed,
 * so the client never tries to renew one. Null when it does not exist or is not published.
 */
export async function getSiteDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<Document | null> {
  try {
    return await api.get(`/site/${encodeURIComponent(documentId)}`, documentSchema, {
      signal,
      renewSession: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

export function sitePath(documentId: string): string {
  return `/site/${encodeURIComponent(documentId)}`;
}
