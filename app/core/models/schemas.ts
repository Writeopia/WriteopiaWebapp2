import { z } from "zod";

import { RANK_FIRST, rankAt } from "~/core/rank/rank";

/**
 * The models as they travel to and from the backend, named after the *Api classes of
 * Writeopia/plugins/writeopia_serialization. The backend leaves out the fields that have
 * their default value, so every optional field is read with that default: parsing gives a
 * complete object, and the object can be sent back as it is.
 */

/** A field that may be missing or null; both read as null. */
function nullable<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((value): z.output<T> | null => value ?? null);
}

/** A moment in time: epoch milliseconds. An ISO string is accepted too. */
const timestampSchema = z.union([z.number(), z.string()]).transform((value, context) => {
  if (typeof value === "number") return value;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    context.addIssue({ code: "custom", message: `Not a timestamp: ${value}` });
    return z.NEVER;
  }
  return parsed;
});

const MAX_LEGACY_POSITION = 8_999_999_999;

/**
 * The position of a step: a rank. Documents saved before the ranks have whole numbers (0, 1,
 * 2...), which read as the rank of that index, like RankSerializer does.
 */
const positionSchema = z
  .unknown()
  .optional()
  .transform((value): string => {
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return rankAt(Math.min(Math.max(Math.trunc(value), 0), MAX_LEGACY_POSITION));
    }
    return RANK_FIRST;
  });

export const storyTypeSchema = z.object({ name: z.string(), number: z.number().int() });

export const tagInfoSchema = z.object({ tag: z.string(), position: z.number().int().default(0) });

export const spanInfoSchema = z.object({
  start: z.number().int(),
  end: z.number().int(),
  span: z.string(),
  extra: nullable(z.string()),
});

export const decorationSchema = z.object({ backgroundColor: nullable(z.number().int()) });

export const documentLinkSchema = z.object({ id: z.string(), title: nullable(z.string()) });

export const iconSchema = z.object({ label: z.string(), tint: nullable(z.number().int()) });

export type StoryType = z.infer<typeof storyTypeSchema>;
export type TagInfo = z.infer<typeof tagInfoSchema>;
export type SpanInfo = z.infer<typeof spanInfoSchema>;
export type Decoration = z.infer<typeof decorationSchema>;
export type DocumentLink = z.infer<typeof documentLinkSchema>;
export type Icon = z.infer<typeof iconSchema>;

/** One block of a document. */
export type StoryStep = {
  id: string;
  type: StoryType;
  parentId: string | null;
  /** The source of an image or a video, the address of a link card, the header picture. */
  url: string | null;
  /** A path on the device that made the step. Unused on the web, kept for the other apps. */
  path: string | null;
  text: string | null;
  checked: boolean | null;
  /** The steps inside this one: the rows of a spreadsheet, the cells of a row. */
  steps: StoryStep[];
  tags: TagInfo[];
  spans: SpanInfo[];
  decoration: Decoration;
  /** A rank; see core/rank. */
  position: string;
  documentLink: DocumentLink | null;
  lastUpdatedAt: number | null;
};

export const storyStepSchema: z.ZodType<StoryStep, unknown> = z.object({
  id: z.string(),
  type: storyTypeSchema,
  parentId: nullable(z.string()),
  url: nullable(z.string()),
  path: nullable(z.string()),
  text: nullable(z.string()),
  checked: nullable(z.boolean()),
  get steps() {
    return z.array(storyStepSchema).default([]);
  },
  tags: z.array(tagInfoSchema).default([]),
  spans: z.array(spanInfoSchema).default([]),
  decoration: decorationSchema.default({ backgroundColor: null }),
  position: positionSchema,
  documentLink: nullable(documentLinkSchema),
  lastUpdatedAt: nullable(z.number()),
});

export const commentSchema = z.object({
  id: z.string(),
  text: z.string().default(""),
  deleted: z.boolean().default(false),
});

export const commentConversationSchema = z.object({
  id: z.string(),
  comments: z.array(commentSchema),
});

export const documentSchema = z.object({
  id: z.string().default(""),
  title: z.string().default(""),
  workspaceId: z.string(),
  /** The steps, sorted by position. */
  content: z
    .array(storyStepSchema)
    .default([])
    .transform((steps) => [...steps].sort(byPosition)),
  createdAt: timestampSchema.default(() => Date.now()),
  lastUpdatedAt: timestampSchema.default(() => Date.now()),
  lastSyncedAt: nullable(timestampSchema),
  isFavorite: z.boolean().default(false),
  parentId: nullable(z.string()),
  isLocked: z.boolean().default(false),
  icon: nullable(iconSchema),
  deleted: z.boolean().default(false),
  published: z.boolean().default(false),
  commentConversations: z.array(commentConversationSchema).default([]),
  tagIds: z.array(z.string()).default([]),
});

export const folderSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  title: z.string(),
  createdAt: timestampSchema,
  lastUpdatedAt: timestampSchema,
  workspaceId: z.string(),
  favorite: z.boolean().default(false),
  icon: nullable(iconSchema),
  itemCount: z.number().default(0),
});

export const documentTagSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  createdAt: timestampSchema,
  lastUpdatedAt: timestampSchema,
  deleted: z.boolean().default(false),
});

/** What a folder holds, and the tag catalogue of the workspace. */
export const folderContentsSchema = z.object({
  folders: z.array(folderSchema).default([]),
  documents: z.array(documentSchema).default([]),
  tags: z.array(documentTagSchema).default([]),
});

export const roleSchema = z
  .string()
  .transform((role): Role => (role.toUpperCase() === "ADMIN" ? "ADMIN" : "EDITOR"));

export const workspaceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  role: roleSchema,
  documentCount: z.number().default(0),
});

/** Unknown tiers, and a missing one, count as FREE. */
export const tierSchema = z
  .string()
  .nullish()
  .transform((tier): Tier => (tier?.toUpperCase() === "PREMIUM" ? "PREMIUM" : "FREE"));

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  tier: tierSchema,
});

export const workspaceUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  username: z.string(),
});

export type Role = "ADMIN" | "EDITOR";
export type Tier = "FREE" | "PREMIUM";
export type Comment = z.infer<typeof commentSchema>;
export type CommentConversation = z.infer<typeof commentConversationSchema>;
export type Document = z.infer<typeof documentSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type DocumentTag = z.infer<typeof documentTagSchema>;
export type FolderContents = z.infer<typeof folderContentsSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type User = z.infer<typeof userSchema>;
export type WorkspaceUser = z.infer<typeof workspaceUserSchema>;

/** The id the backend gives the root folder of every workspace (Folder.ROOT_PATH). */
export const ROOT_FOLDER_ID = "root";

function byPosition(a: StoryStep, b: StoryStep): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}
