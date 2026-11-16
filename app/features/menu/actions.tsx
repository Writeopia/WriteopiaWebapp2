import {
  Copy,
  FolderInput,
  FolderPlus,
  Heart,
  HeartOff,
  PencilLine,
  Plus,
  Smile,
  Trash2,
} from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import type { MenuItem } from "~/core/ui";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { useMenuDialogs } from "./dialogs";
import { entryIsFavorite, type MenuEntry } from "./model";
import { appPaths } from "./paths";
import { newDocument, useMenuMutations } from "./queries";

type MenuActions = ReturnType<typeof useMenuMutations>;

const MenuActionsContext = createContext<MenuActions | null>(null);

/** Gives the screens of the app the changes of the menu, created once for all of them. */
export function MenuActionsProvider({ children }: { children: ReactNode }) {
  const actions = useMenuMutations();
  return <MenuActionsContext value={actions}>{children}</MenuActionsContext>;
}

export function useMenuActions(): MenuActions {
  const actions = useContext(MenuActionsContext);
  if (!actions) throw new Error("useMenuActions needs a MenuActionsProvider above it");
  return actions;
}

/** Creates an empty document in a folder and opens it in the editor. */
export function useCreateDocument(): (parentId: string) => void {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { createDocument } = useMenuActions();

  return (parentId) => {
    createDocument.mutate(newDocument(workspace.id, parentId), {
      onSuccess: (document) => void navigate(appPaths.document(document.id)),
    });
  };
}

const ICON_SIZE = 16;

/**
 * What can be done with an entry, for its card menu, its right click and its row in the side
 * tree. [withCreate] adds "New document" and "New folder" inside a folder.
 */
export function useEntryActions(): (entry: MenuEntry, withCreate?: boolean) => MenuItem[] {
  const navigate = useNavigate();
  const openDialog = useMenuDialogs((state) => state.open);
  const createDocument = useCreateDocument();
  const { setFavorite, duplicate } = useMenuActions();

  return (entry, withCreate = false) => {
    const favorite = entryIsFavorite(entry);
    const items: MenuItem[] = [];

    if (entry.kind === "folder" && withCreate) {
      items.push(
        {
          id: "newDocument",
          label: t("newDocument"),
          icon: <Plus size={ICON_SIZE} aria-hidden />,
          onSelect: () => createDocument(entry.id),
        },
        {
          id: "newFolder",
          label: t("newFolder"),
          icon: <FolderPlus size={ICON_SIZE} aria-hidden />,
          onSelect: () => openDialog({ type: "newFolder", parentId: entry.id }),
        },
      );
    } else {
      items.push({
        id: "open",
        label: t("open"),
        onSelect: () =>
          void navigate(
            entry.kind === "folder" ? appPaths.folder(entry.id) : appPaths.document(entry.id),
          ),
      });
    }

    if (entry.kind === "folder") {
      items.push({
        id: "edit",
        label: t("editFolder"),
        icon: <PencilLine size={ICON_SIZE} aria-hidden />,
        onSelect: () => openDialog({ type: "editFolder", folder: entry.folder }),
      });
    } else {
      items.push({
        id: "icon",
        label: t("changeIcon"),
        icon: <Smile size={ICON_SIZE} aria-hidden />,
        onSelect: () => openDialog({ type: "icon", document: entry.document }),
      });
    }

    items.push({
      id: "favorite",
      label: favorite ? t("unfavorite") : t("favorite"),
      icon: favorite ? (
        <HeartOff size={ICON_SIZE} aria-hidden />
      ) : (
        <Heart size={ICON_SIZE} aria-hidden />
      ),
      onSelect: () => setFavorite.mutate({ entries: [entry], favorite: !favorite }),
    });

    if (entry.kind === "document") {
      items.push({
        id: "duplicate",
        label: t("duplicate"),
        icon: <Copy size={ICON_SIZE} aria-hidden />,
        onSelect: () => duplicate.mutate([entry.id]),
      });
    }

    items.push(
      {
        id: "move",
        label: t("moveTo"),
        icon: <FolderInput size={ICON_SIZE} aria-hidden />,
        onSelect: () => openDialog({ type: "move", entries: [entry] }),
      },
      {
        id: "delete",
        label: t("delete"),
        icon: <Trash2 size={ICON_SIZE} aria-hidden />,
        danger: true,
        onSelect: () => openDialog({ type: "delete", entries: [entry] }),
      },
    );

    return items;
  };
}
