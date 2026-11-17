# Progress log

Newest entry first. One entry per working session: what was done, what was decided, what is
next. Tick the matching checkboxes in `docs/plan/*.md` in the same change.

Entry template:

```
## YYYY-MM-DD — <milestone> — <short title>
**Done**
- …
**Decisions**
- …
**Verified** (commands run and their result)
- …
**Next**
- …
```

---

## 2026-11-17 — M7 — Settings

Implements `docs/plan/08-settings.md`. Import / export files (also listed under M7) are not part
of it and stay open.

**Done**

- `app/features/settings`: the settings dialog moved out of the shell and grew a section list
  (Account, Appearance, AI, Workspace, Teams) with the version and commit at the bottom. The
  place is in `?settings=`; moving inside the dialog replaces the entry, so Back closes it.
- Account: name and tier, change workspace, reset password, logout with a "Signing out…"
  overlay, export of a chosen workspace, delete account gated on typing the email (then
  `/account-deletion-started`).
- Appearance: theme and accent, as before.
- AI: Cloud AI with its hint; usage with compact numbers, progress bar, percentage, loading,
  "no usage data" and failure with Retry.
- Workspace: name; header images (grid, delete with confirmation, empty / failed / retry); tag
  catalogue (create, edit, delete as `deleted: true`, unique name ignoring case).
- Teams: the user's workspaces with role; members 20 at a time; add user (debounced username
  search, 5 results, role, 409 / 404 / other); edit role (409 = last admin).
- `Dialog` takes `size="lg"`; `buildInfo.ts` defines `VITE_APP_VERSION` and `VITE_COMMIT_SHA`
  for Vite and Vitest; `renderRoute` takes a `search`.

**Decisions**

- See "What was built" in `docs/plan/08-settings.md`: the workspace name stays read-only, Teams
  opens the members of any of the user's workspaces, members load with "Load more".

**Verified**

- `eslint app test`, `prettier --check .`, `tsc --noEmit` (outside `e2e/`), `vitest run` (516
  passed, 35 of them new in `settings.test.tsx`) and `react-router build` pass. The built app
  carries the commit SHA.
- pnpm was not on the PATH of this machine: the tools ran from `node_modules/.bin`. That
  install has no `@playwright/test`, so `e2e/` and `playwright.config.ts` fail lint and types and
  `pnpm test:e2e` was not run. Those failures were there before this change.
- Not verified: nothing ran in a browser or against a real backend.

**Next**

- Run the settings against a backend: the export (admins only, 202), the delete-account saga,
  user search results, the header-image delete route.
- Import / export files (M7 leftover).
- M8 — `docs/plan/09-extras.md`.

---

## 2026-11-17 — M6 — AI

Implements `docs/plan/07-ai.md`, except the model picker, equations and presentations (M8).

**Done**

- `app/features/ai`: the SSE reader, the AI endpoints, the document rewrite protocol
  (`DocumentRewrite.kt`), the command runner (add, replace, rewrite), the quick actions, the
  writing agent (`WritingAgentController.kt`) and its action executor, the picture for a
  paragraph.
- Editor: an AI answer is a suggestion. The lines it replaces are hidden but still saved, and
  the suggested blocks are not saved until Keep (⌘/Ctrl+Enter); Discard (Esc) puts the lines back.
  A kept answer is undone in one step.
- UI: an "Ask AI" button and ⌘J / Ctrl+J, the bar under the document (field, progress, Stop,
  Keep / Discard), an AI tab in the side panel (command, quick actions with "Apply to", picture
  for the paragraph, tokens used), the suggestions box, and the folder and tag suggestion dialogs.
- FREE users get the premium dialog. When the backend has no AI, the entry points are disabled
  with the reason. A used-up quota (429) gets its own message.
- Playwright: an AI answer saved only once kept, and kept after a reload.

**Decisions**

- See "What was built" in `docs/plan/07-ai.md`. The model picker is not built because the
  backend lists no cloud models.
- Every AI answer, the writing agent's included, goes through Keep / Discard.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (481 passed), `pnpm build` and
  `pnpm test:e2e` (19 passed) pass locally, after the review fixes.
- A fresh review of the branch found one critical and four important defects. All are fixed,
  each with a test that failed first:
  - Critical: an image upload that finished during a suggestion was lost.
  - Important: undo after Keep reverted changes from elsewhere.
  - Important: a cut-off stream was taken as a whole answer.
  - Important: Esc and ⌘Enter in dialogs acted on the answer.
  - Important: a server update showed a replaced line again.
- Not verified: nothing has run against a real backend or a real Gemini stream; Firefox and
  Safari were not tried.

**Next**

- Run the AI against a backend: the stream format, the 403 / 429 bodies, the latency.
- Deferred review minors:
  - A late Discard from a stopped run can hit a new run.
  - When the server deletes the anchor block, an answer being added moves to the end.
  - Find counts hidden lines.
  - An uploading image inside a rewrite stays visible.
  - The agent rescans the whole document on every change.
  - Some failure reasons are untranslated.
  - Every 403 opens the premium dialog.
  - A writing suggestion is declined even when its run was refused.
- M7 — `docs/plan/08-settings.md`.

---

## 2026-11-17 — M5 — Document options

Implements `docs/plan/06-document-options.md`, except comments (M8).

**Done**

- `app/features/document-options`: the header in the title step (none, a colour of the other
  apps' palette, a workspace picture, a picture drawn by the AI), drawn with the crop rule of
  `HeaderPictureCrop`.
- Header editor: swatches, the workspace's pictures, generation with instructions, Use image /
  Try another / Discard, failure and "could not keep it" states.
- "⋯" menu in the editor's top bar: favorite, move, header, icon, tags, lock / unlock, find,
  export Markdown / JSON, publish, delete.
- Tag chips under the title, the tags dialog, the new tag dialog (unique name, AI suggestion).
- Publish dialog with the public link and Copy link; a premium dialog for FREE users and 403s.
- Side panel with a Page tab (header, font, tags, actions, export, publish) and a Text tab
  (styles, highlights, box / card, checkbox, list, code, image, page, link).
- Editor font preference (System, Serif, Monospace, Cursive) in `localStorage`.
- Two Playwright journeys: a header colour kept after a reload, locking from the menu.

**Decisions**

- See "What was built" in `docs/plan/06-document-options.md`.
- Comments are left for M8, as the plan and the milestone table label them.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (373 passed), `pnpm build`
  and `pnpm test:e2e` (18 passed) pass locally, after the review fixes (387 tests).
- A fresh review found one critical and three important defects, all fixed with tests that
  failed first. Critical: a lock, icon or tag change re-published or un-moved a document,
  because `POST /document` overwrites the whole row. Important: overlapping saves, a move
  recorded before it succeeded (and not undone by Undo), and remote changes dropped while
  locked. Seven minors are deferred (see Next).
- The component tests were written after the components, not before them. Each one was
  checked by breaking the code it covers (header exclusivity, the rollback of a refused
  change, keeping a used picture, the title of a metadata save) and watching it fail.
- Not verified: nothing has run against a real backend; whether the header picture CDN
  allows CORS (needed for the crop rule) is unknown; no check in a real browser beyond
  Playwright.

**Next**

- Run the document options against a backend, the CDN's CORS headers in particular.
- Deferred review minors: a failed "keep in library" after closing the dialog is silent; a
  delete with unsent edits can show the "not saved" toast; the crop is read at 768 px with
  fractional luma; downloads revoke their URL after 0 ms (Safari); clicking the header band
  itself does not open the editor; the side menu shows old icons and tags until it refetches;
  cancelling the new-tag dialog during its save still attaches the tag.
- M6 — `docs/plan/07-ai.md`.

---

## 2026-11-17 — M3 + M4 — Text editor

Implements `docs/plan/05-editor.md` except the M8 blocks (spreadsheet, equation, drawing).

**Done**

- `app/features/editor`: a block editor with one `contenteditable` per text block and every
  change going through one reducer (port of ContentHandler / ContentManager.swift).
- Blocks: title, paragraph, H1–H4, checkbox, bullet list, code, divider, box, card, image,
  document link ("Add page"), link card (described by the backend). Unknown and M8 blocks
  show a placeholder and are kept untouched.
- Enter / Backspace / Delete with split and merge, arrows across blocks keeping the column,
  line commands, the "/" menu, the format toolbar (B, I, U, three highlights, link), the link
  dialog, ⌘/Ctrl-click on links, pasted addresses as links or link cards.
- Undo / redo (grouped typing), block selection (drag box, Shift+arrows, ⌘A), copy / cut /
  paste of blocks (Markdown + steps JSON), drag-and-drop reordering, image upload by button,
  paste and drop, find in document, read-only for locked documents, the keyboard map.
- Step sync with a status in the top bar, retry, flush when the page hides, a warning before
  closing with unsaved changes.
- Playwright: `pnpm test:e2e`, 16 journeys in Chromium against a fake backend; added to CI.

**Decisions**

- See "What was built" in `docs/plan/05-editor.md` for the differences from the plan: sync
  by diff against what the server holds, `lastSyncTimestamp` from the loaded steps, changes
  stamped in server time, the title saved through its step, no Tab indentation, a "+" menu in
  place of the side panel.
- Blocks restored by undo after the server deleted them get new ids: the backend never stores
  a deleted id again.
- Leaving a document keeps retrying its unsent changes in the background and says so if they
  are lost.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (317 passed), `pnpm build`
  and `pnpm test:e2e` (16 passed, also repeated) pass locally, on Node 24 installed with
  Homebrew on this machine.
- A fresh review of the branch found one critical and five important defects (undo of a
  deleted line not saved, undo dropping a finished upload, unsent changes lost on leaving,
  focus lost on a box line, clock skew reviving deletions, `---` eating the text after it);
  all fixed with tests.
- Not verified: nothing has run against a real backend; Firefox and Safari (IME, caret) were
  not tried.

**Next**

- Run the editor against a backend.
- Deferred findings of the review: undo after a server update re-sends the old version; a
  local deletion not yet sent can be undone by a server update; Safari IME Enter; merging a
  multi-line code block into a paragraph splits it on the next key; a failed upload moves the
  caret; link cards from other devices are described again; link-card `href` not passed
  through `safeHref`; pasted steps may carry a second title; drop handler `JSON.parse` without
  try/catch; no maximum wait on the 500 ms debounce; reopening right after leaving can read
  stale content; `keepalive` for the flush on page close.
- M5 — `docs/plan/06-document-options.md`.

---

## 2026-11-16 — M2 — App shell and document menu

Implements `docs/plan/04-shell-and-document-menu.md`, except import / export (M7).

**Done**

- Shell: side menu (workspace, Search, Home, Favorites, Documents graph, Settings, folder tree,
  tags), resizable by its edge, collapsible, a drawer on narrow screens.
- Folder tree: lazy, with icons, and per folder: new document, new folder, edit, favorite, move,
  delete; folders and documents can be dragged, folders and Home take drops.
- Document menu for a folder, the favorites and a tag: breadcrumb, cards with previews, grid /
  staggered grid / list, sorting, skeletons, empty, error and premium states.
- Create document and folder, edit folder (name and icon), icon picker, favorite, duplicate,
  delete with confirmation, move by dialog or drag-and-drop with Undo.
- Selection (checkbox, modifier click, drag box) and its bar: favorite, duplicate, move,
  summarize with AI, delete.
- Settings dialog (`?settings=`) with the account and the theme; Search dialog (`?search=`) empty.
- `lucide-react` added: the Compose app draws the same icon set.

**Decisions**

- Summary with AI was built now (it is one request); import / export stays in M7.
- Every change is optimistic over all cached lists and the whole menu is refetched after it.
- The tag view reads the whole workspace, because the backend cannot list by tag.
- `/app/document/:id` and `/app/graph` are placeholders until M3 and M8.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (212 passed) and `pnpm build`
  pass locally.
- In Chrome against `pnpm dev` and a throwaway mock of the API: the three arrangements, the card
  menu, the selection bar, the move dialog, the settings dialog, the list at phone width, and a
  drop of a card on a folder (events sent by script) with its Undo toast. No console errors.
- Not verified: nothing has run against a real backend. A drag with a real mouse, the drag box
  and the drawer were not exercised in the browser.

**Next**

- Run auth and the menu against a backend and fix what differs.
- M3 — `docs/plan/05-editor.md`.

---

## 2026-11-15 — M1 (part 2) — Auth and workspaces

Implements `docs/plan/03-auth-and-workspaces.md`. M1 is complete except for the e2e test.

**Done**

- Account endpoints (`features/auth/api.ts`) and workspace endpoints (`features/workspaces/api.ts`).
- Session: the signed-in user in the query cache, the selected workspace id in `localStorage`,
  the start decision and the route guards.
- Screens: login, sign-up in three steps (email, code, details with username check, password
  strength and the legal texts), email confirmation, forgotten password in three steps, password
  change while signed in, choice and creation of a workspace, account-deletion notice, logout.
- `/app` is guarded and shows a placeholder with the user, the workspace and the logout.
- Shared query cache moved out of `root.tsx` (`core/query/queryClient.ts`) so the loaders can
  read it; `core/storage.ts` for browser preferences.
- The foundation demo page (`routes/home.tsx`) is gone.

**Decisions**

- Login goes to `/` and lets the start logic choose between the app and the workspace choice.
- After confirming an email the user signs in again; the password is not kept in memory for it.
- Passwords must be strong (8 characters and a special character) everywhere one is set.
- An unreachable backend shows an error with Retry; it is never taken for a signed-out user.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (130 passed) and `pnpm build`
  pass locally. The tests drive every screen against the mocked backend, including the failure
  branches.
- In Chrome against `pnpm dev` with no backend running: the login, sign-up and forgotten-password
  screens render; signing in shows the "could not reach the server" message; `/` and `/app` show
  the error screen with Retry.
- Not verified: no flow has run against a real backend, so the cookie session, the real response
  bodies and the status codes are still as read from the Kotlin code. No e2e test yet.

**Next**

- Run the auth flows against a backend (local docker or a deployed one) and fix what differs.
- M2 — `docs/plan/04-shell-and-document-menu.md`.

---

## 2026-11-15 — M1 (part 1) — API client and data models

Implements `docs/plan/02-api-and-data.md`.

**Done**

- `app/core/rank`: port of `Rank.kt` (fractional positions), with the Kotlin tests.
- `app/core/models`: Zod schemas and types for steps, documents, folders, tags, workspaces and
  users; story type, tag and span constants; ARGB colour helpers.
- `app/core/api`: the HTTP client — same-origin `/api`, cookies included, JSON and multipart
  bodies, typed errors, timeout and cancellation, and one shared session renewal on 401
  followed by a retry.
- `test/fixtures` and `test/msw`: builders, two real documents from the other apps, default
  handlers and a signed-in set.

**Decisions**

- Parsed models are complete objects (missing fields get their defaults, nullable fields are
  `null`), so a parsed step can be sent back unchanged.
- Legacy numeric positions are converted to ranks on read, like `RankSerializer`.
- `document.content` is sorted by position on read.
- When the session cannot be renewed the client calls the `onSessionExpired` listeners; the
  redirect to the login screen is wired in the auth work.
- Request and response schemas of individual endpoints are written with each feature, not here.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (73 passed) and `pnpm build`
  pass locally.
- The models parse two documents written by the desktop app.
- Not verified: nothing here has talked to a real backend yet. The multipart upload is tested
  at the `fetch` call only, because jsdom's `FormData` cannot go through Node's `fetch`.

**Next**

- `docs/plan/03-auth-and-workspaces.md`: session store, guards, login, register, forgot
  password, choose workspace.

---

## 2026-11-15 — M0 — Foundation

**Done**

- Scaffolded the app: React 19, React Router 7.18 in SPA mode (`ssr: false`), Vite 8,
  TypeScript 6 (strict), Tailwind 4, TanStack Query, Zustand, Zod, pnpm 12.
- Theme: design tokens ported from the Compose app as CSS variables, light / dark / system and
  the four accent colors, remembered in `localStorage` and applied before first paint
  (`app/core/theme`).
- i18n layer with the first strings (`app/core/i18n`).
- Shared components: Button, TextField, Dialog, Menu, Spinner, Toast (`app/core/ui`).
- Placeholder home route that exercises the theme and the components.
- ESLint (type-checked, react-hooks, jsx-a11y, import sorting, named exports only) and Prettier.
- Vitest + Testing Library + MSW; 23 tests for the theme, i18n, components and the mocked backend.
- Dev proxy for `/api` (`WRITEOPIA_API`, see `.env.example`).
- GitHub Actions: `build-and-test.yml` (pull requests) and `main-merge.yml` (build and deploy).
- `README.md` with local instructions.

**Decisions**

- TypeScript 6 and ESLint 9, not the newest majors: `@react-router/dev` and `typescript-eslint`
  do not accept TypeScript 7 yet, and `eslint-plugin-jsx-a11y` does not accept ESLint 10.
- React Router stays on v7 as planned, although v8 exists.
- The deploy reads the bucket from the repository variable `GCS_BUCKET` and the load balancer
  from `CDN_URL_MAP`; with no bucket set the job only checks and builds. The bucket itself is
  still an open decision.
- MSW 3 renamed the unhandled-request option to `onUnhandledFrame`.
- Playwright is not installed yet; it comes with the first e2e journey in M1.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (23 passed) and `pnpm build`
  (static `build/client/index.html`) all pass locally.
- In Chrome against `pnpm dev`: the page renders, theme and accent switch and survive a reload,
  toast and dialog work, no console errors. The dev proxy forwards `/api` (502 with no backend
  running).
- Not verified: the workflows have never run on GitHub, and nothing was deployed.

**Next**

- Infrastructure for the deploy (bucket, workload identity for this repository, SPA fallback).
- M1 — Auth and workspaces (`docs/plan/02-api-and-data.md`, `03-auth-and-workspaces.md`).

---

## 2026-11-15 — Planning — Implementation plan written

**Done**

- Surveyed the Writeopia repository: client API calls, wire models, backend routes, the Compose
  web entry point, theme, settings, document menu, editor view model, CI workflows.
- Wrote the plan in `docs/plan/` (README + 9 feature documents).

**Decisions**

- None final yet. Four are open in `docs/plan/README.md` → "Decisions to confirm": bucket and
  domain, editor engine, local AI on the web, languages.

**Verified**

- Nothing built yet; no code in the repository.
- Items inferred rather than read end to end are listed in `docs/plan/02-api-and-data.md` →
  "To verify while implementing".

**Next**

- Confirm the open decisions.
- M0 — Foundation (`docs/plan/01-foundation.md`).
