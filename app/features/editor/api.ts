import { z } from "zod";

import { AI_TIMEOUT_MS, api } from "~/core/api";
import { type StoryStep, storyStepSchema } from "~/core/models";

/** The endpoints of the editor: step sync, media upload, link card description. */

function documentPath(workspaceId: string, documentId: string): string {
  return `/docs/workspace/${encodeURIComponent(workspaceId)}/document/${encodeURIComponent(documentId)}`;
}

export type StepSyncRequest = {
  documentId: string;
  workspaceId: string;
  /** The serverTimestamp of the last answer: the server sends what changed after it. */
  lastSyncTimestamp: number;
  requestTimestamp: number;
  changes: { storyStep: StoryStep; position: string }[];
  /** Step ids. */
  deletions: string[];
};

const stepSyncResponseSchema = z.object({
  serverTimestamp: z.number(),
  updatedSteps: z.array(storyStepSchema).default([]),
  deletedIds: z.array(z.string()).default([]),
});

export type StepSyncResponse = z.infer<typeof stepSyncResponseSchema>;

/**
 * Sends the steps changed and deleted here, and answers the ones changed and deleted
 * elsewhere since the last sync. A step changed on both sides keeps the newer one.
 */
export function syncSteps(
  workspaceId: string,
  request: StepSyncRequest,
): Promise<StepSyncResponse> {
  return api.post(
    `${documentPath(workspaceId, request.documentId)}/steps/sync`,
    request,
    stepSyncResponseSchema,
  );
}

const uploadResponseSchema = z.object({ imageUrl: z.string() });

/**
 * Stores a picture or a video and answers the address it is served at. The backend takes any
 * file under the "image" field and keeps its type.
 */
export async function uploadMedia(file: Blob, name = "media"): Promise<string> {
  const body = new FormData();
  body.append("image", file, name);
  const response = await api.post("/media/upload", body, uploadResponseSchema);
  return response.imageUrl;
}

const describeResponseSchema = z.object({
  storyStep: storyStepSchema.nullish(),
  error: z.string().nullish(),
});

/**
 * Asks the backend to describe the page a link card points to; it saves the description in
 * the card and answers the card. Null when it could not.
 */
export async function describeLinkCard(
  workspaceId: string,
  documentId: string,
  storyStep: StoryStep,
): Promise<StoryStep | null> {
  const response = await api.post(
    `${documentPath(workspaceId, documentId)}/link-card/describe`,
    { storyStep, position: storyStep.position, requestTimestamp: Date.now() },
    describeResponseSchema,
    { timeoutMs: AI_TIMEOUT_MS },
  );
  return response.storyStep ?? null;
}
