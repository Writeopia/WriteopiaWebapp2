import {
  FileJson,
  FileText,
  FolderInput,
  Globe,
  Heart,
  HeartOff,
  Image,
  Lock,
  LockOpen,
  MoreHorizontal,
  Search,
  Smile,
  Tags,
  Trash2,
} from "lucide-react";

import { t } from "~/core/i18n";
import { Menu, type MenuItem } from "~/core/ui";
import { useEditor } from "~/features/editor/state/store";

import { useDocumentOptions } from "../context";

const ICON_SIZE = 16;

/**
 * What can be done to the open document (NoteGlobalActionsMenu.kt), for the "⋯" menu of the top
 * bar and the page tab of the side panel.
 */
export function useDocumentActionItems(): MenuItem[] {
  const options = useDocumentOptions();
  const setSearch = useEditor((store) => store.setSearch);
  const { document, open } = options;
  const locked = document.isLocked;

  return [
    {
      id: "favorite",
      label: document.isFavorite ? t("unfavorite") : t("favorite"),
      icon: document.isFavorite ? (
        <HeartOff size={ICON_SIZE} aria-hidden />
      ) : (
        <Heart size={ICON_SIZE} aria-hidden />
      ),
      onSelect: options.toggleFavorite,
    },
    {
      id: "move",
      label: t("moveTo"),
      icon: <FolderInput size={ICON_SIZE} aria-hidden />,
      onSelect: options.move,
    },
    {
      id: "header",
      label: t("headerEdit"),
      icon: <Image size={ICON_SIZE} aria-hidden />,
      disabled: locked,
      onSelect: () => open("header"),
    },
    {
      id: "icon",
      label: t("changeIcon"),
      icon: <Smile size={ICON_SIZE} aria-hidden />,
      disabled: locked,
      onSelect: () => open("icon"),
    },
    {
      id: "tags",
      label: t("documentTags"),
      icon: <Tags size={ICON_SIZE} aria-hidden />,
      onSelect: () => open("tags"),
    },
    {
      id: "lock",
      label: locked ? t("unlockDocument") : t("lockDocument"),
      icon: locked ? (
        <LockOpen size={ICON_SIZE} aria-hidden />
      ) : (
        <Lock size={ICON_SIZE} aria-hidden />
      ),
      onSelect: () => options.change({ isLocked: !locked }),
    },
    {
      id: "find",
      label: t("editorFind"),
      icon: <Search size={ICON_SIZE} aria-hidden />,
      onSelect: () => setSearch({ open: true }),
    },
    {
      id: "exportMarkdown",
      label: t("exportMarkdown"),
      icon: <FileText size={ICON_SIZE} aria-hidden />,
      onSelect: options.exportMarkdown,
    },
    {
      id: "exportJson",
      label: t("exportJson"),
      icon: <FileJson size={ICON_SIZE} aria-hidden />,
      onSelect: options.exportJson,
    },
    {
      id: "publish",
      label: t("publishToWeb"),
      icon: <Globe size={ICON_SIZE} aria-hidden />,
      onSelect: () => open("publish"),
    },
    {
      id: "delete",
      label: t("delete"),
      icon: <Trash2 size={ICON_SIZE} aria-hidden />,
      danger: true,
      onSelect: () => open("delete"),
    },
  ];
}

/** The "⋯" menu of the editor's top bar. */
export function DocumentActionsMenu() {
  const items = useDocumentActionItems();
  return (
    <Menu
      label={t("documentActions")}
      align="end"
      items={items}
      trigger={<MoreHorizontal size={18} aria-hidden />}
      triggerClassName="flex size-9 items-center justify-center rounded-md hover:bg-options-selector"
    />
  );
}
