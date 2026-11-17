import { ChevronDown, ChevronUp, X } from "lucide-react";
import { type RefObject, useEffect, useMemo } from "react";

import { t } from "~/core/i18n";

import { textElement } from "../blocks/EditableText";
import { findMatches } from "../state/search";
import { useEditor } from "../state/store";

/**
 * Find in the document (InDocumentSearchBar.kt): the query, "n of m", the previous and the
 * next match. The matches are drawn in the blocks; the current one is brought into view.
 */
export function FindBar({ canvas }: { canvas: RefObject<HTMLElement | null> }) {
  const state = useEditor((store) => store.state);
  const search = useEditor((store) => store.search);
  const setSearch = useEditor((store) => store.setSearch);

  const matches = useMemo(() => findMatches(state, search.query), [state, search.query]);
  const count = matches.length;
  const index = count === 0 ? 0 : Math.min(search.index, count - 1);
  const current = matches[index];

  useEffect(() => {
    if (!current || !canvas.current) return;
    textElement(canvas.current, current.id)?.scrollIntoView?.({ block: "center" });
  }, [current?.id, current?.start, canvas, current]);

  const step = (offset: number) => {
    if (count > 0) setSearch({ index: (index + offset + count) % count });
  };
  const close = () => setSearch({ open: false, query: "", index: 0 });

  return (
    <div
      role="search"
      className="flex items-center gap-2 border-b border-divider bg-global-bg px-4 py-2"
    >
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the bar opens to be typed in
        autoFocus
        type="search"
        aria-label={t("editorFindLabel")}
        placeholder={t("editorFindPlaceholder")}
        value={search.query}
        onChange={(event) => setSearch({ query: event.target.value, index: 0 })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-card-border bg-card-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <span className="shrink-0 text-sm text-text-lighter" aria-live="polite">
        {search.query === ""
          ? ""
          : count === 0
            ? t("editorFindNone")
            : t("editorFindCount", { index: index + 1, count })}
      </span>
      <button
        type="button"
        aria-label={t("editorFindPrevious")}
        disabled={count === 0}
        onClick={() => step(-1)}
        className="flex size-8 items-center justify-center rounded hover:bg-options-selector disabled:opacity-40"
      >
        <ChevronUp size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("editorFindNext")}
        disabled={count === 0}
        onClick={() => step(1)}
        className="flex size-8 items-center justify-center rounded hover:bg-options-selector disabled:opacity-40"
      >
        <ChevronDown size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("editorFindClose")}
        onClick={close}
        className="flex size-8 items-center justify-center rounded hover:bg-options-selector"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
