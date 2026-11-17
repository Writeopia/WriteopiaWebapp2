import { Bold, Highlighter, Italic, Link, Sparkles, Underline } from "lucide-react";
import { type ReactNode, type RefObject, useLayoutEffect, useState } from "react";

import { t } from "~/core/i18n";
import { type Span, Spans } from "~/core/models";
import { cn } from "~/core/ui";

import { find, isSpanActive } from "../state/reducer";
import { useEditor } from "../state/store";
import { useEditorActions } from "./editorContext";

type Position = { left: number; top: number };

const HIGHLIGHT_COLORS: {
  span: Span;
  className: string;
  label: "highlightYellow" | "highlightGreen" | "highlightRed";
}[] = [
  { span: Spans.HIGHLIGHT_YELLOW, className: "text-yellow-500", label: "highlightYellow" },
  { span: Spans.HIGHLIGHT_GREEN, className: "text-green-600", label: "highlightGreen" },
  { span: Spans.HIGHLIGHT_RED, className: "text-red-500", label: "highlightRed" },
];

/**
 * The buttons that float above selected text (TextToolbox.kt, TextSelectionToolbar.swift):
 * bold, italic, underline, the three highlights and the link.
 */
export function SelectionToolbar({ canvas }: { canvas: RefObject<HTMLDivElement | null> }) {
  const state = useEditor((store) => store.state);
  const dispatch = useEditor((store) => store.dispatch);
  const { openLinkDialog, askAi } = useEditorActions();
  const [position, setPosition] = useState<Position | null>(null);

  const caret = state.focus;
  const visible =
    !state.readOnly &&
    state.suggestion === null &&
    state.selectedIds.size === 0 &&
    caret !== null &&
    caret.start < caret.end &&
    find(state, caret.id) !== null;

  useLayoutEffect(() => {
    const container = canvas.current;
    const selection = document.getSelection();
    if (!visible || !container || !selection || selection.rangeCount === 0) {
      setPosition(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect?.();
    const box = container.getBoundingClientRect();
    if (!rect) {
      setPosition(null);
      return;
    }
    setPosition({ left: rect.left - box.left + rect.width / 2, top: rect.top - box.top });
  }, [visible, caret?.id, caret?.start, caret?.end, canvas]);

  if (!visible) return null;

  const button = (label: string, span: Span | null, icon: ReactNode, onPress: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={span ? isSpanActive(state, span) : undefined}
      // Keeps the text selected while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cn(
        "flex size-8 items-center justify-center rounded hover:bg-options-selector",
        span && isSpanActive(state, span) && "bg-selected-bg text-accent",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label={t("editorFormatToolbar")}
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-card-border bg-card-bg p-1 shadow-lg"
      style={{ left: position?.left ?? 0, top: (position?.top ?? 0) - 6 }}
    >
      {button(t("bold"), Spans.BOLD, <Bold size={16} />, () =>
        dispatch({ type: "toggleSpan", span: Spans.BOLD }),
      )}
      {button(t("italic"), Spans.ITALIC, <Italic size={16} />, () =>
        dispatch({ type: "toggleSpan", span: Spans.ITALIC }),
      )}
      {button(t("underline"), Spans.UNDERLINE, <Underline size={16} />, () =>
        dispatch({ type: "toggleSpan", span: Spans.UNDERLINE }),
      )}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-divider" />
      {HIGHLIGHT_COLORS.map((color) =>
        button(
          t(color.label),
          color.span,
          <Highlighter size={16} className={color.className} />,
          () => dispatch({ type: "toggleSpan", span: color.span }),
        ),
      )}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-divider" />
      {button(t("link"), Spans.LINK, <Link size={16} />, () => caret && openLinkDialog(caret))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-divider" />
      {button(t("askAi"), null, <Sparkles size={16} />, () => {
        // The command is about the line of the selected text.
        if (caret) dispatch({ type: "select", ids: [caret.id] });
        askAi();
      })}
    </div>
  );
}
