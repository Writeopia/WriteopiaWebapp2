# 05 — Text editor (M3 core, M4 complete, M8 advanced blocks)

The largest piece of work. In Writeopia the editor is the SDK itself.

Reference:

- State and rules: `Writeopia/writeopia/src/commonMain/` (the core: actions, content handling,
  commands, backstack) and `writeopia_ui/.../manager/WriteopiaStateManager.kt`
- Rendering: `writeopia_ui/.../drawer/content/*Drawer.kt`, `drawer/factory/`, `drawer/TextToolbox.kt`,
  `drawer/content/SlashCommandPopup.kt`, `draganddrop/`, `components/multiselection/`
- App layer: `application/features/editor/.../viewmodel/NoteEditorKmpViewModel.kt`,
  `ui/desktop/DesktopNoteEditorScreen.kt`, `ui/desktop/edit/menu/SideEditorOptions.kt`,
  `ui/screen/TextEditorScreen.web.kt`
- Sync: `plugins/writeopia_persistence_core/.../tracker/OnUpdateStoryStepSyncTracker.kt`
- Swift re-implementation (very useful, same problem solved without Compose):
  `iosAppNat/Packages/` — `WriteopiaStateManager.swift`, `ContentManager.swift`, `Action.swift`,
  `SpansHandler.swift`, `TextCommands.swift`, `SlashCommands.swift`, `FocusHandler.swift`,
  `Positions.swift`, `SnapshotBackstackManager.swift`, and `iosAppNat/editor.md`

## Approach

**A custom block editor**: the document is a list of blocks; each text block is its own
`contenteditable` element; all structure changes go through one reducer.

Why not Lexical / Tiptap / Slate: the wire format is one `StoryStep` per block with a stable id,
a `Rank` position and spans as character offsets, and sync is per step. A rich-text framework
keeps its own tree, so every keystroke would need a lossy round trip (tree → steps → diff →
sync, and back for server updates), and features like box/card tags, per-block decoration and
block-level selection would be fought rather than used. Owning the block model keeps the web
editor behaviourally identical to the Kotlin and Swift ones, and lets their tests be ported.

Cost of this choice: caret handling across blocks, IME/composition, and paste are ours to get
right. They are contained in one module (`editor/dom/`) and covered by Playwright tests.

## Module layout

```
features/editor/
  state/
    types.ts          EditorState, Block (= StoryStep + localId), Selection, Action
    reducer.ts        pure: (state, action) => state      ← port of WriteopiaStateManager/ContentHandler
    commands.ts       line-start commands, slash commands
    spans.ts          span maths (add/remove/toggle/shift/split/merge)
    history.ts        undo/redo snapshots
    store.ts          Zustand store wrapping the reducer
  sync/
    buffer.ts         change buffer + 500 ms debounce
    useDocumentSync.ts
  dom/
    caret.ts          get/set caret by character offset, move between blocks
    spansToDom.ts     text + spans → inline nodes; DOM → text
    keymap.ts         key events → actions
    paste.ts          clipboard → blocks
  blocks/             one component per block type
  components/         Toolbar, SlashMenu, SelectionBox, DragHandle, FindBar, SidePanel
```

### State

```ts
type Block = StoryStep & { localId: string; ephemeral?: boolean; loading?: boolean };
type EditorState = {
  documentId: string;
  order: string[]; // positions (Rank), sorted
  blocks: Record<string, Block>; // by position — mirrors Map<String, StoryStep>
  focus: { position: string; offset: number; anchorOffset?: number } | null;
  selectedPositions: Set<string>; // block-level multi-selection
  lastEdit: LastEdit; // drives sync, same variants as the SDK
  readOnly: boolean;
};
```

`lastEdit` variants to keep (they decide what is synced): `LineEdition`, `BulkEdition`,
`LineBreakEdition`, `InfoEdition`, `Whole`, `Nothing`.

The first block (`Rank.FIRST`) is always the `title` step. It renders as the document header and
title ([06](06-document-options.md)); the document `title` field mirrors its text.

### Rendering

- A text block renders `text` + `spans` to inline elements inside a `contenteditable`. The
  component is uncontrolled while focused: on `input` it reads text back from the DOM, computes
  the edit, dispatches `LineEdition`, and only re-renders the DOM when state diverges (formatting
  applied, undo, server update), restoring the caret by offset.
- Handle `compositionstart/end` so IME input is not interrupted.
- Long documents: virtualise only if profiling demands it (`content-visibility: auto` first).

## Blocks

| Block                          | Behaviour                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Title                          | Large text, first block, cannot be deleted; Enter creates a text block below                                  |
| Text                           | Paragraph. `H1`–`H4` tags make it a heading (title / subtitle / heading sizes)                                |
| Checkbox                       | Toggle `checked`; checked text is struck through; Enter continues the list; Enter on empty turns it into text |
| Bullet list item               | Same continuation rules                                                                                       |
| Code block                     | Monospace, own background; Enter inserts a newline inside                                                     |
| Divider                        | Not editable; selectable and deletable                                                                        |
| Image                          | From `url`; loading state while uploading; resize/caption if the SDK has them                                 |
| Document link ("page")         | Card linking to another document; "Add page" creates a child document and inserts the link                    |
| Link card                      | Web link preview; description filled by `POST …/link-card/describe`                                           |
| Box / Card                     | `HIGH_LIGHT_BLOCK` / `CARD_BLOCK` tags on consecutive blocks draw one shared container                        |
| AI answer / loading / skeleton | Ephemeral or AI output blocks — see [07](07-ai.md)                                                            |
| Spreadsheet                    | M8 — nested `spreadsheet_row` / `spreadsheet_cell` steps; `EditSpreadsheetDialog.kt`                          |
| Equation                       | M8 — LaTeX in `text`, rendered picture in `url`; edit dialog                                                  |
| Drawing                        | M8 — strokes JSON in `text`; see [09](09-extras.md)                                                           |

Always render a trailing empty click area that focuses or creates the last text block
(`LastEmptySpace`). Unknown types render a neutral placeholder and are preserved untouched.

## Inline formatting

Spans: bold, italic, underline, highlight yellow/green/red, link, comment.

- **Selection toolbar** floats above a text selection: B, I, U, highlights, link, comment, AI.
  Reference: `TextToolbox.kt`, Swift `TextSelectionToolbar.swift`.
- Toggle rule: if the whole selection already has the span, remove it; else add it and merge with
  touching spans of the same identity (`SpanInfo.plus`, `intersection`).
- Typing inside or at the end of an expandable span extends it; links do not expand
  (`expandable()`).
- Every text edit shifts/resizes the spans after the caret; split and merge of blocks split and
  re-offset spans. Port the span tests first.
- Links: dialog for the URL, Ctrl/⌘+click opens, pasted URLs are auto-detected
  (`LinkDetector.kt`); a URL alone on a line can become a link card.

## Commands

Typed at the start of a line (`CommandFactory.kt`):

| Typed                     | Result                |
| ------------------------- | --------------------- |
| `# ` `## ` `### ` `#### ` | H1–H4                 |
| `- `                      | Bullet list item      |
| `-[]` or `[]`             | Checkbox              |
| ` ``` `                   | Code block            |
| `---`                     | Divider               |
| `/box`, `/card`           | Box / card decoration |

Commands ending in a space fire on that space, the others as soon as they are complete.

Slash menu — typing `/` opens a popup filtered as you type, arrow keys + Enter to pick
(`SlashCommandPopup.kt`): Today (inserts the date), Now (date and time), Checkbox, List, Box,
Card, Divider. The Swift app's `SlashCommands.swift` may list more — keep the two in line.

## Editing rules

Port from the reducer in `writeopia` core; the essentials:

- **Enter**: split the block at the caret. The new block keeps list/checkbox type and box/card
  tags (`mustCarryOver`), but not heading tags. New position = `Rank.between(current, next)`.
- **Enter on an empty list/checkbox item**: convert it to plain text.
- **Backspace at offset 0**: first strip the block's type/tag (heading → text, list → text);
  if already plain text, merge into the previous text block, placing the caret at the join and
  re-offsetting spans. A non-text previous block (image, divider) gets selected/deleted instead.
- **Delete at end**: merge the next block in.
- **Arrow up/down** at the first/last visual line moves the caret to the adjacent block keeping
  the horizontal position; left/right at the edges cross blocks.
- **Tab / Shift+Tab**: indentation if the SDK supports nesting for lists — check
  `writeopia` core before implementing.

## Keyboard shortcuts

From `KeyboardEvent.kt` (⌘ on macOS, Ctrl elsewhere — confirm the exact keys in the desktop key
handler and in `TextEditorScreen.web.kt`):

bold, italic, underline, box, link, select all, copy, cut, delete selection, undo, redo, find in
document, list, equation, ask AI, accept AI suggestion, cancel (Esc), Shift+↑/↓ to extend the
block selection.

## Undo / redo

Snapshot-based like `SnapshotBackstackManager`: push a snapshot on structural changes and on
typing pauses (group keystrokes), cap the stack size, and route ⌘Z through our history —
never the browser's own contenteditable undo (`beforeinput` `historyUndo` is prevented).

## Multi-block selection (M4)

- Drag a selection box over the margin/blocks (`DragSelectionBox.kt`), or Shift+↑/↓.
- With blocks selected: copy, cut, delete, apply heading/box/card/list/checkbox, send to AI.
- Copy writes Markdown as `text/plain` and a custom MIME type carrying the steps JSON so pasting
  back into Writeopia keeps structure (`CopyManager.kt`, Swift `LinePasteboard.swift`).

## Paste

- Custom MIME → insert the steps with fresh ids and ranks.
- Plain text / Markdown → parse lines into blocks (`# `, `- `, `[ ]`, fences) and inline
  Markdown into spans (`InlineMarkdownParser.kt`).
- Images in the clipboard → upload and insert image blocks.
- HTML: take `text/plain` first; richer HTML mapping can come later.

## Drag and drop (M4)

- A grip handle appears on hover at the left of each block; dragging shows a drop indicator
  between blocks; dropping gives the block a new rank between its new neighbours.
- Dropping image files from the OS on the editor uploads them (`POST /media/upload`) and inserts
  image blocks at the drop position, shown in `loading` state meanwhile.

## Find in document (M4)

Bar with query, "n of m", previous/next, highlights matches across blocks and scrolls to the
current one (`InDocumentSearchBar.kt`, `FindInText.kt`).

## Side panel

The right-hand options panel of the desktop app (`SideEditorOptions.kt`, tabs in
`SideMenuTab`): page style, text options (title / subtitle / heading, highlighting, insert:
checkbox, list, code, box, card, image, drawing, page, link), export, AI. The panel is specified
in [06](06-document-options.md) and [07](07-ai.md); the editor exposes the actions it calls.

## Loading and saving

- **Load**: `GET /{ws}/document/{id}` → sort `content` by `position` → state. Legacy numeric
  positions are converted with `Rank.at(n)`.
- **Save content**: [step sync](02-api-and-data.md#step-sync) — buffer per step id, 500 ms
  debounce, deletions as step ids.
- **Save metadata** (title, icon, favorite, tags, lock): `POST /document` with the document
  without content, debounced for the title.
- **Server updates**: apply `updatedSteps` / `deletedIds` from the sync response unless the user
  is typing in that same block (local wins, it will be sent next).
- **Status indicator**: saved / saving / failed with retry. Warn on `beforeunload` while there
  are unsent changes.
- **Read-only**: `isLocked` documents and the published site view reuse the same block
  components with editing disabled.

Two tabs editing the same document are reconciled only by `lastUpdatedAt` per step (last write
wins), as in the other clients. No live collaboration.

## Tests

- Unit (the bulk): reducer cases ported from the Kotlin `commonTest` suites — split, merge,
  commands, tag carry-over, span shifting, move, selection ops; sync buffer; history.
- Component: each block renders and edits; toolbar toggles; slash menu.
- e2e (Playwright, real browser caret): typing, Enter/Backspace across blocks, arrow navigation,
  paste, undo/redo, IME composition smoke test, reload persists.

## What was built

| Module (`app/features/editor/`) | Contents                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `state/`                        | Types, block helpers, span maths, line and slash commands, reducer, history, store, Markdown, search          |
| `sync/`                         | `StepSync` (diff against what the server holds, 500 ms quiet, 3 tries, status) and `useDocumentSync`          |
| `dom/`                          | Caret offsets, spans to HTML, the key map (pure), the clipboard (Markdown + `application/x-writeopia-steps`)  |
| `blocks/`                       | `EditableText` (one `contenteditable` per text block) and `BlockContent` (every block type)                   |
| `components/`                   | The editor screen, the canvas, the format toolbar, the slash menu, the find bar, the link dialog, the top bar |
| `api.ts`                        | Step sync, image upload, link card description                                                                |

Differences from the plan above:

- Sync compares the blocks with what the server holds instead of following each `LastEdit`
  variant: no edit can be missed, and an edit made during a request goes in the next one.
  `lastEdit` is kept only to group typing in the history.
- `lastSyncTimestamp` starts at the newest `lastUpdatedAt` of the loaded steps: the backend
  refuses to delete a step changed after it, so 0 would refuse every deletion.
- The title is saved through its step: the backend copies the title step's text into the
  document. No separate metadata request; the menu is patched locally.
- The focus and the block selection are kept by step id, not by position.
- Enter on an empty list item ends the list (this plan); the Swift app adds another item.
- No Tab indentation: the SDK has no nesting.
- The side panel is not built (06). A "+" menu in the top bar carries the block actions:
  title / subtitle / heading, checkbox, list, code, box, card, divider, image, page.
- Not yet: ask AI, accept AI (07), equation (M8) shortcuts; comments (M8) only render their span.

## Tasks

M3 — core

- [x] State types, reducer skeleton, store
- [x] Load document and render title + text blocks
- [x] `dom/caret.ts`, text input → `LineEdition`, composition handling
- [x] Enter / Backspace / Delete / merge / split with spans
- [x] Arrow navigation between blocks
- [x] Span maths + selection toolbar (bold, italic, underline, highlights)
- [x] Links (dialog, open, auto-detect)
- [x] Line commands and slash menu
- [x] Blocks: headings, checkbox, bullet list, code block, divider, box, card
- [x] Undo / redo
- [x] Step sync (buffer, debounce, retry, status indicator), metadata save
- [x] Reducer and span test suites

M4 — complete

- [x] Image block + upload (button, paste, drop)
- [x] Document link block + "add page"
- [x] Link card block + description
- [x] Multi-block selection (drag box, shift+arrows) and its actions
- [x] Copy / cut / paste (custom MIME + Markdown)
- [x] Drag-and-drop reordering
- [x] Find in document
- [x] Read-only mode
- [x] Keyboard shortcut map
- [x] Playwright editor suite

M8 — advanced blocks

- [ ] Spreadsheet
- [ ] Equation
- [ ] Drawing
