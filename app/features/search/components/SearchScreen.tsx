import { useQuery } from "@tanstack/react-query";
import { FileText, Presentation, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ApiError } from "~/core/api";
import { useDebouncedValue } from "~/core/hooks/useDebouncedValue";
import { t } from "~/core/i18n";
import { cn, Spinner } from "~/core/ui";
import { ItemIcon } from "~/features/menu/icons";
import { appPaths } from "~/features/menu/paths";
import { workspaceDocumentsQuery } from "~/features/menu/queries";
import { TopBar } from "~/features/shell/components/TopBar";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { SEARCH_RESULTS_LIMIT, type SearchResult, searchWorkspace } from "../api";
import { highlightPieces, queryTokens, snippetWindow } from "../snippet";

const SEARCH_DEBOUNCE_MS = 250;

/** Asked by ⌘K / Ctrl+K while the search is already the screen: the field takes the cursor. */
export const FOCUS_SEARCH_EVENT = "writeopia:focus-search";

/**
 * SearchView.swift: the search is a screen of its own, like the other places of the app. The
 * recent documents while nothing is typed, the documents and the presentations that match once
 * something is. The words are kept in the address (?q=), so Back from a result comes back to
 * them. Arrows move, Enter opens.
 */
export function SearchScreen() {
  const { user, workspace } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [active, setActive] = useState(0);
  const typed = query.trim();
  const debounced = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  const searching = queryTokens(debounced).length > 0;
  const premium = user.tier === "PREMIUM";

  // The words searched go in the address, replacing it: typing is not a step of the history.
  useEffect(() => {
    setSearchParams(
      (params) => {
        if ((params.get("q") ?? "") === debounced) return params;
        if (debounced) params.set("q", debounced);
        else params.delete("q");
        return params;
      },
      { replace: true },
    );
  }, [debounced, setSearchParams]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  const recent = useQuery({
    ...workspaceDocumentsQuery(workspace.id),
    enabled: premium && !searching,
    select: (contents): SearchResult[] =>
      contents.documents
        .filter((document) => !document.deleted)
        .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
        .slice(0, SEARCH_RESULTS_LIMIT)
        .map((document) => ({
          kind: "document",
          id: document.id,
          title: document.title,
          icon: document.icon,
          snippet: null,
        })),
  });

  const found = useQuery({
    queryKey: ["search", workspace.id, debounced],
    queryFn: ({ signal }) => searchWorkspace(workspace.id, debounced, signal),
    enabled: premium && searching,
    staleTime: 30_000,
  });

  const source = searching ? found : recent;
  const results = useMemo(() => source.data ?? [], [source.data]);
  const waiting = typed !== debounced || source.isPending;
  const selected = Math.min(active, Math.max(results.length - 1, 0));

  const open = (result: SearchResult) =>
    void navigate(appPaths.document(result.kind === "document" ? result.id : result.documentId));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((selected + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((selected - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const result = results[selected];
      if (result) open(result);
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <h1 className="px-1 font-medium">{t("search")}</h1>
      </TopBar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          <div className="flex items-center gap-2 rounded-lg border border-card-border bg-card-bg px-3">
            <Search size={18} aria-hidden className="text-text-lighter" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={t("searchPlaceholder")}
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={results.length > 0 ? optionId(selected) : undefined}
              aria-autocomplete="list"
              placeholder={t("searchPlaceholder")}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the screen is opened to type
              autoFocus
              value={query}
              disabled={!premium}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-11 flex-1 bg-transparent text-on-bg outline-none placeholder:text-text-lighter"
            />
            {premium && waiting && <Spinner size={14} />}
          </div>

          {!premium ? (
            <p className="text-sm">{t("premiumFeatureMessage")}</p>
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-bold tracking-wide text-text-lighter uppercase">
                {searching ? t("searchResults") : t("searchRecent")}
              </h2>
              {source.isError ? (
                <p role="alert" className="text-sm text-error">
                  {source.error instanceof ApiError && source.error.isForbidden
                    ? t("premiumFeatureMessage")
                    : t("searchFailed")}
                </p>
              ) : !waiting && results.length === 0 ? (
                <p className="text-sm">{searching ? t("searchNoResults") : t("searchNoRecent")}</p>
              ) : null}
              <ul
                id={listId}
                role="listbox"
                aria-label={searching ? t("searchResults") : t("searchRecent")}
                className="flex flex-col gap-0.5"
              >
                {results.map((result, index) => (
                  // The keys are the input's: it keeps the focus and moves through the options.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={`${result.kind}-${result.id}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === selected}
                    // The input keeps the focus; a click on a result opens it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => open(result)}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5",
                      index === selected && "bg-selected-bg",
                    )}
                  >
                    <ResultIcon result={result} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-on-bg">
                        <Highlighted text={result.title || t("untitled")} query={debounced} />
                      </span>
                      {result.kind === "document" && result.snippet && (
                        <span className="truncate text-sm text-text-lighter">
                          <Highlighted
                            text={snippetWindow(result.snippet, debounced)}
                            query={debounced}
                          />
                        </span>
                      )}
                      {result.kind === "presentation" && (
                        <span className="text-sm text-text-lighter">{t("searchPresentation")}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultIcon({ result }: { result: SearchResult }) {
  if (result.kind === "presentation") {
    return <Presentation size={18} aria-hidden className="mt-0.5 shrink-0 text-text-lighter" />;
  }
  if (result.icon) {
    return <ItemIcon icon={result.icon} kind="document" size={18} className="mt-0.5 shrink-0" />;
  }
  return <FileText size={18} aria-hidden className="mt-0.5 shrink-0 text-text-lighter" />;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightPieces(text, query).map((piece, index) =>
        piece.match ? (
          <mark key={index} className="bg-transparent font-bold text-accent">
            {piece.text}
          </mark>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  );
}
