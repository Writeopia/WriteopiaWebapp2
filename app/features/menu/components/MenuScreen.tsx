import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownAZ,
  ArrowDownUp,
  CalendarArrowDown,
  ChevronRight,
  ClockArrowDown,
  FolderPlus,
  LayoutGrid,
  LayoutPanelLeft,
  Plus,
  Rows3,
} from "lucide-react";
import { type MouseEvent, type ReactNode, useMemo, useReducer, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError } from "~/core/api";
import { t } from "~/core/i18n";
import { type Folder, ROOT_FOLDER_ID } from "~/core/models";
import { Button, cn, ContextMenu, Menu, type MenuItem, showToast } from "~/core/ui";
import { TopBar } from "~/features/shell/components/TopBar";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { useCreateDocument, useEntryActions, useMenuActions } from "../actions";
import { useMenuDialogs } from "../dialogs";
import { useFolderDrop } from "../dnd";
import {
  type Arrangement,
  EMPTY_CONTENTS,
  entriesOf,
  entryIsFavorite,
  type MenuEntry,
  type OrderBy,
} from "../model";
import { appPaths } from "../paths";
import { useMenuPreferences } from "../preferences";
import {
  favoritesQuery,
  folderContentsQuery,
  folderPathQuery,
  type MoveTarget,
  useSummarize,
  workspaceDocumentsQuery,
} from "../queries";
import { EMPTY_SELECTION, selectionReducer } from "../selection";
import { sortEntries } from "../sorting";
import { useDragBox } from "../useDragBox";
import { EntryCard } from "./EntryCard";
import { SelectionBar } from "./SelectionBar";

/** What a menu screen lists: a folder, the favorites, or the documents of a tag. */
export type MenuView =
  { kind: "folder"; folderId: string } | { kind: "favorites" } | { kind: "tag"; tagId: string };

const ICON_SIZE = 16;

/** What the view lists, and the tag catalogue that came with it. */
function useViewContents(view: MenuView) {
  const workspaceId = useWorkspace().workspace.id;

  const folder = useQuery({
    ...folderContentsQuery(workspaceId, view.kind === "folder" ? view.folderId : ROOT_FOLDER_ID),
    enabled: view.kind === "folder",
  });
  const favorites = useQuery({
    ...favoritesQuery(workspaceId),
    enabled: view.kind === "favorites",
  });
  const workspace = useQuery({
    ...workspaceDocumentsQuery(workspaceId),
    enabled: view.kind === "tag",
  });

  if (view.kind === "folder") return folder;
  return view.kind === "favorites" ? favorites : workspace;
}

/**
 * The document menu: the folders and the documents of a view as cards, with the ways to show,
 * sort, create, select, move and delete them. Mounted again for each view (a key on the
 * route), so the selection never carries from one folder to another.
 */
export function MenuScreen({ view }: { view: MenuView }) {
  const navigate = useNavigate();
  const workspaceId = useWorkspace().workspace.id;
  const { arrangement, orderBy } = useMenuPreferences();
  const actions = useMenuActions();
  const entryActions = useEntryActions();
  const openDialog = useMenuDialogs((state) => state.open);
  const createDocument = useCreateDocument();

  const contents = useViewContents(view);
  const path = useQuery(
    folderPathQuery(workspaceId, view.kind === "folder" ? view.folderId : ROOT_FOLDER_ID),
  );

  const data = contents.data ?? EMPTY_CONTENTS;
  const entries = useMemo(() => {
    const listed =
      view.kind === "tag"
        ? { ...data, documents: data.documents.filter((doc) => doc.tagIds.includes(view.tagId)) }
        : data;
    return sortEntries(entriesOf(listed), orderBy);
  }, [data, view, orderBy]);

  // Ids that are no longer listed (deleted, moved away) drop out of the selection by themselves.
  const [picked, dispatch] = useReducer(selectionReducer, EMPTY_SELECTION);
  const selected = useMemo(
    () => entries.filter((entry) => picked.has(entry.id)),
    [entries, picked],
  );
  const selecting = selected.length > 0;
  const selectedDocuments = selected.filter((entry) => entry.kind === "document");

  const [contextMenu, setContextMenu] = useState<{
    entry: MenuEntry;
    position: { x: number; y: number };
  } | null>(null);

  const dragBox = useDragBox(
    (ids) => dispatch({ type: "replace", ids }),
    () => dispatch({ type: "clear" }),
  );

  const summarize = useSummarize((document) => void navigate(appPaths.document(document.id)));

  const folderId = view.kind === "folder" ? view.folderId : ROOT_FOLDER_ID;
  const clear = () => dispatch({ type: "clear" });

  const onSummarize = () => {
    showToast(t("summarizing", { count: selectedDocuments.length }));
    summarize.mutate({ documentIds: selectedDocuments.map((entry) => entry.id), folderId });
    clear();
  };

  const onFavoriteSelection = () => {
    // All favorites already: the button takes them out. Otherwise it marks them all.
    actions.setFavorite.mutate({ entries: selected, favorite: !selected.every(entryIsFavorite) });
    clear();
  };

  const tagName =
    view.kind === "tag"
      ? (data.tags.find((tag) => tag.id === view.tagId)?.name ?? t("tagUnknown"))
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <Breadcrumb
          view={view}
          path={path.data ?? []}
          tagName={tagName}
          onDropEntries={actions.move}
        />
        <div className="ml-auto flex shrink-0 items-center">
          <ArrangementMenu />
          <SortMenu />
          {view.kind === "folder" && (
            <Menu
              label={t("newItem")}
              align="end"
              trigger={<Plus size={18} aria-hidden />}
              triggerClassName="flex size-9 items-center justify-center rounded-md bg-accent text-on-accent hover:brightness-110 ml-1"
              items={[
                {
                  id: "newDocument",
                  label: t("newDocument"),
                  icon: <Plus size={ICON_SIZE} aria-hidden />,
                  onSelect: () => createDocument(folderId),
                },
                {
                  id: "newFolder",
                  label: t("newFolder"),
                  icon: <FolderPlus size={ICON_SIZE} aria-hidden />,
                  onSelect: () => openDialog({ type: "newFolder", parentId: folderId }),
                },
              ]}
            />
          )}
        </div>
      </TopBar>

      <div
        className="relative min-h-0 flex-1 overflow-y-auto p-4"
        onPointerDown={dragBox.onPointerDown}
      >
        {contents.isPending ? (
          <Skeletons arrangement={arrangement} />
        ) : contents.isError ? (
          <LoadError error={contents.error} onRetry={() => void contents.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState view={view} onCreate={() => createDocument(folderId)} />
        ) : (
          <div className={arrangementClasses[arrangement]}>
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                arrangement={arrangement}
                selected={picked.has(entry.id)}
                selecting={selecting}
                actions={entryActions(entry)}
                onToggle={() => dispatch({ type: "toggle", id: entry.id })}
                onContextMenu={(event: MouseEvent) => {
                  event.preventDefault();
                  setContextMenu({ entry, position: { x: event.clientX, y: event.clientY } });
                }}
                dragEntries={() => (picked.has(entry.id) ? selected : [entry])}
                onDropEntries={actions.move}
              />
            ))}
          </div>
        )}
      </div>

      {dragBox.box && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 border border-accent bg-selected-bg"
          style={dragBox.box}
        />
      )}

      <ContextMenu
        position={contextMenu?.position ?? null}
        items={contextMenu ? entryActions(contextMenu.entry) : []}
        onClose={() => setContextMenu(null)}
      />

      {selecting && (
        <SelectionBar
          count={selected.length}
          hasDocuments={selectedDocuments.length > 0}
          summarizing={summarize.isPending}
          onFavorite={onFavoriteSelection}
          onDuplicate={() => {
            actions.duplicate.mutate(selectedDocuments.map((entry) => entry.id));
            clear();
          }}
          onMove={() => openDialog({ type: "move", entries: selected })}
          onSummarize={onSummarize}
          onDelete={() => openDialog({ type: "delete", entries: selected })}
          onClear={clear}
        />
      )}
    </div>
  );
}

const arrangementClasses: Record<Arrangement, string> = {
  grid: "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4",
  // Masonry: the cards flow down columns, each as tall as its preview.
  staggered_grid: "columns-[13rem] gap-4",
  list: "flex flex-col overflow-hidden rounded-lg border border-card-border",
};

type BreadcrumbProps = {
  view: MenuView;
  path: Folder[];
  tagName: string | null;
  onDropEntries: (entries: MenuEntry[], target: MoveTarget) => void;
};

function Breadcrumb({ view, path, tagName, onDropEntries }: BreadcrumbProps) {
  if (view.kind !== "folder") {
    return (
      <h1 className="truncate px-1 font-medium">
        {view.kind === "favorites" ? t("favorites") : tagName}
      </h1>
    );
  }

  const isRoot = view.folderId === ROOT_FOLDER_ID;

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0 flex-1 overflow-x-auto">
      <ol className="flex items-center gap-1 whitespace-nowrap">
        <Segment
          target={{ id: ROOT_FOLDER_ID, title: t("home") }}
          current={isRoot}
          onDropEntries={onDropEntries}
        />
        {path.map((folder, index) => (
          <Segment
            key={folder.id}
            target={{ id: folder.id, title: folder.title }}
            current={index === path.length - 1}
            onDropEntries={onDropEntries}
            separator
          />
        ))}
      </ol>
    </nav>
  );
}

type SegmentProps = {
  target: MoveTarget;
  /** The folder on screen: it is where the path ends, not a link. */
  current: boolean;
  separator?: boolean;
  onDropEntries: (entries: MenuEntry[], target: MoveTarget) => void;
};

function Segment({ target, current, separator = false, onDropEntries }: SegmentProps) {
  const { isOver, dropProps } = useFolderDrop(target, onDropEntries);
  const classes = cn("rounded-md px-2 py-1", isOver && "bg-selected-bg ring-2 ring-accent");

  return (
    <li className="flex items-center gap-1" {...dropProps}>
      {separator && <ChevronRight size={14} aria-hidden className="text-text-lighter" />}
      {current ? (
        <h1 aria-current="page" className={cn(classes, "font-medium")}>
          {target.title}
        </h1>
      ) : (
        <Link
          to={appPaths.folder(target.id)}
          className={cn(classes, "text-text-lighter hover:bg-options-selector")}
        >
          {target.title}
        </Link>
      )}
    </li>
  );
}

const TOP_BAR_BUTTON =
  "flex size-9 items-center justify-center rounded-md text-text-light hover:bg-options-selector";

function ArrangementMenu() {
  const arrangement = useMenuPreferences((state) => state.arrangement);
  const setArrangement = useMenuPreferences((state) => state.setArrangement);

  const options: { value: Arrangement; label: string; icon: ReactNode }[] = [
    {
      value: "grid",
      label: t("arrangementGrid"),
      icon: <LayoutGrid size={ICON_SIZE} aria-hidden />,
    },
    {
      value: "staggered_grid",
      label: t("arrangementStaggeredGrid"),
      icon: <LayoutPanelLeft size={ICON_SIZE} aria-hidden />,
    },
    { value: "list", label: t("arrangementList"), icon: <Rows3 size={ICON_SIZE} aria-hidden /> },
  ];

  return (
    <Menu
      label={t("arrangement")}
      align="end"
      trigger={<LayoutGrid size={18} aria-hidden />}
      triggerClassName={TOP_BAR_BUTTON}
      items={options.map((option): MenuItem => ({
        id: option.value,
        label: option.label,
        icon: option.icon,
        checked: arrangement === option.value,
        onSelect: () => setArrangement(option.value),
      }))}
    />
  );
}

function SortMenu() {
  const orderBy = useMenuPreferences((state) => state.orderBy);
  const setOrderBy = useMenuPreferences((state) => state.setOrderBy);

  const options: { value: OrderBy; label: string; icon: ReactNode }[] = [
    {
      value: "last_updated_at",
      label: t("sortByUpdate"),
      icon: <ClockArrowDown size={ICON_SIZE} aria-hidden />,
    },
    {
      value: "created_at",
      label: t("sortByCreation"),
      icon: <CalendarArrowDown size={ICON_SIZE} aria-hidden />,
    },
    { value: "title", label: t("sortByName"), icon: <ArrowDownAZ size={ICON_SIZE} aria-hidden /> },
  ];

  return (
    <Menu
      label={t("sorting")}
      align="end"
      trigger={<ArrowDownUp size={18} aria-hidden />}
      triggerClassName={TOP_BAR_BUTTON}
      items={options.map((option): MenuItem => ({
        id: option.value,
        label: option.label,
        icon: option.icon,
        checked: orderBy === option.value,
        onSelect: () => setOrderBy(option.value),
      }))}
    />
  );
}

/** Cards with nothing in them yet, in the shape of the ones that are loading. */
function Skeletons({ arrangement }: { arrangement: Arrangement }) {
  return (
    <div role="status" aria-label={t("loading")} className={arrangementClasses[arrangement]}>
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className={cn(
            "animate-pulse bg-options-selector",
            arrangement === "list" ? "h-12 border-b border-divider" : "rounded-lg",
            arrangement === "grid" && "h-56",
            arrangement === "staggered_grid" && "mb-4 break-inside-avoid",
          )}
          style={arrangement === "staggered_grid" ? { height: 120 + (index % 3) * 60 } : undefined}
        />
      ))}
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // The documents of a workspace are for the PREMIUM tier: asking again changes nothing.
  const premium = error instanceof ApiError && error.isForbidden;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      {premium && <h2 className="text-lg font-bold">{t("premiumFeature")}</h2>}
      <p role="alert" className={premium ? "text-text-light" : "text-error"}>
        {premium ? t("premiumFeatureMessage") : t("menuLoadError")}
      </p>
      {!premium && (
        <Button variant="secondary" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

function EmptyState({ view, onCreate }: { view: MenuView; onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-text-light">
      <p>
        {view.kind === "folder"
          ? t("folderScreenEmpty")
          : view.kind === "favorites"
            ? t("favoritesScreenEmpty")
            : t("tagScreenEmpty")}
      </p>
      {view.kind === "folder" && <Button onClick={onCreate}>{t("folderScreenCreateNote")}</Button>}
    </div>
  );
}
