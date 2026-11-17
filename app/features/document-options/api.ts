import { z } from "zod";

import { AI_TIMEOUT_MS, api, ApiError } from "~/core/api";
import type { DocumentTag } from "~/core/models";

/**
 * The endpoints around a document: the header pictures of the workspace and the ones the AI
 * draws, the tag catalogue and the tag the AI makes up, and publishing (GenAiApi.kt,
 * HeaderImagesAPI.swift, PublishingAPI.swift).
 */

function documentPath(workspaceId: string, documentId: string): string {
  return `/docs/workspace/${encodeURIComponent(workspaceId)}/document/${encodeURIComponent(documentId)}`;
}

function headerImagesPath(workspaceId: string): string {
  return `/ai/header-images/${encodeURIComponent(workspaceId)}`;
}

/** The answer of the AI routes when they refuse: the reason, when the backend gave one. */
function reasonOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  try {
    const body = JSON.parse(error.body) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

const aiStatusSchema = z.object({ available: z.boolean().default(false) });

/** Whether the backend has a cloud AI to ask. False for a FREE user, who gets a 403. */
export async function isAiAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    return (await api.get("/ai/status", aiStatusSchema, { signal })).available;
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) return false;
    throw error;
  }
}

const headerImagesSchema = z.object({
  images: z.array(z.object({ id: z.string(), url: z.string() })).default([]),
});

/** The addresses of the approved header pictures of the workspace, the newest first. */
export async function getHeaderImages(workspaceId: string, signal?: AbortSignal) {
  const response = await api.get(headerImagesPath(workspaceId), headerImagesSchema, { signal });
  return response.images.map((image) => image.url);
}

/** Keeps a picture with the header pictures of the workspace. */
export function saveHeaderImage(workspaceId: string, imageUrl: string): Promise<void> {
  return api.send("POST", headerImagesPath(workspaceId), { imageUrl });
}

/** Why the AI could not draw a picture; [message] is the backend's reason when it gave one. */
export class GenerationError extends Error {
  override readonly name = "GenerationError";
  constructor(readonly reason: string | null) {
    super(reason ?? "The AI drew no picture");
  }
}

const generateSchema = z.object({ imageUrl: z.string().nullish(), error: z.string().nullish() });

/**
 * Draws a header for a document, charged to the user's AI tokens. Answers the address of the
 * picture, which is not with the workspace's pictures until it is saved.
 */
export async function generateHeaderImage(
  request: {
    workspaceId: string;
    documentTitle: string;
    documentText: string;
    instructions: string;
  },
  signal?: AbortSignal,
): Promise<string> {
  let response: z.infer<typeof generateSchema>;
  try {
    response = await api.post("/ai/header-image", request, generateSchema, {
      signal,
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof ApiError) throw new GenerationError(reasonOf(error));
    throw error;
  }
  if (!response.imageUrl) throw new GenerationError(response.error ?? null);
  return response.imageUrl;
}

/** Adds tags to the catalogue of the workspace, or changes the ones that are in it. */
export function saveTags(workspaceId: string, tags: DocumentTag[]): Promise<void> {
  return api.send("POST", "/docs/workspace/tag", { tags, workspaceId });
}

const tagCreateSchema = z.object({
  name: z.string().nullish(),
  description: z.string().nullish(),
  error: z.string().nullish(),
});

export type TagDraft = { name: string; description: string };

/** A tag the AI makes up for a document, avoiding the names the catalogue has. */
export async function suggestTag(request: {
  documentTitle: string;
  documentText: string;
  existingTagNames: string[];
}): Promise<TagDraft> {
  const response = await api.post("/ai/tag-create", request, tagCreateSchema, {
    timeoutMs: AI_TIMEOUT_MS,
  });
  if (!response.name) throw new Error(response.error ?? "The AI answered without a tag");
  return { name: response.name, description: response.description ?? "" };
}

const publishedSchema = z.object({ published: z.boolean().default(false) });

export async function isPublished(
  workspaceId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const path = `${documentPath(workspaceId, documentId)}/published`;
  return (await api.get(path, publishedSchema, { signal })).published;
}

export function setPublished(
  workspaceId: string,
  documentId: string,
  published: boolean,
): Promise<void> {
  const action = published ? "publish" : "unpublish";
  return api.send("POST", `${documentPath(workspaceId, documentId)}/${action}`);
}

/** The public address of a published document, served by this app. */
export function siteUrl(documentId: string): string {
  return `${window.location.origin}/site/${encodeURIComponent(documentId)}`;
}
