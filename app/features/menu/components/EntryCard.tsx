import { EllipsisVertical, Heart } from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import { Link } from "react-router";

import { t } from "~/core/i18n";
import { cn, Menu, type MenuItem } from "~/core/ui";

import { useDragStore, useFolderDrop } from "../dnd";
import { ItemIcon } from "../icons";
import { type Arrangement, entryIcon, entryIsFavorite, type MenuEntry } from "../model";
import { appPaths } from "../paths";
import { displayTitle, type MoveTarget } from "../queries";
import { documentHeader, DocumentPreview, previewSnippet, previewSteps } from "./DocumentPreview";

type EntryCardProps = {
  entry: MenuEntry;
  arrangement: Arrangement;
  selected: boolean;
  /** Something is selected: a plain click then selects instead of opening. */
  selecting: boolean;
  actions: MenuItem[];
  onToggle: () => void;
  onContextMenu: (event: MouseEvent) => void;
  /** The entries that travel when this card is dragged: itself, or the whole selection. */
  dragEntries: () => MenuEntry[];
  onDropEntries: (entries: MenuEntry[], target: MoveTarget) => void;
};

/** Lines of a document shown on a card of the grid; the staggered grid shows all it has. */
const GRID_PREVIEW_STEPS = 4;
const STAGGERED_PREVIEW_STEPS = 7;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** A folder or a document of the menu, as a card or as a row of the list. */
export function EntryCard({
  entry,
  arrangement,
  selected,
  selecting,
  actions,
  onToggle,
  onContextMenu,
  dragEntries,
  onDropEntries,
}: EntryCardProps) {
  const title = displayTitle(entry);
  const isList = arrangement === "list";
  const { isOver, dropProps } = useFolderDrop({ id: entry.id, title }, onDropEntries);

  const onClick = (event: MouseEvent) => {
    if (!selecting && !event.metaKey && !event.ctrlKey && !event.shiftKey) return;
    event.preventDefault();
    onToggle();
  };

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", title);
    useDragStore.getState().start(dragEntries());
  };

  return (
    <article
      data-entry-id={entry.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => useDragStore.getState().end()}
      onContextMenu={onContextMenu}
      {...(entry.kind === "folder" ? dropProps : {})}
      className={cn(
        "group relative border bg-card-bg transition-colors",
        isList
          ? "flex items-center border-x-0 border-t-0 border-divider"
          : "rounded-lg border-card-border",
        arrangement === "grid" && "h-56",
        arrangement === "staggered_grid" && "mb-4 break-inside-avoid",
        selected && "border-accent bg-selected-bg",
        isOver && "ring-2 ring-accent",
      )}
    >
      <Link
        to={entry.kind === "folder" ? appPaths.folder(entry.id) : appPaths.document(entry.id)}
        draggable={false}
        onClick={onClick}
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          isList ? "flex items-center gap-3 py-3 pr-10 pl-10" : "flex h-full flex-col rounded-lg",
        )}
      >
        {isList ? (
          <ListRow entry={entry} title={title} />
        ) : (
          <CardBody entry={entry} title={title} arrangement={arrangement} />
        )}
      </Link>

      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={t("selectItem", { title })}
        className={cn(
          "absolute left-3 size-4 accent-accent",
          isList ? "top-1/2 -translate-y-1/2" : "top-3",
          !selected && !selecting && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      />

      <div className={cn("absolute right-1", isList ? "top-1/2 -translate-y-1/2" : "top-1")}>
        <Menu
          label={t("actionsFor", { title })}
          align="end"
          items={actions}
          trigger={<EllipsisVertical size={16} aria-hidden />}
          triggerClassName={cn(
            "flex size-8 items-center justify-center rounded-md text-text-lighter",
            "hover:bg-options-selector aria-expanded:bg-options-selector",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
          )}
        />
      </div>
    </article>
  );
}

function ListRow({ entry, title }: { entry: MenuEntry; title: string }) {
  const updatedAt =
    entry.kind === "folder" ? entry.folder.lastUpdatedAt : entry.document.lastUpdatedAt;

  return (
    <>
      <ItemIcon icon={entryIcon(entry)} kind={entry.kind} className="shrink-0" />
      <h3 className="max-w-[40%] shrink-0 truncate font-medium">{title}</h3>
      {entryIsFavorite(entry) && <FavoriteMark />}
      <span className="min-w-0 flex-1 truncate text-sm text-text-lighter">
        {entry.kind === "folder"
          ? t("itemCount", { count: entry.folder.itemCount })
          : previewSnippet(entry.document)}
      </span>
      <time
        dateTime={new Date(updatedAt).toISOString()}
        className="hidden shrink-0 text-sm text-text-lighter sm:block"
      >
        {dateFormat.format(updatedAt)}
      </time>
    </>
  );
}

function CardBody({
  entry,
  title,
  arrangement,
}: {
  entry: MenuEntry;
  title: string;
  arrangement: Arrangement;
}) {
  const header = entry.kind === "document" ? documentHeader(entry.document) : null;

  return (
    <>
      {header &&
        ("imageUrl" in header ? (
          <img src={header.imageUrl} alt="" loading="lazy" className="h-12 w-full object-cover" />
        ) : (
          <div className="h-8 w-full shrink-0" style={{ backgroundColor: header.color }} />
        ))}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2 pr-6 pl-6">
          <ItemIcon icon={entryIcon(entry)} kind={entry.kind} className="shrink-0" />
          <h3 className="min-w-0 flex-1 truncate font-medium">{title}</h3>
          {entryIsFavorite(entry) && <FavoriteMark />}
        </div>
        {entry.kind === "folder" ? (
          <p className="text-sm text-text-lighter">
            {t("itemCount", { count: entry.folder.itemCount })}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            <DocumentPreview
              steps={previewSteps(
                entry.document,
                arrangement === "grid" ? GRID_PREVIEW_STEPS : STAGGERED_PREVIEW_STEPS,
              )}
            />
          </div>
        )}
      </div>
    </>
  );
}

function FavoriteMark() {
  return (
    <Heart
      size={14}
      role="img"
      aria-label={t("favorite")}
      className="shrink-0 fill-accent text-accent"
    />
  );
}
