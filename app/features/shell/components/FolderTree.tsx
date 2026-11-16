import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";

import { t } from "~/core/i18n";
import { type Document, type Folder, ROOT_FOLDER_ID } from "~/core/models";
import { cn, Menu, Spinner } from "~/core/ui";
import { useEntryActions, useMenuActions } from "~/features/menu/actions";
import { useDragStore, useFolderDrop } from "~/features/menu/dnd";
import { ItemIcon } from "~/features/menu/icons";
import { documentEntry, entriesOf, folderEntry } from "~/features/menu/model";
import { appPaths } from "~/features/menu/paths";
import { displayTitle, folderContentsQuery } from "~/features/menu/queries";
import { sortEntries } from "~/features/menu/sorting";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

const INDENT = 14;

const rowClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-sm",
    isActive && "font-medium text-accent",
  );

/**
 * The folders and documents of the workspace as a tree. A folder asks for its contents when
 * it is opened, not before.
 */
export function FolderTree() {
  return <TreeLevel folderId={ROOT_FOLDER_ID} depth={0} />;
}

function TreeLevel({ folderId, depth }: { folderId: string; depth: number }) {
  const { workspace } = useWorkspace();
  const contents = useQuery(folderContentsQuery(workspace.id, folderId));
  const indent = { paddingLeft: 8 + depth * INDENT };

  if (contents.isPending) {
    return (
      <div className="py-1" style={indent}>
        <Spinner size={14} />
      </div>
    );
  }

  if (contents.isError) {
    // The screen next to the tree says what went wrong; the tree only stays out of the way.
    return null;
  }

  const entries = sortEntries(entriesOf(contents.data), "title");

  if (entries.length === 0) {
    return depth === 0 ? null : (
      <p className="py-1 text-xs text-text-lighter" style={{ paddingLeft: 30 + depth * INDENT }}>
        {t("emptyFolderShort")}
      </p>
    );
  }

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.kind === "folder" ? (
            <FolderNode folder={entry.folder} depth={depth} />
          ) : (
            <DocumentRow document={entry.document} depth={depth} />
          )}
        </li>
      ))}
    </ul>
  );
}

function FolderNode({ folder, depth }: { folder: Folder; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { move } = useMenuActions();
  const entryActions = useEntryActions();
  const entry = folderEntry(folder);
  const { isOver, dropProps } = useFolderDrop({ id: folder.id, title: folder.title }, move);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", folder.title);
          useDragStore.getState().start([entry]);
        }}
        onDragEnd={() => useDragStore.getState().end()}
        {...dropProps}
        className={cn(
          "group flex items-center rounded-md hover:bg-options-selector",
          isOver && "bg-selected-bg ring-2 ring-accent",
        )}
        style={{ paddingLeft: 4 + depth * INDENT }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={t(expanded ? "collapseFolder" : "expandFolder", { name: folder.title })}
          onClick={() => setExpanded((value) => !value)}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-text-lighter hover:bg-options-selector"
        >
          <Chevron size={14} aria-hidden />
        </button>
        <NavLink to={appPaths.folder(folder.id)} draggable={false} className={rowClasses}>
          <ItemIcon icon={folder.icon} kind="folder" size={16} className="shrink-0" />
          <span className="truncate">{folder.title}</span>
        </NavLink>
        <Menu
          label={t("actionsFor", { title: folder.title })}
          align="end"
          items={entryActions(entry, true)}
          trigger={<Ellipsis size={14} aria-hidden />}
          triggerClassName={cn(
            "mr-1 flex size-6 items-center justify-center rounded-sm text-text-lighter",
            "hover:bg-options-selector aria-expanded:opacity-100",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        />
      </div>
      {expanded && <TreeLevel folderId={folder.id} depth={depth + 1} />}
    </>
  );
}

function DocumentRow({ document, depth }: { document: Document; depth: number }) {
  const entry = documentEntry(document);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", displayTitle(entry));
        useDragStore.getState().start([entry]);
      }}
      onDragEnd={() => useDragStore.getState().end()}
      className="flex items-center rounded-md hover:bg-options-selector"
      style={{ paddingLeft: 28 + depth * INDENT }}
    >
      <NavLink to={appPaths.document(document.id)} draggable={false} className={rowClasses}>
        <ItemIcon icon={document.icon} kind="document" size={16} className="shrink-0" />
        <span className="truncate">{displayTitle(entry)}</span>
      </NavLink>
    </div>
  );
}
