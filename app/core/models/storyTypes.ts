/**
 * The types of a step, as StoryTypes.kt of the SDK defines them. A type travels as its name
 * and its number; the number is what the apps switch on.
 */
export const StoryTypes = {
  TEXT: { name: "message", number: 0 },
  TEXT_BOX: { name: "message_box", number: 1 },
  IMAGE: { name: "image", number: 2 },
  GROUP_IMAGE: { name: "group_image", number: 3 },
  AUDIO: { name: "audio", number: 4 },
  GROUP_VIDEO: { name: "group_video", number: 5 },
  VIDEO: { name: "video", number: 6 },
  SPACE: { name: "space", number: 7 },
  LAST_SPACE: { name: "last_space", number: 8 },
  ADD_BUTTON: { name: "add_button", number: 9 },
  CHECK_ITEM: { name: "check_item", number: 10 },
  TITLE: { name: "title", number: 11 },
  UNORDERED_LIST_ITEM: { name: "unordered_list_item", number: 16 },
  ON_DRAG_SPACE: { name: "on_drag_space", number: 17 },
  AI_ANSWER: { name: "ai_answer", number: 18 },
  LOADING: { name: "loading", number: 19 },
  DOCUMENT_LINK: { name: "document_link", number: 20 },
  DIVIDER: { name: "divider", number: 21 },
  EQUATION: { name: "equation", number: 22 },
  CODE_BLOCK: { name: "code_block", number: 23 },
  LINK_CARD: { name: "link_card", number: 24 },
  SKELETON: { name: "skeleton", number: 25 },
  DRAWING: { name: "drawing", number: 100 },
  SPREADSHEET: { name: "spreadsheet", number: 101 },
  SPREADSHEET_ROW: { name: "spreadsheet_row", number: 102 },
  SPREADSHEET_CELL: { name: "spreadsheet_cell", number: 103 },
} as const satisfies Record<string, { name: string; number: number }>;

export type StoryTypeKey = keyof typeof StoryTypes;

const keysByNumber = new Map<number, StoryTypeKey>(
  (Object.keys(StoryTypes) as StoryTypeKey[]).map((key) => [StoryTypes[key].number, key]),
);

/** The known type with this number; null for a type this app does not know. */
export function storyTypeKey(type: { number: number }): StoryTypeKey | null {
  return keysByNumber.get(type.number) ?? null;
}

export function isStoryType(type: { number: number }, key: StoryTypeKey): boolean {
  return type.number === StoryTypes[key].number;
}

/** Types that only exist while drawing the editor. They are never saved nor sent. */
const UI_ONLY: ReadonlySet<number> = new Set(
  (["SPACE", "LAST_SPACE", "ADD_BUTTON", "ON_DRAG_SPACE", "LOADING", "SKELETON"] as const).map(
    (key) => StoryTypes[key].number,
  ),
);

export function isUiOnlyStoryType(type: { number: number }): boolean {
  return UI_ONLY.has(type.number);
}

/** The tags of a step (Tag.kt). They are sent by these labels. */
export const Tags = {
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
  HIGH_LIGHT_BLOCK: "HIGH_LIGHT_BLOCK",
  CARD_BLOCK: "CARD_BLOCK",
  CODE_BLOCK: "CODE_BLOCK",
  COLLAPSED: "COLLAPSED",
  AI_SUGGESTION: "AI_SUGGESTION",
  FIRST_AI_SUGGESTION: "FIRST_AI_SUGGESTION",
} as const;

export type Tag = (typeof Tags)[keyof typeof Tags];

export const TITLE_TAGS: readonly Tag[] = [Tags.H1, Tags.H2, Tags.H3, Tags.H4];

/** Tags that follow the writer to the next line on Enter: the box and the card. */
export function tagCarriesOver(tag: string): boolean {
  return tag === Tags.HIGH_LIGHT_BLOCK || tag === Tags.CARD_BLOCK;
}

/** The spans of a text (Span in SpanInfo.kt). They are sent by these labels. */
export const Spans = {
  BOLD: "BOLD",
  ITALIC: "ITALIC",
  UNDERLINE: "UNDERLINE",
  HIGHLIGHT_YELLOW: "HIGHLIGHT",
  HIGHLIGHT_GREEN: "HIGHLIGHT_GREEN",
  HIGHLIGHT_RED: "HIGHLIGHT_RED",
  LINK: "LINK",
  COMMENT: "COMMENT",
} as const;

export type Span = (typeof Spans)[keyof typeof Spans];
