import { GripVertical } from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { t } from "~/core/i18n";
import { Spans, StoryTypes, Tags } from "~/core/models";
import { cn } from "~/core/ui";
import { useDragBox } from "~/features/menu/useDragBox";

import { BlockContent } from "../blocks/BlockContent";
import { textElement } from "../blocks/EditableText";
import { groupParts, rowClasses, selectionParts } from "../blocks/groups";
import { getCaret, setCaret } from "../dom/caret";
import { readClipboard, textToBlocks, writeBlocks } from "../dom/clipboard";
import { isMedia } from "../dom/files";
import { isMacPlatform, keyCommand } from "../dom/keymap";
import { hasTag, isTextBlock, isTitle, newBlock } from "../state/blocks";
import { ordered } from "../state/reducer";
import { decorationsByBlock, findMatches } from "../state/search";
import { useEditor, useEditorStoreApi } from "../state/store";
import type { Block } from "../state/types";
import { useEditorActions } from "./editorContext";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";

/** The type of a block dragged by its handle, carrying the ids of the blocks moved. */
const BLOCKS_MIME = "application/x-writeopia-blocks";

type DropTarget = { id: string; after: boolean };

/**
 * The page of the editor: the blocks in order, the handles to move them, the selection of
 * whole blocks, the drops, and the popups that follow the caret.
 */
export function EditorCanvas() {
  const store = useEditorStoreApi();
  const actions = useEditorActions();
  const canvasRef = useRef<HTMLDivElement>(null);
  const state = useEditor((s) => s.state);
  const search = useEditor((s) => s.search);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [lineDrag, setLineDrag] = useState(false);

  // The lines an AI answer replaces are hidden until the answer is kept or discarded.
  const blocks = useMemo(() => ordered(state).filter((block) => !block.hidden), [state]);
  // Nothing is edited while an AI answer waits to be kept or discarded.
  const locked = state.readOnly || state.suggestion !== null;
  const matches = useMemo(
    () => (search.open ? findMatches(state, search.query) : []),
    [state, search.open, search.query],
  );
  const decorations = useMemo(
    () => decorationsByBlock(matches, Math.min(search.index, matches.length - 1)),
    [matches, search.index],
  );

  // The caret goes where the state asks, after the blocks drew their text.
  useLayoutEffect(() => {
    const { focus } = store.getState().state;
    const canvas = canvasRef.current;
    if (!focus || !canvas) return;
    const element = textElement(canvas, focus.id);
    if (!element) return;
    element.focus({ preventScroll: true });
    setCaret(element, focus.start, focus.end);
    element.scrollIntoView?.({ block: "nearest" });
  }, [state.focusRequest, store]);

  // The state follows the caret when it moves by mouse or by the keys the browser handles.
  useEffect(() => {
    const onSelectionChange = () => {
      const active = document.activeElement as HTMLElement | null;
      const id = active?.dataset.textId;
      if (!active || !id || !canvasRef.current?.contains(active)) return;
      const caret = getCaret(active);
      if (!caret) return;
      const { state: current, dispatch } = store.getState();
      const focus = current.focus;
      if (focus?.id === id && focus.start === caret.start && focus.end === caret.end) return;
      dispatch({ type: "focus", focus: { id, ...caret } });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [store]);

  // A press outside the editor lets go of the selected lines. The side panel and the
  // controls (buttons, menus, dialogs) act on them, so a press there keeps them.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const { state: current, dispatch } = store.getState();
      if (current.selectedIds.size === 0) return;
      const target = event.target as Element | null;
      if (!target || canvasRef.current?.parentElement?.contains(target)) return;
      if (
        target.closest(
          "[data-keeps-selection], button, a, input, textarea, select, [role='menu'], [role='dialog'], [role='listbox']",
        )
      ) {
        return;
      }
      dispatch({ type: "select", ids: [] });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [store]);

  const select = (ids: string[]) => {
    store.getState().dispatch({ type: "select", ids });
    if (ids.length > 0) actions.focusCanvas();
  };

  // A click (not a drag) on the empty space around the lines lets go of them too.
  const dragBox = useDragBox(select, () => select([]), {
    selector: "[data-block-id]",
    id: (element) => element.dataset.blockId ?? "",
    surface: "[data-drag-surface]",
  });

  /**
   * A press on a line that is dragged out of it selects whole lines: the browser keeps a
   * selection of text inside the line it started in, so it never reaches the next one.
   */
  const onLinePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return;

    const pressed = event.target as HTMLElement;
    const origin = pressed.closest<HTMLElement>("[data-block-id]");
    if (!origin || pressed.closest("button, input, [role='menu']")) return;

    const container = event.currentTarget;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (move: PointerEvent) => {
      if (!dragging) {
        const rect = origin.getBoundingClientRect();
        if (move.clientY >= rect.top && move.clientY <= rect.bottom) return;
        dragging = true;
        setLineDrag(true);
      }
      const top = Math.min(startY, move.clientY);
      const bottom = Math.max(startY, move.clientY);
      document.getSelection()?.removeAllRanges();
      select(
        Array.from(container.querySelectorAll<HTMLElement>("[data-block-id]"))
          .filter((line) => {
            const rect = line.getBoundingClientRect();
            return rect.top < bottom && rect.bottom > top;
          })
          .map((line) => line.dataset.blockId ?? ""),
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setLineDrag(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    dragBox.onPointerDown(event);
    onLinePointerDown(event);
  };

  /** Keys that reach the page itself: the ones for the selected blocks. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const { state: current, dispatch, undo, redo, setSearch } = store.getState();
    const command = keyCommand(event, {
      isMac: isMacPlatform(),
      inText: false,
      caretStart: 0,
      caretEnd: 0,
      textLength: 0,
      onFirstLine: false,
      onLastLine: false,
      slashOpen: false,
      hasBlockSelection: current.selectedIds.size > 0,
      allTextSelected: true,
    });
    if (!command) return;
    event.preventDefault();

    switch (command) {
      case "deleteSelection":
        dispatch({ type: "deleteSelected" });
        break;
      case "extendUp":
      case "extendDown":
        dispatch({ type: "extendSelection", up: command === "extendUp" });
        break;
      case "selectAll":
        dispatch({ type: "selectAll" });
        break;
      case "bold":
        dispatch({ type: "toggleSpan", span: Spans.BOLD });
        break;
      case "italic":
        dispatch({ type: "toggleSpan", span: Spans.ITALIC });
        break;
      case "underline":
        dispatch({ type: "toggleSpan", span: Spans.UNDERLINE });
        break;
      case "box":
        dispatch({ type: "toggleTag", tag: Tags.HIGH_LIGHT_BLOCK });
        break;
      case "list":
        dispatch({ type: "toggleType", storyType: StoryTypes.UNORDERED_LIST_ITEM });
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "find":
        setSearch({ open: true });
        break;
      case "askAi":
        actions.askAi();
        break;
      case "escape":
        dispatch({ type: "select", ids: [] });
        break;
    }
  };

  const selectedBlocks = () => {
    const current = store.getState().state;
    return ordered(current).filter((block) => current.selectedIds.has(block.id));
  };

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selected = selectedBlocks();
    if (selected.length === 0) return;
    event.preventDefault();
    writeBlocks(event.clipboardData, selected);
  };

  const onCut = (event: ClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    onCopy(event);
    if (event.defaultPrevented) store.getState().dispatch({ type: "deleteSelected" });
  };

  /** A paste while blocks are selected goes after them. */
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || locked) return;
    const selected = selectedBlocks();
    const after = selected[selected.length - 1]?.id ?? blocks[blocks.length - 1]?.id ?? null;
    event.preventDefault();
    const pasted = readClipboard(event.clipboardData);
    if (pasted.kind === "blocks") {
      store
        .getState()
        .dispatch({ type: "insertBlocks", blocks: pasted.blocks, afterId: after, focusEnd: true });
    } else if (pasted.kind === "media") {
      actions.insertMedia(pasted.files, after);
    } else if (pasted.kind === "text") {
      const pastedBlocks = textToBlocks(pasted.text) ?? [
        newBlock(StoryTypes.TEXT, { text: pasted.text }),
      ];
      store
        .getState()
        .dispatch({ type: "insertBlocks", blocks: pastedBlocks, afterId: after, focusEnd: true });
    }
  };

  const dropTarget = (event: DragEvent<HTMLElement>): DropTarget | null => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-block-id]");
    if (row) {
      const rect = row.getBoundingClientRect();
      return { id: row.dataset.blockId ?? "", after: event.clientY > rect.top + rect.height / 2 };
    }
    const last = blocks[blocks.length - 1];
    return last ? { id: last.id, after: true } : null;
  };

  const accepts = (event: DragEvent) =>
    !locked &&
    (event.dataTransfer.types.includes(BLOCKS_MIME) || event.dataTransfer.types.includes("Files"));

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(BLOCKS_MIME)
      ? "move"
      : "copy";
    const target = dropTarget(event);
    if (target?.id !== drop?.id || target?.after !== drop?.after) setDrop(target);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!accepts(event)) return;
    event.preventDefault();
    const target = dropTarget(event);
    setDrop(null);
    if (!target) return;

    // Dropped before a block means after the one above it; nothing goes above the title.
    const index = blocks.findIndex((block) => block.id === target.id);
    const anchor = target.after ? blocks[index] : blocks[index - 1];
    const afterId = anchor?.id ?? blocks[0]?.id ?? null;

    const moved = event.dataTransfer.getData(BLOCKS_MIME);
    if (moved) {
      const ids = JSON.parse(moved) as string[];
      store.getState().dispatch({ type: "move", ids, afterId });
      return;
    }
    const media = Array.from(event.dataTransfer.files).filter(isMedia);
    if (media.length > 0) actions.insertMedia(media, afterId);
  };

  const onHandleDragStart = (event: DragEvent<HTMLElement>, block: Block) => {
    const current = store.getState().state;
    const ids = current.selectedIds.has(block.id)
      ? ordered(current)
          .filter((each) => current.selectedIds.has(each.id))
          .map((each) => each.id)
      : [block.id];
    event.dataTransfer.setData(BLOCKS_MIME, JSON.stringify(ids));
    event.dataTransfer.effectAllowed = "move";
    const row = (event.target as HTMLElement).closest("[data-block-id]");
    if (row) event.dataTransfer.setDragImage(row, 0, 0);
  };

  const parts = groupParts(blocks);
  const selection = selectionParts(blocks, state.selectedIds);

  const row = (block: Block, index: number): ReactNode => {
    const selected = state.selectedIds.has(block.id);
    const title = isTitle(block);
    return (
      <div
        key={block.id}
        data-block-id={block.id}
        data-selected={selected || undefined}
        className={cn(
          "group relative",
          rowClasses(parts[index] ?? null, selection[index] ?? null),
          hasTag(block, Tags.AI_SUGGESTION) && "border-l-2 border-accent bg-selected-bg/40",
          title && "mb-4",
        )}
        onClickCapture={(event) => {
          // Blocks with no text are selected by a click.
          if (
            !isTextBlock(block) &&
            !locked &&
            !(event.target as HTMLElement).closest("a, button")
          ) {
            select([block.id]);
          }
        }}
      >
        {drop?.id === block.id && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 h-0.5 rounded bg-accent",
              drop.after ? "-bottom-px" : "-top-px",
            )}
          />
        )}
        {!locked && !title && (
          <button
            type="button"
            draggable
            aria-label={t("editorDragHandle")}
            title={t("editorDragHandle")}
            onDragStart={(event) => onHandleDragStart(event, block)}
            onDragEnd={() => setDrop(null)}
            onClick={() => select([block.id])}
            className="absolute top-1 -left-6 flex size-6 cursor-grab items-center justify-center rounded text-text-lighter opacity-0 group-hover:opacity-100 hover:bg-options-selector focus-visible:opacity-100"
          >
            <GripVertical size={16} aria-hidden />
          </button>
        )}
        <BlockContent block={block} readOnly={locked} decorations={decorations.get(block.id)} />
      </div>
    );
  };

  return (
    // The space beside and under the page starts a drag box as the page itself does.
    <div className="min-h-full" onPointerDown={locked ? undefined : onPointerDown}>
      {/* The page takes the keys while whole blocks are selected; its blocks take them otherwise. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={canvasRef}
        data-editor-canvas
        tabIndex={-1}
        className={cn(
          "relative mx-auto w-full max-w-3xl px-10 pt-10 pb-4 font-(family-name:--wr-editor-font) outline-none sm:px-14",
          lineDrag && "select-none",
        )}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
        }}
        onDrop={onDrop}
      >
        {blocks.map(row)}

        {!locked && (
          <button
            type="button"
            aria-label={t("editorAddLine")}
            data-drag-surface
            className="block h-24 w-full cursor-text"
            onClick={() => store.getState().dispatch({ type: "clickAtEnd" })}
          />
        )}

        {dragBox.box && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-10 border border-accent bg-selected-bg"
            style={dragBox.box}
          />
        )}

        <SelectionToolbar canvas={canvasRef} />
        <SlashMenu canvas={canvasRef} />
      </div>
    </div>
  );
}
