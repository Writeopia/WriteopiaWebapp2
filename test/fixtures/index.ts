import {
  type Document,
  documentSchema,
  type Folder,
  ROOT_FOLDER_ID,
  type StoryStep,
  StoryTypes,
  type User,
  type Workspace,
} from "~/core/models";
import { rankAt } from "~/core/rank/rank";

import usingCommands from "./document-using-commands.json";

/** Data for tests, in the shape the app holds it. Each builder takes the fields to change. */

export const WORKSPACE_ID = "workspace-1";

export function aUser(overrides: Partial<User> = {}): User {
  return { id: "user-1", email: "ana@writeopia.io", name: "Ana", tier: "FREE", ...overrides };
}

export function aWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: WORKSPACE_ID,
    userId: "user-1",
    name: "Personal",
    role: "ADMIN",
    documentCount: 1,
    ...overrides,
  };
}

export function aStep(overrides: Partial<StoryStep> = {}): StoryStep {
  return {
    id: "step-1",
    type: StoryTypes.TEXT,
    parentId: null,
    url: null,
    path: null,
    text: "",
    checked: false,
    steps: [],
    tags: [],
    spans: [],
    decoration: { backgroundColor: null },
    position: rankAt(1),
    documentLink: null,
    lastUpdatedAt: null,
    ...overrides,
  };
}

export function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "document-1",
    title: "Groceries",
    workspaceId: WORKSPACE_ID,
    content: [
      aStep({ id: "title", type: StoryTypes.TITLE, text: "Groceries", position: rankAt(0) }),
      aStep({ id: "line-1", type: StoryTypes.CHECK_ITEM, text: "Corn", position: rankAt(1) }),
    ],
    createdAt: 1_700_000_000_000,
    lastUpdatedAt: 1_700_000_000_000,
    lastSyncedAt: null,
    isFavorite: false,
    parentId: ROOT_FOLDER_ID,
    isLocked: false,
    icon: null,
    deleted: false,
    published: false,
    commentConversations: [],
    tagIds: [],
    ...overrides,
  };
}

export function aFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    parentId: ROOT_FOLDER_ID,
    title: "Work",
    createdAt: 1_700_000_000_000,
    lastUpdatedAt: 1_700_000_000_000,
    workspaceId: WORKSPACE_ID,
    favorite: false,
    icon: null,
    itemCount: 0,
    ...overrides,
  };
}

/** A real document, written by the desktop app: headings, spans, a header color, an icon. */
export function theUsingCommandsDocument(): Document {
  return documentSchema.parse({ ...usingCommands, workspaceId: WORKSPACE_ID });
}
