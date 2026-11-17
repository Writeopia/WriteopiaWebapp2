import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { type Document, type Folder, type Icon, ROOT_FOLDER_ID } from "~/core/models";
import { Button, Dialog, Spinner, TextField } from "~/core/ui";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { useMenuActions } from "../actions";
import { useMenuDialogs } from "../dialogs";
import { ItemIcon } from "../icons";
import { entryParentId, type MenuEntry } from "../model";
import { appPaths } from "../paths";
import { displayTitle, folderContentsQuery } from "../queries";
import { IconPicker } from "./IconPicker";

/** Draws the dialog of the menu that is open. Rendered once, by the shell. */
export function MenuDialogs() {
  const dialog = useMenuDialogs((state) => state.dialog);
  const close = useMenuDialogs((state) => state.close);

  switch (dialog?.type) {
    case "newFolder":
      return <FolderDialog parentId={dialog.parentId} onClose={close} />;
    case "editFolder":
      return <FolderDialog key={dialog.folder.id} folder={dialog.folder} onClose={close} />;
    case "icon":
      return <DocumentIconDialog document={dialog.document} onClose={close} />;
    case "delete":
      return <DeleteDialog entries={dialog.entries} onClose={close} />;
    case "move":
      return <MoveDialog entries={dialog.entries} onMoved={dialog.onMoved} onClose={close} />;
    default:
      return null;
  }
}

type FolderDialogProps = {
  /** The folder to edit; without one the dialog creates a folder in [parentId]. */
  folder?: Folder;
  parentId?: string;
  onClose: () => void;
};

function FolderDialog({ folder, parentId = ROOT_FOLDER_ID, onClose }: FolderDialogProps) {
  const { createFolder, updateFolder } = useMenuActions();
  const [title, setTitle] = useState(folder?.title ?? "");
  const [icon, setIcon] = useState<Icon | null>(folder?.icon ?? null);
  const name = title.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name === "") return;

    if (folder) {
      updateFolder.mutate({ folder, changes: { title: name, ...(icon ? { icon } : {}) } });
      onClose();
    } else {
      createFolder.mutate({ parentId, title: name, icon }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onClose={onClose} title={folder ? t("editFolder") : t("newFolder")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("folderName")}
          value={title}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog is for typing a name
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
        <IconPicker value={icon} onChange={(next) => next && setIcon(next)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={createFolder.isPending} disabled={name === ""}>
            {folder ? t("save") : t("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DocumentIconDialog({ document, onClose }: { document: Document; onClose: () => void }) {
  const { changeDocumentIcon } = useMenuActions();
  const [icon, setIcon] = useState<Icon | null>(document.icon);

  const save = () => {
    changeDocumentIcon.mutate({ document, icon });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("changeIcon")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save}>{t("save")}</Button>
        </>
      }
    >
      <IconPicker value={icon} onChange={setIcon} allowRemove />
    </Dialog>
  );
}

function DeleteDialog({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const { remove } = useMenuActions();
  const navigate = useNavigate();
  const location = useLocation();
  const hasFolders = entries.some((entry) => entry.kind === "folder");

  const confirm = () => {
    remove.mutate(entries);
    onClose();

    // The folder on screen is one of the deleted: its parent is the closest place left.
    const open = entries.find(
      (entry) => entry.kind === "folder" && location.pathname === appPaths.folder(entry.id),
    );
    if (open) void navigate(appPaths.folder(entryParentId(open) ?? ROOT_FOLDER_ID));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        entries.length === 1
          ? t("deleteItemTitle", { title: displayTitle(entries[0]!) })
          : t("deleteItemsTitle", { count: entries.length })
      }
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={confirm}>
            {t("delete")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {entries.length > 1 && (
          <>
            <p>{t("deleteConfirmation")}</p>
            <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
              {entries.map((entry) => (
                <li key={entry.id}>{displayTitle(entry)}</li>
              ))}
            </ul>
          </>
        )}
        {hasFolders && <p className="text-sm text-error">{t("deleteFoldersWarning")}</p>}
      </div>
    </Dialog>
  );
}

/** Picks the folder to move entries to, by walking down from Home. */
type MoveDialogProps = {
  entries: MenuEntry[];
  onMoved?: (folderId: string) => void;
  onClose: () => void;
};

function MoveDialog({ entries, onMoved, onClose }: MoveDialogProps) {
  const { workspace } = useWorkspace();
  const { move } = useMenuActions();
  const [trail, setTrail] = useState<Folder[]>([]);

  const current = trail.at(-1);
  const currentId = current?.id ?? ROOT_FOLDER_ID;
  const contents = useQuery(folderContentsQuery(workspace.id, currentId));

  // A folder cannot go inside itself, so the ones being moved are not offered.
  const movingIds = new Set(entries.map((entry) => entry.id));
  const folders = (contents.data?.folders ?? []).filter((folder) => !movingIds.has(folder.id));
  const alreadyHere = entries.every((entry) => entryParentId(entry) === currentId);

  const confirm = () => {
    move(entries, { id: currentId, title: current?.title ?? t("home") });
    onMoved?.(currentId);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("moveTo")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={confirm} disabled={alreadyHere}>
            {t("moveHere")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" className="text-link underline" onClick={() => setTrail([])}>
            {t("home")}
          </button>
          {trail.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight size={14} aria-hidden />
              <button
                type="button"
                className="text-link underline"
                onClick={() => setTrail(trail.slice(0, index + 1))}
              >
                {folder.title}
              </button>
            </span>
          ))}
        </nav>

        <p className="text-sm text-text-lighter">
          {alreadyHere ? t("moveAlreadyHere") : t("moveLocationHint")}
        </p>

        <div className="max-h-64 min-h-24 overflow-y-auto rounded-md border border-card-border">
          {contents.isPending && (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          )}
          {contents.isError && (
            <p role="alert" className="p-3 text-sm text-error">
              {t("moveErrorLoadingFolders")}
            </p>
          )}
          {contents.data && folders.length === 0 && (
            <p className="p-3 text-sm text-text-lighter">{t("moveNoFoldersHere")}</p>
          )}
          <ul>
            {folders.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  onClick={() => setTrail([...trail, folder])}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-options-selector"
                >
                  <ItemIcon icon={folder.icon} kind="folder" />
                  <span className="flex-1 truncate">{folder.title}</span>
                  <ChevronRight size={16} aria-hidden className="text-text-lighter" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
