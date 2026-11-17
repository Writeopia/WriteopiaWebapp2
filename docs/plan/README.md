# Writeopia Webapp — Implementation Plan

A React web client for Writeopia that talks to the existing backend, replacing the Compose
(Kotlin/JS) web app in `Writeopia/application/web`. It is **online-first**: the backend is the
source of truth, there is no local database, and only UI preferences live in the browser.

Reference code lives in `/Users/leandroferreira/WriteopiaProject/Writeopia` (called `Writeopia/`
below). The Compose app is the behavioural reference; the Swift app (`iosAppNat/`) is a second
reference, useful because it is a from-scratch re-implementation of the same editor and API.

## How to use these documents

| Doc                                                            | Covers                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [01-foundation.md](01-foundation.md)                           | Project setup, tooling, lint, tests, CI, deploy to the Google bucket                  |
| [02-api-and-data.md](02-api-and-data.md)                       | HTTP client, cookie session, wire models, endpoint reference, `Rank`                  |
| [03-auth-and-workspaces.md](03-auth-and-workspaces.md)         | Login, register, forgot/reset password, choose/create/export workspace                |
| [04-shell-and-document-menu.md](04-shell-and-document-menu.md) | App shell, side menu, document menu, display modes, folders, bulk actions, AI summary |
| [05-editor.md](05-editor.md)                                   | The block editor: model, blocks, formatting, commands, selection, sync                |
| [06-document-options.md](06-document-options.md)               | Customizable header (colors, AI images), icon, tags, font, publish, export, comments  |
| [07-ai.md](07-ai.md)                                           | AI command bar, quick actions, writing agent, images, equations, presentations        |
| [08-settings.md](08-settings.md)                               | Every settings section                                                                |
| [09-extras.md](09-extras.md)                                   | Search, published site view, documents graph, drawing, notifications                  |
| [../PROGRESS.md](../PROGRESS.md)                               | Log of what was done, updated at the end of every session                             |

Each doc lists **what the feature is**, **where the reference code is**, **how to build it**, and
a **task checklist**. Work one milestone at a time; tick the checklist and add a `PROGRESS.md`
entry when a task lands.

## Stack

| Concern         | Choice                                                                    | Notes                                                           |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Language        | TypeScript (strict)                                                       |                                                                 |
| UI              | React 19                                                                  |                                                                 |
| Routing         | React Router v7, framework mode, `ssr: false`                             | SPA build → static files, which is what a bucket can serve      |
| Build           | Vite                                                                      | via `@react-router/dev`                                         |
| Styling         | Tailwind CSS v4                                                           | theme tokens as CSS variables (light/dark + accent)             |
| Package manager | pnpm                                                                      |                                                                 |
| Server state    | TanStack Query                                                            | cache, refetch on focus, optimistic updates — fits online-first |
| Client state    | Zustand                                                                   | editor state and UI state that outlives a component             |
| Validation      | Zod                                                                       | parse API responses at the boundary                             |
| Tests           | Vitest + Testing Library + MSW; Playwright for e2e                        |                                                                 |
| Lint/format     | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier              |                                                                 |
| CI/CD           | GitHub Actions                                                            | PR checks + deploy on merge to `main`                           |
| Hosting         | Google Cloud Storage bucket behind the existing load balancer / Cloud CDN |                                                                 |

## Architecture in one page

```
app/
  routes/            route modules (thin: loaders + screen composition)
  features/
    auth/  workspaces/  shell/  menu/  editor/  document-options/  ai/  settings/  search/  site/
      api.ts         endpoint functions for the feature
      queries.ts     TanStack Query hooks
      components/    feature UI
      *.test.ts(x)
  core/
    api/             fetch client, session refresh, errors
    models/          wire types + zod schemas (StoryStep, Document, Folder, …)
    rank/            port of Rank.kt (fractional positions)
    theme/           tokens, theme + accent providers
    i18n/            strings
    ui/              shared components (Button, Dialog, Menu, Toast, …)
```

Three rules that shape everything:

1. **Same origin.** The API is called at `window.location.origin` and the session is two HttpOnly
   cookies scoped to `Path=/api`, `SameSite=Strict`. JavaScript never sees a token. In
   development Vite proxies `/api` to the backend so cookies still work.
2. **Server is the truth.** Lists come from TanStack Query; mutations are optimistic and roll
   back on error. Nothing is persisted locally except UI preferences (`localStorage`).
3. **The editor speaks the wire format.** A document is an ordered set of `StoryStep` blocks keyed
   by a `Rank` position string. The editor state is that same structure, so step-level sync
   (`…/steps/sync`) needs no translation layer.

## Feature inventory

Legend: **M#** is the milestone the feature lands in.

### Account and workspaces — [03](03-auth-and-workspaces.md)

- [x] Session bootstrap and route guards (M1)
- [x] Login with email or username (M1)
- [x] Register: email → verification code → account details, username availability, password strength, Terms/Privacy acceptance (M1)
- [x] Email confirmation for unconfirmed accounts, resend code (M1)
- [x] Forgot my password: email → code → new password (M1)
- [x] Reset password while logged in (M1)
- [x] Logout (M1)
- [x] Account-deletion-pending screen (M1)
- [x] Choose workspace (M1)
- [x] Create workspace (M1)
- [ ] Extract (export) workspace — backend emails a download link (M7)

### Shell and document menu — [04](04-shell-and-document-menu.md)

- [x] App shell with resizable side menu: search, home, favorites, documents graph, settings, folder tree (M2)
- [x] Document menu: folders and documents of the current folder, breadcrumb (M2)
- [x] Change display of documents: list / grid / staggered grid (M2)
- [x] Sorting: name / created / last updated (M2)
- [x] Create document, create folder (name + icon), edit folder, delete folder (M2)
- [x] Selection and bulk actions: delete, duplicate, favorite, move (M2)
- [x] Move document/folder (dialog and drag-and-drop) (M2)
- [x] Favorites view, tag view (M2)
- [x] Icons and tint for documents and folders (M2)
- [x] Summary with AI of selected documents (M6)
- [ ] Import files / export folder as Markdown or TXT (M7)

### Editor — [05](05-editor.md)

- [x] Load, render, and edit a document; debounced step sync (M3)
- [x] Blocks: title, text, H1–H4, checkbox, bullet list, code block, divider, image, document link (page), link card, box, card (M3–M4)
- [x] Inline formatting: bold, italic, underline, three highlights, links (M3)
- [x] Markdown-style line commands and the `/` slash menu (M3)
- [x] Enter / Backspace / merge / split, arrow navigation between blocks (M3)
- [x] Undo / redo (M3)
- [x] Multi-line selection (drag box, shift+arrows), copy / cut / delete selection (M4)
- [x] Drag-and-drop reordering, image drop/paste upload (M4)
- [x] Find in document (M4)
- [ ] Spreadsheet, equation, drawing blocks (M8)
- [x] Read-only / locked document (M4)

### Document options — [06](06-document-options.md)

- [x] Customizable header: none / color / workspace image / AI-generated image (M5)
- [x] Document icon picker, favorite, move to folder, delete, lock (M5)
- [x] Document tags: view, add, create, AI-suggested tag (M5)
- [x] Font family (M5)
- [x] Export as Markdown / JSON (M5)
- [x] Publish to web / unpublish / copy link (M5)
- [ ] Comments on text (M8)

### AI — [07](07-ai.md)

- [x] AI availability, usage and quota (M6)
- [x] AI command bar (free command, streamed, replace/add/rewrite) (M6)
- [x] Quick actions: summary, action points, FAQ, tags — on document or selected lines (M6)
- [x] Writing agent suggestions, folder and tag suggestions (M6)
- [x] AI image for a paragraph (M6)
- [ ] Presentations: generate, list, view, full screen, delete (M8)

### Settings — [08](08-settings.md)

- [x] Account: name and tier, change workspace, reset password, logout, export workspace, delete account (M7)
- [x] Appearance: color theme (light/dark/system), accent color (M2 for the theme itself, M7 for the screen)
- [x] AI: provider, cloud usage (M7)
- [x] Workspace: header images library, tags catalogue (M7)
- [x] Teams: workspaces list, members, search and add user, change role (M7)
- [x] App version (M7)

### Extras — [09](09-extras.md)

- [ ] Search dialog (documents and presentations) (M4)
- [ ] Public site view `/site/:documentId` (M5)
- [ ] Documents graph (M8)
- [ ] Notifications screen (M8)

## Milestones

| #   | Milestone           | Outcome                                                                                |
| --- | ------------------- | -------------------------------------------------------------------------------------- |
| M0  | Foundation          | Repo scaffolded, lint + tests + CI green, deploy pipeline publishes a placeholder page |
| M1  | Auth and workspaces | A user can sign up, sign in, recover a password, and pick a workspace                  |
| M2  | Shell and menu      | Browse, organise and manage documents and folders; theme works                         |
| M3  | Editor core         | Open a document, write with formatting and commands, changes saved to the backend      |
| M4  | Editor complete     | Selection, drag-and-drop, images, links, find, search dialog                           |
| M5  | Document options    | Header customisation, icon, tags, font, export, publish, site view                     |
| M6  | AI                  | Command bar, quick actions, writing agent, summaries, images                           |
| M7  | Settings            | All settings sections, workspace export, import/export files                           |
| M8  | Extras              | Presentations, spreadsheet, equation, drawing, comments, graph, notifications          |
| M9  | Hardening           | e2e suite, accessibility pass, performance budget, cut-over from the Compose web app   |

Each milestone ends with: all checklist items ticked, tests for the new code, `pnpm lint`,
`pnpm typecheck` and `pnpm test` green, and a `PROGRESS.md` entry.

## Out of scope for the web (present in desktop/mobile only)

- Offline / "private space" workspace and the local folder sync — the web skips the space choice
  and the workspace sync screen (`AuthNavigation.kt`: `if (isWeb) toAppNavigation()`).
- SQLite persistence, WebSocket live editing (`setDisableWebsocket(true)` in `MainWeb.kt`).
- Desktop app update check.
- Local AI (Ollama) — see the open decision below.

## Decisions to confirm before M0/M3

1. **Bucket and domain.** `gs://writeopia-web` is where the Compose web app is deployed today.
   Deploying there replaces it. Recommended: a new bucket (e.g. `writeopia-webapp`) on a staging
   host until M9, then switch the load balancer backend.
2. **Editor engine.** Recommended: a custom block editor (one `contenteditable` per block, state
   in a reducer ported from `WriteopiaStateManager`). Lexical/Tiptap would need a lossy mapping
   to and from `StoryStep` + offset spans on every sync. Details in [05](05-editor.md).
3. **Local AI on the web.** The browser can only reach `localhost:11434` if Ollama allows the
   origin (CORS). Recommended: cloud AI only for now, keep the provider setting hidden.
4. **Languages.** Recommended: English first with all strings behind an i18n layer, ported from
   `Writeopia/application/core/resources/src/commonMain/composeResources/values/strings.xml`.
