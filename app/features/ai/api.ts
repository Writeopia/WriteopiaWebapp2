import { z } from "zod";

import { AI_TIMEOUT_MS, api, ApiError, apiRequest } from "~/core/api";

import { readAnswer } from "./stream";

/**
 * The cloud AI of the backend (GenAiApi.kt and the DTOs of common/endpoints): the streamed
 * answers, the free command, the writing agent, the pictures for a paragraph and the usage.
 * Every call is charged to the user's tokens; FREE users get a 403.
 */

/** Why an AI call failed, for what to tell the user. */
export type AiFailure = "premium" | "quota" | "other";

export function aiFailure(error: unknown): AiFailure {
  if (error instanceof ApiError && error.isForbidden) return "premium";
  if (error instanceof ApiError && error.status === 429) return "quota";
  return "other";
}

/** The answer of a streamed endpoint, the whole of it so far at each step. */
async function* streamFrom(path: string, body: object, signal?: AbortSignal) {
  const response = await apiRequest(path, {
    method: "POST",
    body: { ...body, stream: true },
    signal,
    timeoutMs: AI_TIMEOUT_MS,
  });
  if (!response.body) return;
  yield* readAnswer(response.body);
}

export type QuickAction = "summary" | "actionPoints" | "faq" | "tags";

const QUICK_ACTION_PATHS: Record<QuickAction, string> = {
  summary: "/ai/summary",
  actionPoints: "/ai/action-points",
  faq: "/ai/faq",
  tags: "/ai/tags",
};

/**
 * A quick action about [text]. The backend wraps the text in the prompt of the action, so the
 * text is the whole prompt (PromptService.kt).
 */
export function streamQuickAction(
  action: QuickAction,
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamFrom(QUICK_ACTION_PATHS[action], { prompt: text }, signal);
}

/** The answer of a prompt written here, like the writing agent's. */
export function streamGenerate(prompt: string, signal?: AbortSignal): AsyncGenerator<string> {
  return streamFrom("/ai/generate", { prompt }, signal);
}

/** The whole answer of [prompt], trimmed. An empty answer is a failure. */
export async function askAi(prompt: string, signal?: AbortSignal): Promise<string> {
  let answer = "";
  for await (const text of streamGenerate(prompt, signal)) answer = text;
  answer = answer.trim();
  if (!answer) throw new Error("The AI answered nothing");
  return answer;
}

// ---------------------------------------------------------------------------------------------
// The free command

export type AiCommandIntent = "REPLACE" | "ADD" | "REWRITE";

/** A command typed by the writer, with the document and the selected lines (AiCommandRequest). */
export type AiCommandRequest = {
  command: string;
  selectedText: string;
  documentTitle: string;
  documentText: string;
  intent?: AiCommandIntent;
};

const intentSchema = z.object({
  intent: z.enum(["REPLACE", "ADD", "REWRITE"]).nullish(),
  error: z.string().nullish(),
});

/** What the command does with the selection; null when the backend could not decide. */
export async function commandIntent(
  request: AiCommandRequest,
  signal?: AbortSignal,
): Promise<AiCommandIntent | null> {
  const response = await api.post(
    "/ai/command-intent",
    { ...request, stream: false },
    intentSchema,
    { signal, timeoutMs: AI_TIMEOUT_MS },
  );
  return response.intent ?? null;
}

/** The answer of a command, written for the intent the request carries. */
export function streamCommand(
  request: AiCommandRequest & { intent: AiCommandIntent },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamFrom("/ai/command", request, signal);
}

// ---------------------------------------------------------------------------------------------
// The writing agent

export const WRITING_ACTIONS = [
  "CODE_BLOCK",
  "LIST",
  "CHECK_LIST",
  "NEW_DOCUMENT_LINK",
  "IMAGE",
  "DRAWING",
  "SPREADSHEET",
  "SECTION_HEADING",
  "DOCUMENT_TITLE",
  "CALLOUT",
  "TLDR",
  "CONCLUSION",
] as const;

export type WritingAction = (typeof WRITING_ACTIONS)[number];

export type WritingSuggestion = { action: WritingAction; probability: number };

export type WritingSuggestionsRequest = {
  scope: "WRITING" | "DOCUMENT_OPENED";
  text?: string;
  blockType?: string;
  documentTitle?: string;
  documentText?: string;
};

const writingSuggestionsSchema = z.object({
  suggestions: z.array(z.object({ action: z.string(), probability: z.number() })).default([]),
});

/** The actions the writer likely wants next, best first. Actions this app does not know are left out. */
export async function writingSuggestions(
  request: WritingSuggestionsRequest,
  signal?: AbortSignal,
): Promise<WritingSuggestion[]> {
  const response = await api.post("/ai/writing-suggestions", request, writingSuggestionsSchema, {
    signal,
    timeoutMs: AI_TIMEOUT_MS,
  });
  return response.suggestions.filter((suggestion): suggestion is WritingSuggestion =>
    (WRITING_ACTIONS as readonly string[]).includes(suggestion.action),
  );
}

export type FolderSuggestion = { folderId: string; probability: number; folderName: string };

const folderSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        folderId: z.string(),
        probability: z.number(),
        folderName: z.string().default(""),
      }),
    )
    .default([]),
});

/** The folders a document of the root belongs to; the backend picks them in [workspaceId]. */
export async function folderSuggestions(
  request: { documentTitle: string; documentText: string; workspaceId: string },
  signal?: AbortSignal,
): Promise<FolderSuggestion[]> {
  const body = { ...request, folders: [] };
  const response = await api.post("/ai/folder-suggestions", body, folderSuggestionsSchema, {
    signal,
    timeoutMs: AI_TIMEOUT_MS,
  });
  return response.suggestions;
}

/** How many catalogue tags are asked about at most (TagSuggestionsRequest.MAX_TAGS). */
export const MAX_TAG_CANDIDATES = 30;

export type TagCandidate = { id: string; name: string; description: string };
export type TagSuggestion = { tagId: string; probability: number };

const tagSuggestionsSchema = z.object({
  suggestions: z.array(z.object({ tagId: z.string(), probability: z.number() })).default([]),
});

/** The tags of [request.tags] the document should carry, best first. */
export async function tagSuggestions(
  request: { documentTitle: string; documentText: string; tags: TagCandidate[] },
  signal?: AbortSignal,
): Promise<TagSuggestion[]> {
  const body = { ...request, tags: request.tags.slice(0, MAX_TAG_CANDIDATES) };
  const response = await api.post("/ai/tag-suggestions", body, tagSuggestionsSchema, {
    signal,
    timeoutMs: AI_TIMEOUT_MS,
  });
  return response.suggestions;
}

// ---------------------------------------------------------------------------------------------
// Pictures and usage

const imageSchema = z.object({ imageUrl: z.string().nullish(), error: z.string().nullish() });

/** Draws a picture for [paragraph], with the document as context. Answers its address. */
export async function paragraphImage(
  request: { paragraph: string; documentTitle: string; documentText: string },
  signal?: AbortSignal,
): Promise<string> {
  const response = await api.post("/ai/image", request, imageSchema, {
    signal,
    timeoutMs: AI_TIMEOUT_MS,
  });
  if (!response.imageUrl) throw new Error(response.error ?? "The AI drew no picture");
  return response.imageUrl;
}

const usageSchema = z.object({
  totalInputTokens: z.number().default(0),
  totalOutputTokens: z.number().default(0),
  totalTokens: z.number().default(0),
  requestCount: z.number().default(0),
  periodStart: z.number().default(0),
  periodEnd: z.number().default(0),
  quota: z.number().nullish(),
});

export type AiUsage = z.output<typeof usageSchema>;

/** The tokens used this month, and the quota. */
export function getAiUsage(signal?: AbortSignal): Promise<AiUsage> {
  return api.get("/ai/usage", usageSchema, { signal });
}
