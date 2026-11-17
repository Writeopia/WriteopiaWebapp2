# 09 — Extras

Features that hang off the main flows. Milestone noted per section.

## Search (M4)

Reference: `Writeopia/application/features/search/` (`SearchDialog.kt`, `SearchApi.kt`,
`SearchSnippet.kt`, `SearchKmpViewModel.kt`).

- A dialog opened from the side menu or ⌘K / Ctrl+K.
- Empty query: "Recent" documents.
- Typing (debounced): `GET /api/docs/workspace/{ws}/document/search` → documents and
  presentations. Show title, icon, and a snippet with the match highlighted.
- Arrow keys + Enter to open; Esc closes.

## Published site view (M5)

Reference: `application/features/editor/.../features/site/` (`SiteScreen.kt`, `SiteViewModel.kt`),
`MainWeb.kt` (`/site/{documentId}` handling).

- Route `/site/:documentId`, **public**: no session, no shell.
- `GET /api/site/{documentId}` → the document; render with the read-only block components,
  header included; follows the visitor's theme preference.
- Not found / not published → a friendly 404.
- This URL is what the Publish dialog hands out, so it must keep working across the cut-over
  (the bucket/LB fallback must serve `index.html` for `/site/*`).

## Documents graph (M8)

Reference: `application/features/documents_graph/` (`ForceLayout.kt`, `GraphGrouping.kt`,
`GraphItemCard.kt`), `application/core/forcegraph/`.

- A force-directed graph of folders, documents and tags of the workspace; edges are
  folder → child and document → tag (see `GraphGrouping.kt` for the grouping modes).
- Hover/click a node shows a card with details; double-click opens it.
- Pan and zoom. Render on `<canvas>`; layout with `d3-force` (or a port of `ForceLayout.kt` if
  the look must match exactly).
- Data: walk the folder tree through the folder-contents endpoint, cached by TanStack Query.

## Drawing (M8)

Reference: `application/features/drawing/`, `writeopia_models/.../drawing/` (`DrawingData`,
`Stroke`, `DrawPoint`, `DrawingTool`). Swift: `DrawingCanvas.swift`, `StrokeRenderer.swift`.

- A `drawing` block stores `DrawingData` JSON in `text`; the editor shows a preview.
- Drawing screen/dialog: canvas with pointer events (pressure when available), tools, colours,
  stroke width, eraser, undo/redo, save back to the step.
- Drawing options: convert to equation (`POST /api/ai/equation/recognize`).
- Keep the JSON format byte-compatible with the other apps — add a fixture test using a drawing
  made on desktop.

## Notifications (M8)

Reference: `application/features/notifications/NotificationsScreen.kt`. The screen exists but is
minimal; port whatever it shows at the time, or leave a placeholder route if it is still empty.

## Cut-over and hardening (M9)

- Playwright suite covering: auth flows, menu management, the editor suite, header, AI (mocked),
  settings.
- Accessibility: keyboard reachability of every action, focus management in dialogs, labels,
  contrast in both themes for all four accents.
- Performance budget: initial JS, time to interactive on the menu, typing latency on a
  1 000-block document; code-split the editor, graph and drawing routes.
- Error reporting and a global error boundary; offline banner when requests fail by network.
- Feature parity check against the Compose web app, then switch the load balancer / bucket and
  retire `web_build_and_publish` in the Writeopia repo.

## Tasks

- [x] Search dialog (M4)
- [x] Site view (M5)
- [x] Documents graph (M8)
- [x] Drawing block + canvas (M8)
- [x] Notifications (M8)
- [ ] e2e suite, accessibility, performance (M9)
- [ ] Cut-over (M9)

## What was built

| Module                               | Contents                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `app/features/search/`               | `snippet.ts` (port of `SearchSnippet.kt` and `FtsQuery.tokens`), `api.ts`, `SearchDialog`       |
| `app/features/site/` + `routes/site` | `GET /api/site/{id}` without a session, `SitePage` over `editor/components/ReadOnlyDocument`    |
| `app/features/graph/`                | `layout.ts` (port of `ForceLayout.kt`), `model.ts` (workspace walk, groupings, details), canvas |
| `app/features/drawing/`              | `model.ts` (DrawingData JSON), `render.ts`, `history.ts`, `api.ts` (equation), dialog, block    |
| `routes/app/notifications.tsx`       | "No notifications", linked from the side menu                                                   |
| `core/ui/OfflineBanner.tsx`          | Banner while the browser is offline or a request cannot reach the server                        |

Differences from the plan above:

- **Search**: ⌘K / Ctrl+K and the side menu open it. "Recent" is the 12 most recently updated
  documents of the workspace (the folder walk the tag view uses). A presentation result opens
  the document it was made from: the web has no presentations yet. FREE users see the premium
  message.
- **Graph**: no `d3-force`; `ForceLayout.kt` is ported, so the look matches the other apps.
  Groupings: folders and tags. A list of the nodes is kept for the keyboard and screen readers.
  A dropped node heats the layout to 0.3 so its neighbours settle back (the Compose app stops).
- **Drawing**: added from the document's actions menu ("Add drawing"); the block offers Edit and
  Convert to equation (`POST /api/ai/equation/recognize`, the step becomes an `equation`). The
  JSON is written byte for byte as kotlinx.serialization does, tested against the fixture of
  `DrawingTests.swift`. The eraser removes pixels from a transparent layer instead of painting
  the background color.
- **Site**: the bucket / load-balancer fallback that serves `index.html` for `/site/*` is
  infrastructure, not in this repo; it still has to be checked before the cut-over.
- **M9** is not done: no Playwright suite (`@playwright/test` is not installed in this checkout),
  no accessibility or performance audit, no cut-over. Done from it: route code-splitting (React
  Router splits per route; the graph is its own chunk), the error boundary (already in
  `root.tsx`) and the offline banner.
