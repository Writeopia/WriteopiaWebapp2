# 06 — Document options (M5)

Everything around the text: the customizable header, icon, tags, font, export, publishing and
comments.

Reference: `Writeopia/application/features/editor/.../configuration/ui/` (`HeaderEdition.kt`,
`HeaderEditionOptions.kt`, `DocumentIconPicker.kt`, `NoteGlobalActionsMenu.kt`),
`.../viewmodel/HeaderImagesController.kt`, `HeaderImagesState.kt`,
`.../ui/desktop/edit/menu/SideEditorOptions.kt`, `.../ui/tags/`, `.../ui/publish/`,
`.../ui/comments/`, `writeopia_ui/.../drawer/content/HeaderDrawer.kt`,
`writeopia_ui/.../image/HeaderImage.kt`, `HeaderPictureCrop.kt`.
Swift: `HeaderImagesService.swift`, `HeaderImagesModel.swift`, `HeaderPictureCrop.swift`.

## Customizable header

### How it is stored

The header **is the first step** of the document (position `Rank.FIRST`, type `title`):

| Header  | Stored as                                               |
| ------- | ------------------------------------------------------- |
| None    | `url: null`, `decoration.backgroundColor: null`         |
| Colour  | `decoration.backgroundColor = <ARGB int>`, `url: null`  |
| Picture | `url = <image URL>`, `decoration.backgroundColor: null` |

Colour and picture are mutually exclusive: picking one clears the other
(`onHeaderColorSelection`, `onHeaderImageSelection`). The change is an ordinary step edit, so it
is saved through step sync and shows on every client and in the menu preview cards.

### Rendering

- No header: just the title.
- Colour: a band of that colour behind the title area; title text colour chosen for contrast.
- Picture: a cover image, cropped with the same focal rule as `HeaderPictureCrop` so the web
  shows the same region as desktop and iOS.
- Clicking the header (when editable) opens the header editor.

### Header editor (popover / sheet)

1. **Colours** — a row of swatches: "no colour" first, then the palette from
   `ColorUtils.headerColors()` (`Writeopia/application/core/utils/.../colors/ColorUtils.kt`).
   The selected swatch is wider with rounder corners.
2. **Images** — a grid of the workspace's header pictures:
   `GET /api/ai/header-images/{ws}` → `{images: [{id, url, createdAt}]}`. Click to apply.
3. **Generate with AI** (shown when `canGenerate`: online workspace, cloud AI available, premium):
   - Optional instructions text field ("what should the picture show?"), with the note
     "Uses your AI tokens".
   - **Generate** → `POST /api/ai/header-image`
     `{workspaceId, documentTitle, documentText, instructions}` → `{imageUrl}`. Show
     "Generating image…" with a cancel.
   - Result panel with a preview and three actions:
     - **Use image** → set it as the header **and** save it to the workspace library:
       `POST /api/ai/header-images/{ws} {imageUrl}`.
     - **Try another** → generate again with the same instructions.
     - **Discard** → drop the picture.
   - Errors: generation failed (retry), save to workspace failed (the header still applies).

State machine (`HeaderImageGeneration`): `Idle → Generating → Generated(url) → Idle`, with
`Failed` from `Generating`.

`documentText` is the document as plain text; the backend truncates it.

Managing the library (deleting pictures) is in Settings → Workspace ([08](08-settings.md)).

## Document actions

The "⋯" menu of the editor top bar (`NoteGlobalActionsMenu.kt`):

| Action                | How                                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| Favorite / unfavorite | `POST /{ws}/document/{id}/favorite`                                     |
| Move to…              | folder picker → `POST /{ws}/document/{id}/move`                         |
| Document icon         | icon + tint picker (shared with the menu), or remove → `POST /document` |
| Tags                  | opens the tags dialog                                                   |
| Lock document         | sets `isLocked` → editor becomes read-only until unlocked               |
| Find                  | opens find in document                                                  |
| Delete                | confirm → `POST /{ws}/document/delete` → back to the folder             |

## Tags

- Chips under the title show the document's tags (`DocumentTagChips.kt`).
- Tags dialog: the workspace catalogue with checkboxes; "none" state.
- Add tag dialog: name + description → upsert in the catalogue (`POST /api/docs/workspace/tag`)
  and attach to the document (`tagIds`, via `POST /document`). Name must be unique.
- **Suggest with AI**: `POST /api/ai/tag-create` `{documentTitle, documentText, existingTagNames}`
  → a draft `{name, description}` the user can edit before saving.

## Font

Editor font family: System, Serif, Monospace, Cursive (`Font.kt`). A user preference, stored in
`localStorage`, applied to the editor content via a CSS variable.

## Text options panel

The side panel's text tab: Title / Subtitle / Heading (H1–H3 tags), highlighting colours,
decoration (Box, Card), and insert (Checkbox, List, Code, Image, Drawing, Page, Link). Each calls
an editor action on the focused block or the selected blocks.

## Export

- **Markdown**: convert steps → Markdown (port `Writeopia/plugins/writeopia_export` /
  Swift `DocumentToMarkdown.swift`) and download `<title>.md`.
- **JSON**: the `Document` wire object, downloaded as `<title>.json` — the same shape the other
  apps import.

Both are client-side `Blob` downloads.

## Publish to web

Dialog (`PublishDialog.kt`):

- State from `GET /{ws}/document/{id}/published`.
- **Publish** → `POST …/publish`; then show the public link `https://<host>/site/<documentId>`
  with **Copy link** ("Link copied").
- **Unpublish** → `POST …/unpublish`.
- Premium only: FREE tier or a 403 opens the premium dialog ("This feature is only available for
  premium users using an online workspace").

The public page itself is in [09](09-extras.md).

## Comments (M8)

Comments are conversations attached to a text range by a `COMMENT` span whose `extra` is the
conversation id; the conversations live on the document (`commentConversations`).

- Selection toolbar → comment → type the first comment.
- Clicking commented text opens the thread overlay: add a reply, delete a comment, delete the
  conversation (which also removes the span).
- Saved through step sync (span) and `POST /document` (conversations).

Reference: `CommentThreadOverlay.kt`, `CommentUiState.kt`, `CommentExtensions.kt`.

## Tests

- Unit: header state transitions (colour ↔ picture exclusivity), generation state machine,
  steps → Markdown conversion (port the Kotlin export tests), ARGB conversions.
- Component: header editor with MSW (list, generate, use, try another, discard, failures), tags
  dialogs, publish dialog incl. premium branch.

## What was built

| Module (`app/features/document-options/`) | Contents                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `header.ts`                               | The header in the title step (none / colour / picture), the palette, the crop rule         |
| `generation.ts`                           | The state machine of a picture drawn by the AI                                             |
| `export.ts`                               | Markdown and JSON of the open document, the plain text for the AI, the download            |
| `font.ts`                                 | The editor font preference                                                                 |
| `api.ts`                                  | AI status, header pictures, header generation, tag catalogue, AI tag, publishing           |
| `components/`                             | The provider of the options, the title frame, the dialogs, the "⋯" menu and the side panel |

Differences from the plan above:

- **Use image** puts the picture in the header at once and keeps it with the workspace's
  pictures in the background, as this plan says. The Kotlin app keeps it first and applies it
  after. When keeping fails the header stays and the panel offers "Keep it again".
- The editor holds the document's own fields (icon, tags, lock, favorite, folder) in
  `DocumentOptionsProvider`. They are saved with `POST /document` without steps, **with the
  title of the title step**. That endpoint also writes the title, so the title the document
  was opened with would undo a rename.
- `POST /document` overwrites every column of the document (published, folder, deleted,
  favorite...), not only the fields that changed. So `DocumentMetadata` builds each request from
  what the server holds, updated by the endpoints that change it (publish, move, delete), plus
  the changes made here. Requests go one at a time; changes made meanwhile leave together. A
  refused request drops only its own changes. Favorite toggles are serialised the same way.
- Server updates from step sync reach the editor while the document is locked. Otherwise step
  sync would count those steps as known and delete them on the server after an unlock.
- The editor draws the title through a `TitleFrameContext` slot, so `editor/` does not know
  about the header, the icon or the tags.
- The header picture is read a second time with CORS to find the drawing's rows. When the CDN
  does not allow that, the picture is shown whole, centred like `object-fit: cover`.
- The "+" menu of the editor stays next to the new side panel.
- The tag catalogue is read from the root folder's contents (any folder answers it).
- Generating pictures and suggesting tags need a PREMIUM user and `/ai/status` answering
  `available`.
- The public link uses this app's own origin: `<origin>/site/<documentId>`.

## Tasks

- [x] Header rendering: none / colour / picture (with crop rule)
- [x] Header editor: colour swatches
- [x] Header editor: workspace images grid
- [x] Header editor: AI generation (instructions, generate, use / try another / discard)
- [x] Document actions menu (favorite, move, icon, lock, find, delete)
- [x] Tag chips, tags dialog, add tag dialog, AI tag suggestion
- [x] Font preference
- [x] Side panel: page style + text options tabs
- [x] Export Markdown / JSON
- [x] Publish dialog + premium dialog
- [ ] Comments (M8)
