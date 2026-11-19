import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { Spans, StoryTypes, Tags } from "~/core/models";
import { cn } from "~/core/ui";

import { useEditorActions } from "../components/editorContext";
import {
  caretRect,
  getCaret,
  isOnFirstLine,
  isOnLastLine,
  offsetAtPoint,
  setCaret,
} from "../dom/caret";
import { readClipboard, textToBlocks } from "../dom/clipboard";
import { isMacPlatform, type KeyCommand, keyCommand } from "../dom/keymap";
import { type Decoration, safeHref, spansToHtml, textFromDom } from "../dom/spansToDom";
import { isTextBlock, textOf } from "../state/blocks";
import { filterSlashCommands } from "../state/commands";
import { isLink } from "../state/links";
import { find, ordered } from "../state/reducer";
import { setLink as linkSpans } from "../state/spans";
import { useEditorStoreApi } from "../state/store";
import type { Block } from "../state/types";
import { slashName } from "./slashNames";

type EditableTextProps = {
  block: Block;
  readOnly: boolean;
  className?: string;
  placeholder?: string;
  decorations?: Decoration[];
  /** The text role for assistive technology: a heading, a list item... */
  ariaLabel: string;
};

/** The element of a text block, found by the id of its block. */
export function textElement(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-text-id="${CSS.escape(id)}"]`);
}

/**
 * The text of one block, edited in place. The browser edits the DOM while typing; each edit
 * is read back as text and goes through the reducer. The DOM is only written when it no
 * longer shows the state (a format applied, a command, an undo), keeping the caret where
 * the state says. Line breaks, joins and formats are all done by the editor, never by the
 * browser's own editing commands.
 */
export function EditableText({
  block,
  readOnly,
  className,
  placeholder,
  decorations,
  ariaLabel,
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const store = useEditorStoreApi();
  const actions = useEditorActions();
  const id = block.id;

  /** Writes the state into the DOM when the page shows something else. */
  const reconcile = useCallback(() => {
    const element = ref.current;
    if (!element || composing.current) return;
    const { state, search } = store.getState();
    const current = find(state, id)?.block;
    if (!current) return;

    const html = spansToHtml(textOf(current), current.spans, search.open ? decorations : []);
    if (element.innerHTML === html) return;

    const focused = element.ownerDocument.activeElement === element;
    const before = focused ? getCaret(element) : null;
    element.innerHTML = html;
    if (focused) {
      const caret = state.focus?.id === id ? state.focus : before;
      if (caret) setCaret(element, caret.start, caret.end);
    }
  }, [store, id, decorations]);

  useLayoutEffect(reconcile);

  // The browser's own undo and formats would change the DOM behind the state's back.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onBeforeInput = (event: InputEvent) => {
      switch (event.inputType) {
        case "historyUndo":
          event.preventDefault();
          store.getState().undo();
          break;
        case "historyRedo":
          event.preventDefault();
          store.getState().redo();
          break;
        case "formatBold":
        case "formatItalic":
        case "formatUnderline":
          event.preventDefault();
          store.getState().dispatch({
            type: "toggleSpan",
            span:
              event.inputType === "formatBold"
                ? Spans.BOLD
                : event.inputType === "formatItalic"
                  ? Spans.ITALIC
                  : Spans.UNDERLINE,
          });
          break;
        case "insertParagraph":
        case "insertLineBreak": {
          // Reached when no keydown said Enter (some phone keyboards).
          event.preventDefault();
          const caret = getCaret(element) ?? { start: 0, end: 0 };
          store.getState().dispatch({ type: "split", id, start: caret.start, end: caret.end });
          break;
        }
      }
    };
    element.addEventListener("beforeinput", onBeforeInput);
    return () => element.removeEventListener("beforeinput", onBeforeInput);
  }, [store, id]);

  const readInput = () => {
    const element = ref.current;
    if (!element || composing.current) return;
    const caret = getCaret(element);
    const text = textFromDom(element);
    store.getState().dispatch({ type: "input", id, text, cursor: caret?.end ?? text.length });
    reconcile();
  };

  const run = (command: KeyCommand, element: HTMLElement) => {
    const { dispatch, state, undo, redo, setSearch } = store.getState();
    const caret = getCaret(element) ?? { start: 0, end: 0 };

    switch (command) {
      case "split":
        dispatch({ type: "split", id, start: caret.start, end: caret.end });
        return;
      case "eraseAtStart":
        dispatch({ type: "eraseAtStart", id });
        if (store.getState().state.selectedIds.size > 0) actions.focusCanvas();
        return;
      case "deleteAtEnd":
        dispatch({ type: "deleteAtEnd", id });
        if (store.getState().state.selectedIds.size > 0) actions.focusCanvas();
        return;
      case "deleteSelection":
        dispatch({ type: "deleteSelected" });
        return;
      case "previousLine":
      case "nextLine":
      case "previousBlockEnd":
      case "nextBlockStart":
        moveToNeighbour(command, element, caret.end);
        return;
      case "extendUp":
      case "extendDown":
        dispatch({ type: "extendSelection", up: command === "extendUp" });
        actions.focusCanvas();
        return;
      case "selectAll":
        dispatch({ type: "selectAll" });
        actions.focusCanvas();
        return;
      case "bold":
      case "italic":
      case "underline":
        dispatch({
          type: "toggleSpan",
          span:
            command === "bold" ? Spans.BOLD : command === "italic" ? Spans.ITALIC : Spans.UNDERLINE,
        });
        return;
      case "box":
        dispatch({ type: "toggleTag", tag: Tags.HIGH_LIGHT_BLOCK });
        return;
      case "list":
        dispatch({ type: "toggleType", storyType: StoryTypes.UNORDERED_LIST_ITEM });
        return;
      case "link":
        if (caret.start < caret.end) actions.openLinkDialog({ id, ...caret });
        return;
      case "undo":
        undo();
        return;
      case "redo":
        redo();
        return;
      case "find":
        setSearch({ open: true });
        return;
      case "askAi":
        // Selected text asks about its line.
        if (caret.start < caret.end) dispatch({ type: "select", ids: [id] });
        actions.askAi();
        return;
      case "escape":
        if (state.slash) dispatch({ type: "slashClose" });
        else if (state.selectedIds.size > 0) dispatch({ type: "select", ids: [] });
        else element.blur();
        return;
      case "slashUp":
      case "slashDown":
      case "slashPick": {
        const commands = filterSlashCommands(state.slash?.filter ?? "", slashName);
        if (commands.length === 0) {
          dispatch({ type: "slashClose" });
          if (command === "slashPick")
            dispatch({ type: "split", id, start: caret.start, end: caret.end });
          return;
        }
        if (command === "slashPick") {
          const picked = commands[Math.min(state.slash?.highlight ?? 0, commands.length - 1)]!;
          dispatch({ type: "slashPick", command: picked, now: new Date() });
        } else {
          dispatch({
            type: "slashHighlight",
            offset: command === "slashUp" ? -1 : 1,
            count: commands.length,
          });
        }
        return;
      }
    }
  };

  /** The caret goes to the text block above or below, at the same column when it can. */
  const moveToNeighbour = (command: KeyCommand, element: HTMLElement, offset: number) => {
    const { state, dispatch } = store.getState();
    const blocks = ordered(state);
    const index = blocks.findIndex((each) => each.id === id);
    const up = command === "previousLine" || command === "previousBlockEnd";
    let next: Block | undefined;
    for (let at = index + (up ? -1 : 1); at >= 0 && at < blocks.length; at += up ? -1 : 1) {
      if (isTextBlock(blocks[at]!)) {
        next = blocks[at];
        break;
      }
    }
    if (!next) return;

    const length = textOf(next).length;
    let target = up ? length : 0;
    if (command === "previousLine" || command === "nextLine") {
      const rect = caretRect(element);
      const nextElement = element.closest("[data-editor-canvas]")
        ? textElement(element.closest("[data-editor-canvas]")!, next.id)
        : null;
      const box = nextElement?.getBoundingClientRect();
      const atPoint =
        rect && nextElement && box && box.height > 0
          ? offsetAtPoint(nextElement, rect.left, up ? box.bottom - 4 : box.top + 4)
          : null;
      target = atPoint ?? Math.min(offset, length);
    }
    dispatch({ type: "focus", focus: { id: next.id, start: target, end: target }, request: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const element = event.currentTarget;
    const caret = getCaret(element) ?? { start: 0, end: 0 };
    const length = textFromDom(element).length;
    const { state } = store.getState();
    const verticalKey = event.key === "ArrowUp" || event.key === "ArrowDown";

    const command = keyCommand(
      { ...event, isComposing: event.nativeEvent.isComposing || composing.current },
      {
        isMac: isMacPlatform(),
        inText: true,
        caretStart: caret.start,
        caretEnd: caret.end,
        textLength: length,
        onFirstLine: verticalKey ? isOnFirstLine(element) : false,
        onLastLine: verticalKey ? isOnLastLine(element) : false,
        slashOpen: state.slash?.id === id,
        hasBlockSelection: state.selectedIds.size > 0,
        allTextSelected: length === 0 || (caret.start === 0 && caret.end === length),
      },
    );
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    run(command, element);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const element = event.currentTarget;
    const caret = getCaret(element) ?? { start: 0, end: 0 };
    const { dispatch } = store.getState();
    const pasted = readClipboard(event.clipboardData);

    switch (pasted.kind) {
      case "blocks":
        dispatch({ type: "pasteBlocks", caret: { id, ...caret }, blocks: pasted.blocks });
        return;
      case "media":
        actions.insertMedia(pasted.files, id);
        return;
      case "text": {
        // An address pasted on selected text links it.
        if (caret.start < caret.end && isLink(pasted.text)) {
          const current = find(store.getState().state, id)?.block;
          if (current) {
            dispatch({
              type: "updateBlock",
              id,
              changes: {
                spans: linkSpans(current.spans, pasted.text.trim(), caret.start, caret.end),
              },
            });
          }
          return;
        }
        const blocks = textToBlocks(pasted.text);
        if (blocks && block.type.number !== StoryTypes.CODE_BLOCK.number) {
          dispatch({ type: "pasteBlocks", caret: { id, ...caret }, blocks });
        } else {
          dispatch({
            type: "insertText",
            id,
            start: caret.start,
            end: caret.end,
            text: pasted.text.replace(/\r\n?/g, "\n"),
          });
          dispatch({ type: "focus", focus: store.getState().state.focus, request: true });
        }
        return;
      }
      case "nothing":
        return;
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    // A link opens with ⌘/Ctrl+click while editing, with a plain click when reading.
    const opens = readOnly || (isMacPlatform() ? event.metaKey : event.ctrlKey);
    const href = anchor.getAttribute("href");
    if (opens && href && safeHref(href)) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  const onFocus = () => {
    const element = ref.current;
    if (!element) return;
    // When the editor moved the caret here, the state already says where it goes.
    const { state, dispatch } = store.getState();
    if (state.focus?.id === id) return;
    const caret = getCaret(element) ?? { start: 0, end: 0 };
    dispatch({ type: "focus", focus: { id, ...caret } });
  };

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-readonly={readOnly}
      tabIndex={readOnly ? -1 : 0}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      data-text-id={id}
      data-placeholder={placeholder}
      className={cn(
        "wr-editable min-w-0 flex-1 break-words whitespace-pre-wrap outline-none",
        className,
      )}
      onInput={readInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onClick={onClick}
      onFocus={onFocus}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        readInput();
      }}
    />
  );
}
