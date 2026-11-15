# 04 — App shell and document menu (M2)

Reference: `Writeopia/application/features/global_shell/` (`SideGlobalMenu.kt`,
`BackendSideMenuSource.kt`), `application/features/note_menu/` — especially
`viewmodel/onlybe/OnlyBackendChooseNoteKmpViewModel.kt`, which is the **online-only** menu the
Compose web app uses and the closest thing to a spec for this milestone — plus
`ui/screen/documents/NotesCardsScreen.kt`, `ui/screen/configuration/`, `ui/screen/menu/`.
Desktop layout: `application/composeApp/.../DesktopApp`.

## Routes

| Route                       | View                                 |
| --------------------------- | ------------------------------------ |
| `/app`                      | Redirects to the root folder         |
| `/app/folder/:folderId`     | Folder contents                      |
| `/app/favorites`            | Favorite documents                   |
| `/app/tag/:tagId`           | Documents with a tag                 |
| `/app/document/:documentId` | Editor ([05](05-editor.md))          |
| `/app/graph`                | Documents graph ([09](09-extras.md)) |

Search and Settings are dialogs over the current route (`?search=1`, `?settings=account`), so the
browser back button closes them.

## Shell layout

```
┌──────────────┬──────────────────────────────────────────┐
│ Side menu    │ Top bar: breadcrumb · display · sort · + │
│  workspace   ├──────────────────────────────────────────┤
│  Search      │                                          │
│  Home        │  Content (menu / editor / graph)         │
│  Favorites   │                                          │
│  Graph       │                                          │
│  Settings    │                                          │
│  ─────────   │                                          │
│  Folder tree │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- Side menu is resizable by dragging its edge and collapsible; width is saved
  (`UiConfiguration.sideMenuWidth`) in `localStorage`.
- Folder tree: lazy — expanding a folder fetches its contents. Shows icons with tint, lets you
  open, rename, change icon, create a child document/folder, delete, and drop items onto folders.
- Below a mobile breakpoint the side menu becomes a drawer.

## Data

Queries (TanStack Query keys in brackets):

- `folderContents(ws, folderId)` → `GET /{ws}/folder/{id}/contents/preview?steps=7` — folders
  plus documents with their first steps, enough to draw preview cards.
- `folderPath(ws, folderId)` → breadcrumb.
- `favorites(ws)` → `GET /{ws}/user/favorites`.
- Tags come with the folder contents (`tags`).

Online-first behaviour: refetch on window focus and on navigation; every mutation updates the
cache optimistically and invalidates the affected folder(s).

## Document menu

Items are folders first, then documents. Each **document card** shows the icon, title
("Untitled" when empty) and a preview rendered from the first steps with read-only block
renderers (text, headings, checkboxes, list items, image, header colour/picture). Reference
preview drawers: `Writeopia/writeopia_ui/.../drawer/preview/`. Each **folder card** shows icon,
title and item count.

### Change display of documents

`NotesArrangement`: `list`, `grid`, `staggered_grid` (masonry — cards as tall as their preview).
Implement masonry with CSS columns. Saved per user in `localStorage`.

### Sorting

`OrderBy`: `title`, `created_at`, `last_updated_at` (default). Sort client-side after fetch;
saved in `localStorage`.

### Creating

- **New document**: generate an id, `POST /document` with an empty document in the current
  folder, navigate to the editor.
- **New folder**: dialog with name and icon → `POST /{ws}/folder/{parentId}/create`.

### Item actions (context menu / card menu)

| Action             | Document                       | Folder                        |
| ------------------ | ------------------------------ | ----------------------------- |
| Open               | ✓                              | ✓                             |
| Rename             | in editor                      | `PUT /folder/{id}`            |
| Change icon + tint | `POST /document`               | `PUT /folder/{id}`            |
| Favorite           | `POST /document/{id}/favorite` | `PUT /folder/{id} {favorite}` |
| Duplicate          | `POST /document/clone`         | —                             |
| Move to…           | `POST /document/{id}/move`     | `POST /folder/{id}/move`      |
| Delete             | `POST /document/delete`        | `DELETE /folder/{id}`         |

Icon picker: the icon set and tint colours come from
`Writeopia/application/core/utils/.../icons/` and `ColorUtils.tintColors()`. Stored as
`{label, tint}`; the label must match the names the other apps use so icons render everywhere —
port the label → icon table (Swift has one in `MenuIcons.swift`).

### Selection and bulk actions

Click with a modifier key, a checkbox on hover, or a drag box selects several items. A selection
bar offers: delete (with a confirmation listing the titles), duplicate, favorite, move, and
**Summarize with AI**. Bulk delete of a selection containing folders warns that their contents go
too.

### Moving

- "Move to" dialog with the folder tree.
- Drag-and-drop a card onto a folder card, a breadcrumb segment, or a folder in the side tree.
- After a move show a snackbar "“X” moved to “Y”" with Undo (`FolderMoveSnackbar.kt`).

### Summary with AI

Selection bar → "Summarize": `POST /{ws}/document/generate-summary` with the selected documents,
the current folder as `targetFolderId`, optional title and model.

- 201 → a new document appears in the folder; open it or show a toast with a link.
- 409 → some documents are not synced on the server; on the web this should not happen, retry
  with `ignoreSyncCheck: true`.
- 503 → "AI is not available".
- Free tier → premium dialog.

Reference: `DocumentsSummarizer.kt`, `GenerateSummaryUseCase.kt`.

### Empty and error states

Empty folder ("Create a note" call to action), empty favorites, empty tag, load error with retry,
skeleton cards while loading.

## Import / export from the menu (M7)

- Import: pick `.md`/`.txt`/`.json` files, convert to documents (Markdown → steps parser, port of
  `Writeopia/plugins/writeopia_import_document`), upsert.
- Export the current folder as Markdown or TXT: fetch each document, convert, download as a zip.

## Tests

- Unit: sorting, selection reducer, optimistic cache updates, preview rendering of each block.
- Component: each display mode, create/rename/delete/move flows with MSW, bulk delete
  confirmation, summary result branches.

## Tasks

- [ ] Shell layout, resizable/collapsible side menu, mobile drawer
- [ ] Side menu items and workspace header
- [ ] Folder tree with lazy loading
- [ ] Folder route: breadcrumb, cards, skeletons, empty/error states
- [ ] Preview renderers for document cards
- [ ] Display modes (list / grid / staggered) with persistence
- [ ] Sorting with persistence
- [ ] New document, new folder dialog
- [ ] Icon picker (shared with the editor)
- [ ] Item actions: rename, icon, favorite, duplicate, delete
- [ ] Selection + bulk actions bar
- [ ] Move dialog, drag-and-drop move, undo snackbar
- [ ] Favorites and tag views
- [ ] Summary with AI (M6)
- [ ] Import / export (M7)
