import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Bolt,
  ChartScatter,
  ChevronDown,
  FolderPlus,
  Heart,
  House,
  type LucideIcon,
  PanelLeftClose,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router";

import { t } from "~/core/i18n";
import { ROOT_FOLDER_ID } from "~/core/models";
import { cn, Menu } from "~/core/ui";
import { paths } from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";
import { useCreateDocument, useMenuActions } from "~/features/menu/actions";
import { useMenuDialogs } from "~/features/menu/dialogs";
import { useFolderDrop } from "~/features/menu/dnd";
import { appPaths } from "~/features/menu/paths";
import { folderContentsQuery } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { useShellStore } from "../store";
import { FolderTree } from "./FolderTree";

const itemClasses = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm";

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(itemClasses, "hover:bg-options-selector", isActive && "bg-selected-bg font-medium");

const smallButton =
  "flex size-6 items-center justify-center rounded-sm text-text-lighter hover:bg-options-selector";

/** The menu at the side of the app: the workspace, the main places and the folder tree. */
export function SideMenu() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { user, workspace } = useWorkspace();
  const logout = useLogout();
  const { move } = useMenuActions();
  const createDocument = useCreateDocument();
  const openDialog = useMenuDialogs((state) => state.open);
  const setCollapsed = useShellStore((state) => state.setCollapsed);
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);

  // The tag catalogue of the workspace comes with the contents of any folder.
  const root = useQuery(folderContentsQuery(workspace.id, ROOT_FOLDER_ID));
  const tags = (root.data?.tags ?? []).filter((tag) => !tag.deleted);

  const home = useFolderDrop({ id: ROOT_FOLDER_ID, title: t("home") }, move);

  /** Search and Settings open over the page, in the address, so Back closes them. */
  const openOverPage = (name: string, value: string) =>
    setSearchParams((params) => {
      params.set(name, value);
      return params;
    });

  return (
    <nav
      aria-label={t("sideMenu")}
      className="flex h-full w-full flex-col border-r border-divider bg-light-bg"
    >
      <div className="flex items-center gap-1 p-2">
        <Menu
          label={t("workspaceMenu", { name: workspace.name })}
          className="min-w-0 flex-1"
          triggerClassName="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-options-selector"
          trigger={
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{workspace.name}</span>
                <span className="truncate text-xs text-text-lighter">{user.name}</span>
              </span>
              <ChevronDown size={14} aria-hidden className="shrink-0 text-text-lighter" />
            </>
          }
          items={[
            {
              id: "changeWorkspace",
              label: t("changeWorkspace"),
              onSelect: () => void navigate(paths.workspaces),
            },
            { id: "logout", label: t("logout"), onSelect: () => logout.mutate() },
          ]}
        />
        <button
          type="button"
          aria-label={t("closeSideMenu")}
          title={t("closeSideMenu")}
          onClick={() => {
            setCollapsed(true);
            setDrawerOpen(false);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-lighter hover:bg-options-selector"
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2">
        <ItemButton icon={Search} onClick={() => openOverPage("search", "1")}>
          {t("search")}
        </ItemButton>
        <div {...home.dropProps} className={cn("rounded-md", home.isOver && "ring-2 ring-accent")}>
          <NavLink to={appPaths.home} className={linkClasses}>
            <House size={16} aria-hidden />
            {t("home")}
          </NavLink>
        </div>
        <NavLink to={appPaths.favorites} className={linkClasses}>
          <Heart size={16} aria-hidden />
          {t("favorites")}
        </NavLink>
        <NavLink to={appPaths.graph} className={linkClasses}>
          <ChartScatter size={16} aria-hidden />
          {t("documentsGraph")}
        </NavLink>
        <NavLink to={appPaths.notifications} className={linkClasses}>
          <Bell size={16} aria-hidden />
          {t("notifications")}
        </NavLink>
        <ItemButton icon={Bolt} onClick={() => openOverPage("settings", "account")}>
          {t("settings")}
        </ItemButton>
      </div>

      <hr className="mx-2 my-2 border-divider" />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-xs font-medium text-text-lighter uppercase">{t("folders")}</h2>
          <span className="flex gap-1">
            <button
              type="button"
              aria-label={t("newDocument")}
              title={t("newDocument")}
              className={smallButton}
              onClick={() => createDocument(ROOT_FOLDER_ID)}
            >
              <Plus size={14} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("newFolder")}
              title={t("newFolder")}
              className={smallButton}
              onClick={() => openDialog({ type: "newFolder", parentId: ROOT_FOLDER_ID })}
            >
              <FolderPlus size={14} aria-hidden />
            </button>
          </span>
        </div>
        <FolderTree />

        {tags.length > 0 && (
          <>
            <h2 className="mt-4 px-2 py-1 text-xs font-medium text-text-lighter uppercase">
              {t("tags")}
            </h2>
            <ul>
              {tags.map((tag) => (
                <li key={tag.id}>
                  <NavLink to={appPaths.tag(tag.id)} className={linkClasses}>
                    <Tag size={14} aria-hidden className="shrink-0" />
                    <span className="truncate">{tag.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </nav>
  );
}

function ItemButton({
  icon: Drawing,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(itemClasses, "hover:bg-options-selector")}
    >
      <Drawing size={16} aria-hidden />
      {children}
    </button>
  );
}
