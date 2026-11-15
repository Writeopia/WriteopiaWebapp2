# 02 — API client and data models

How the web app talks to the backend, exactly as the Compose web app does. Built in M1 (client,
session, auth and workspace endpoints) and extended per feature.

Reference:

- Client calls: `Writeopia/application/core/auth_core/.../data/AuthApi.kt`, `WorkspaceApi.kt`,
  `Writeopia/application/core/documents/.../folders/api/DocumentsApi.kt`, `MediaApi.kt`,
  `Writeopia/application/core/genai/.../api/GenAiApi.kt`,
  `Writeopia/plugins/writeopia_network/.../api/StoryStepSyncApiImpl.kt`
- Path constants: `Writeopia/common/endpoints/.../EndPoints.kt`
- Wire types: `Writeopia/plugins/writeopia_serialization/src/commonMain/kotlin/io/writeopia/sdk/serialization/`
- Server side: `Writeopia/backend/core/auth/.../routing/`, `backend/core/workspaces/.../WorkspaceRouting.kt`,
  `backend/documents/documents/.../routing/DocumentsRouting.kt`, `backend/core/ai/.../routing/`
- A second client implementation to compare against: `Writeopia/iosAppNat/Packages/Core/Sources/`
  (`APIClient.swift`, `AuthAPI.swift`, `Sync.swift`, …)

## HTTP client (`core/api`)

A thin wrapper over `fetch`:

- Base URL is the page origin; all paths start with `/api/`.
- `credentials: "include"` on every API call. Never on other origins (the header-picture CDN
  answers without `Access-Control-Allow-Credentials` and the browser would block it — see
  `WebHttpClient.kt`).
- JSON in/out; responses parsed with Zod schemas. Several error responses are **plain text**
  (`"Invalid credentials"`), so read the body as text first on non-2xx.
- Typed `ApiError { status, message }`.
- Long timeout for AI calls (the Kotlin client uses 300 s).

### Session

Tokens live in HttpOnly cookies set by the backend (`CookieAuthRouting.kt`): access token
(15 min) and refresh token, `Path=/api`, `SameSite=Strict`, `Secure` in production.

| Call                           | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `POST /api/auth/login/web`     | Sets the cookies; body returns the user, no tokens    |
| `POST /api/auth/refresh/web`   | No body; rotates both cookies. 401 → session is gone  |
| `GET /api/auth/session/status` | `{ authenticated, userId?, expiresAt? }` — always 200 |
| `POST /api/auth/logout/web`    | Revokes the refresh token and clears the cookies      |
| `GET /api/auth/user/current`   | The user; 401/403 when there is no valid session      |

Refresh strategy: on a `401` from any API call, run a **single shared** `refresh/web` promise,
then retry the request once. If the refresh fails, clear the query cache and redirect to the
login page. Optionally refresh proactively using `expiresAt` from `session/status`.

## Wire models (`core/models`)

Field names are exact. Timestamps are epoch milliseconds (`FolderApi.createdAt/lastUpdatedAt`
are also sent as numbers — `InstantSerializer`).

```ts
type StoryType = { name: string; number: number };

type StoryStep = {
  id: string;
  type: StoryType;
  parentId?: string | null;
  url?: string | null; // image/video source, link card address, header picture
  path?: string | null; // local path — unused on web
  text?: string | null;
  checked?: boolean | null;
  steps: StoryStep[]; // children (groups, spreadsheet rows/cells)
  tags: { tag: string; position: number }[];
  spans: { start: number; end: number; span: string; extra?: string | null }[];
  decoration: { backgroundColor?: number | null }; // ARGB as signed 32-bit int
  position: string; // Rank; legacy numeric values must be accepted (RankSerializer)
  documentLink?: { id: string; title?: string | null } | null;
  lastUpdatedAt?: number | null;
};

type Document = {
  id: string;
  title: string;
  workspaceId: string;
  content: StoryStep[];
  createdAt: number;
  lastUpdatedAt: number;
  lastSyncedAt?: number | null;
  isFavorite: boolean;
  parentId?: string | null;
  isLocked: boolean;
  icon?: { label: string; tint: number | null } | null;
  deleted: boolean;
  published: boolean;
  commentConversations: {
    id: string;
    comments: { id: string; text: string; deleted: boolean }[];
  }[];
  tagIds: string[];
};

type Folder = {
  id: string;
  parentId: string;
  title: string;
  workspaceId: string;
  createdAt: number;
  lastUpdatedAt: number;
  favorite: boolean;
  icon?: { label: string; tint: number | null } | null;
  itemCount: number;
};

type DocumentTag = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  createdAt: number;
  lastUpdatedAt: number;
  deleted: boolean;
};

type Workspace = {
  id: string;
  userId: string;
  name: string;
  role: "ADMIN" | "EDITOR";
  documentCount: number;
};
type User = { id: string; email: string; name: string; tier: "FREE" | "PREMIUM" };
```

### Story types (`StoryTypes.kt`)

| name                             | number          | Notes                                                                  |
| -------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `message`                        | 0               | Text. Headings are text with an `H1`–`H4` tag                          |
| `image`                          | 2               | `url`                                                                  |
| `video`                          | 6               | `url`                                                                  |
| `check_item`                     | 10              | `checked`                                                              |
| `title`                          | 11              | First step; also carries the header (see [06](06-document-options.md)) |
| `unordered_list_item`            | 16              |                                                                        |
| `ai_answer`                      | 18              |                                                                        |
| `document_link`                  | 20              | `documentLink`                                                         |
| `divider`                        | 21              |                                                                        |
| `equation`                       | 22              | LaTeX in `text`, picture in `url`                                      |
| `code_block`                     | 23              |                                                                        |
| `link_card`                      | 24              | `url` + AI description in `text`                                       |
| `drawing`                        | 100             | `DrawingData` JSON in `text`                                           |
| `spreadsheet` / `_row` / `_cell` | 101 / 102 / 103 | Nested through `steps`                                                 |

UI-only types that are never saved: `space` 7, `last_space` 8, `add_button` 9,
`on_drag_space` 17, `loading` 19, `skeleton` 25. Others exist but are unused by the editor:
`message_box` 1, `group_image` 3, `audio` 4, `group_video` 5.

### Tags and spans

- Tags (`Tag.kt`): `H1`, `H2`, `H3`, `H4`, `HIGH_LIGHT_BLOCK` (box), `CARD_BLOCK` (card),
  `CODE_BLOCK`, `COLLAPSED`, `AI_SUGGESTION`, `FIRST_AI_SUGGESTION`. Box and card carry a
  `position` and carry over to the next line on Enter.
- Spans (`SpanInfo.kt`): `BOLD`, `ITALIC`, `UNDERLINE`, `HIGHLIGHT` (yellow), `HIGHLIGHT_GREEN`,
  `HIGHLIGHT_RED`, `LINK` (`extra` = URL), `COMMENT` (`extra` = conversation id). `start`/`end`
  are character offsets into `text`.

### Colours

Colours are Android ARGB ints (often negative in JSON). `core/models/color.ts`:
`argbToCss(n)` → `rgba(...)` using `n >>> 0`, and `cssToArgb`.

## `Rank` — positions (`core/rank`)

Port `Writeopia/writeopia_models/.../utils/iterables/Rank.kt` 1:1, including its tests.

- A rank is 10 zero-padded decimal digits plus an optional base-36 fraction; ranks sort as plain
  strings and must sort identically in PostgreSQL.
- `FIRST = "0001000000"` is always the title/header step.
- `at(i)`, `after(r)`, `before(r)`, `between(a, b)` (adds 2 random base-36 characters so two
  clients inserting at the same spot do not collide).

The Swift port (`iosAppNat/.../Rank.swift`) is a useful cross-check.

## Endpoint reference

All paths are prefixed with `/api`. `{ws}` = workspace id.

### Auth

| Method | Path                                 | Body → Response                                                                                                                           |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login/web`                    | `{identifier, password}` → `{writeopiaUser, enabled}`; 401 invalid, 403 deletion pending                                                  |
| POST   | `/auth/refresh/web`                  | —                                                                                                                                         |
| POST   | `/auth/logout/web`                   | —                                                                                                                                         |
| GET    | `/auth/session/status`               | → `{authenticated, userId?, expiresAt?}`                                                                                                  |
| GET    | `/auth/user/current`                 | → `User`                                                                                                                                  |
| POST   | `/auth/register/email/send`          | `{email}`                                                                                                                                 |
| POST   | `/auth/register/email/verify`        | `{email, code}`                                                                                                                           |
| GET    | `/auth/username/available?username=` | → `{available}`                                                                                                                           |
| POST   | `/auth/register`                     | `{name, email, username, workspaceName, password, verificationCode, acceptedLegalVersion}` → `{writeopiaUser, emailConfirmationRequired}` |
| POST   | `/auth/email/confirm`                | `{email, code}` → `AuthResponse`                                                                                                          |
| POST   | `/auth/email/resend`                 | `{email}` → `{success, message?}`                                                                                                         |
| POST   | `/auth/password/forgot`              | `{email}` → `{success, message?}`                                                                                                         |
| POST   | `/auth/password/verify-code`         | `{email, code}` → `{success, message?}`                                                                                                   |
| POST   | `/auth/password/reset-with-code`     | `{email, code, newPassword}` → `{success, message?}`                                                                                      |
| PUT    | `/auth/password/reset`               | `{newPassword}` (logged in)                                                                                                               |
| DELETE | `/auth/account`                      | → `{deleted}`                                                                                                                             |
| GET    | `/auth/legal/{terms\|privacy}`       | → `{type, version, effectiveDate, title, sections[{heading, body}]}`                                                                      |

### Workspaces

| Method | Path                                                  | Body → Response                                                    |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/workspace/user`                                     | → `Workspace[]`                                                    |
| POST   | `/workspace/create`                                   | `{name}`                                                           |
| GET    | `/workspace/{ws}/users`                               | → `WorkspaceUser[]` `{id, email, name, role, username}`            |
| GET    | `/workspace/{ws}/users/paginated?page&pageSize`       | → `{users, page, pageSize, totalCount, totalPages, hasNextPage}`   |
| GET    | `/workspace/{ws}/users/search?username&page&pageSize` | → `{users[{id, name, username}], page, pageSize, hasNextPage}`     |
| POST   | `/workspace/user`                                     | `{username, workspaceId, role}`; 409 already member, 404 not found |
| PUT    | `/workspace/role`                                     | `{workspaceId, userId, newRole}`; 409 last admin                   |
| POST   | `/workspace/{ws}/export`                              | — (download link is emailed)                                       |

### Documents and folders (`/docs/workspace/...`)

| Method       | Path                                               | Body → Response                                                                                                                                        |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET          | `/{ws}/folder/{folderId}/contents`                 | → `{folders, documents, tags}`                                                                                                                         |
| GET          | `/{ws}/folder/{folderId}/contents/preview?steps=7` | Same, documents truncated to the first steps (for cards)                                                                                               |
| GET          | `/{ws}/folder/{folderId}/path`                     | → `Folder[]` (breadcrumb)                                                                                                                              |
| POST         | `/{ws}/folder/{parentId}/create`                   | `{title, icon?}` → `Folder`                                                                                                                            |
| PUT          | `/{ws}/folder/{folderId}`                          | `{title?, icon?, favorite?}` → `Folder`                                                                                                                |
| DELETE       | `/{ws}/folder/{folderId}`                          |                                                                                                                                                        |
| POST         | `/{ws}/folder/{folderId}/move`                     | `{targetParentId}`                                                                                                                                     |
| GET          | `/{ws}/document/{id}`                              | → `Document`                                                                                                                                           |
| POST         | `/document`                                        | `{documents: Document[], workspaceId}` — upsert (create, rename, icon, tags, metadata)                                                                 |
| POST         | `/{ws}/document/{id}/steps/sync`                   | See below                                                                                                                                              |
| POST         | `/{ws}/steps/delete`                               | `{tombstones: [{stepId, documentId}]}`                                                                                                                 |
| POST         | `/{ws}/document/delete`                            | `{documentIds}`                                                                                                                                        |
| POST         | `/{ws}/document/clone`                             | `{documentIds}` → `Document[]`                                                                                                                         |
| POST         | `/{ws}/document/{id}/move`                         | `{targetParentId}`                                                                                                                                     |
| POST         | `/{ws}/document/{id}/favorite`                     | `{favorite}`                                                                                                                                           |
| GET          | `/{ws}/user/favorites`                             | → `string[]` (document ids)                                                                                                                            |
| GET          | `/{ws}/document/search`                            | → `{documents, presentations}` (`?q=<text>`)                                                                                                           |
| POST         | `/{ws}/document/{id}/publish` · `/unpublish`       |                                                                                                                                                        |
| GET          | `/{ws}/document/{id}/published`                    | → `{published}`                                                                                                                                        |
| POST         | `/{ws}/document/{id}/link-card/describe`           | `{storyStep, position, requestTimestamp}` → `{storyStep?, error?}`                                                                                     |
| POST         | `/{ws}/document/generate-summary`                  | `{documents[{documentId, lastSyncedAt}], targetFolderId, summaryTitle?, model?, ignoreSyncCheck}` → 201 `{document}` / 409 `{unsyncedDocuments}` / 503 |
| POST         | `/tag`                                             | `{tags: DocumentTag[], workspaceId}` — upsert catalogue                                                                                                |
| GET · POST   | `/{ws}/document/{id}/presentations`                | list · generate `{model?}`                                                                                                                             |
| GET · DELETE | `/{ws}/presentation/{presentationId}`              |                                                                                                                                                        |
| GET          | `/api/site/{documentId}`                           | Public, no session → `Document`                                                                                                                        |

Diff endpoints (`/document/folder/diff`, `/diff`, `/events/diff`, `/steps/deleted`) exist for the
offline-first clients. The web app does not need them: it refetches.

### Step sync

`POST /api/docs/workspace/{ws}/document/{documentId}/steps/sync`

```ts
// request
{ documentId, workspaceId, lastSyncTimestamp, requestTimestamp,
  changes: [{ storyStep: StoryStep, position: string }],
  deletions: string[] /* step ids */ }
// response
{ serverTimestamp, updatedSteps: StoryStep[], deletedIds: string[] }
```

Client behaviour to copy (`OnUpdateStoryStepSyncTracker.kt`, `StoryStepSyncBuffer.kt`):
buffer changed steps, debounce **500 ms**, send only steps whose content really changed, stamp
`lastUpdatedAt`, never send ephemeral steps, keep `serverTimestamp` as the next
`lastSyncTimestamp`, apply `updatedSteps` / `deletedIds` from the response, give up after 3
consecutive failures and surface an error. Also flush on `visibilitychange`/`pagehide`.

### Media

| Method | Path                                        | Body → Response                                         |
| ------ | ------------------------------------------- | ------------------------------------------------------- |
| POST   | `/media/upload`                             | multipart, field `image` → 201 `{imageUrl}`             |
| POST   | `/docs/workspace/{ws}/document/{id}/header` | multipart image → `{headerImage, documentId}` (premium) |

### AI (`/ai/...`)

| Method     | Path                                                       | Notes                                                                                                     |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET        | `/status`, `/usage`                                        | usage → `{totalInputTokens, totalOutputTokens, totalTokens, requestCount, periodStart, periodEnd, quota}` |
| POST       | `/generate`, `/summary`, `/action-points`, `/faq`, `/tags` | `{prompt, model?, stream}`; streamed answers are SSE lines `data: {response, done, error}`                |
| POST       | `/command-intent`                                          | `AiCommandRequest` → `{intent, replaceProbability, error?}`                                               |
| POST       | `/command`                                                 | `AiCommandRequest` with `intent`, streamed like `/generate`                                               |
| POST       | `/writing-suggestions`                                     | `{scope, text, blockType?, documentTitle?, documentText?}` → `{suggestions[{action, probability}]}`       |
| POST       | `/folder-suggestions`, `/tag-suggestions`, `/tag-create`   | see `common/endpoints/.../dto/writingagent/`                                                              |
| POST       | `/image`                                                   | `{paragraph, documentTitle, documentText}` → `{imageUrl?, error?}`                                        |
| POST       | `/header-image`                                            | `{workspaceId, documentTitle, documentText, instructions}` → `{imageUrl?, error?}`                        |
| GET · POST | `/header-images/{ws}`                                      | list `{images[{id, url, createdAt}]}` · save `{imageUrl}`                                                 |
| DELETE     | `/header-images/{ws}/{imageId}`                            |                                                                                                           |
| POST       | `/equation/recognize`, `/equation/render`                  | `{drawing}` / `{latex}` → `{latex?, imageUrl?, error?}`                                                   |

## To verify while implementing

Resolved while implementing this document:

- The root folder id is `root` (`Folder.ROOT_PATH`); exported as `ROOT_FOLDER_ID`.
- `/document/search` takes the query as `?q=` (`SearchApi.kt`).
- `/ai/status` answers `{available}`, and 403 `{error}` for FREE tier users.
- The backend leaves out fields that hold their default value (see the fixture documents), so
  every optional field is parsed with its default.

Still inferred from names and call sites rather than read end to end:

- Which fields `POST /document` requires when updating metadata only (the sync service sends
  documents `withoutContent()`).
- Which other endpoints return 403 for FREE tier users (`requirePremiumUserId`).
- Whether `FolderApi.createdAt` / `lastUpdatedAt` arrive as numbers or ISO text; the schema
  accepts both.

## What was built

| Module            | Contents                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/core/rank`   | `rankAt`, `rankAfter`, `rankBefore`, `rankBetween`, `ranksBetween`, `isRank`, `RANK_FIRST`; jitter switch in `rankConfig`                                             |
| `app/core/models` | Zod schemas and types (`schemas.ts`), `StoryTypes` / `Tags` / `Spans` constants (`storyTypes.ts`), ARGB helpers (`color.ts`)                                          |
| `app/core/api`    | `api.get/post/put/delete/send`, `apiRequest` (raw response, for streams), `apiUrl`, `renewSession`, `onSessionExpired`, `ApiError` / `NetworkError` / `ApiParseError` |
| `test/fixtures`   | Builders (`aUser`, `aWorkspace`, `aDocument`, `aStep`, `aFolder`) and two documents written by the other apps                                                         |
| `test/msw`        | Default handlers (signed out) and `signedIn(user)`                                                                                                                    |

Conventions for the feature modules that follow:

- Paths are given without the `/api` prefix: `api.get("/auth/user/current", userSchema)`.
- Requests about the session itself (login, refresh, logout, register) pass
  `renewSession: false`, so their 401 is read as their answer.
- AI calls pass `timeoutMs: AI_TIMEOUT_MS`.

## Tasks

- [x] `core/api/client.ts` with credentials, error mapping, single-flight refresh + retry
- [x] Zod schemas and types for the core wire models; ARGB colour helpers
- [x] `core/rank` port with tests
- [x] MSW handlers + fixtures (reuse `Writeopia/notes_example.json` and `writeopia_documents/*.json`)
- [ ] Endpoint modules and their request/response schemas, added as each feature lands
