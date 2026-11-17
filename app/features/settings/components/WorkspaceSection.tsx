import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { t } from "~/core/i18n";
import { generateId } from "~/core/id";
import { type DocumentTag, type FolderContents, ROOT_FOLDER_ID } from "~/core/models";
import { Button, Dialog, TextField } from "~/core/ui";
import { saveTags } from "~/features/document-options/api";
import { headerImagesKey } from "~/features/document-options/components/HeaderEditorDialog";
import { folderContentsQuery, menuKeys } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { deleteHeaderImage, type HeaderImage, listHeaderImages } from "../api";
import { useSettingsLocation } from "../sections";
import { ConfirmDialog, LoadState, SettingsGroup, SettingsLink, SubPageHeader } from "./parts";

/** SettingsWorkspaceScreen.kt: the name, and the pages of the header pictures and the tags. */
export function WorkspaceSection() {
  const { workspace } = useWorkspace();
  const { page, goTo } = useSettingsLocation();

  if (page[0] === "header-images") return <HeaderImagesPage onBack={() => goTo("workspace")} />;
  if (page[0] === "tags") return <TagsPage onBack={() => goTo("workspace")} />;

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title={t("workspaceName")}>
        <p className="text-sm text-on-bg">{workspace.name}</p>
      </SettingsGroup>
      <SettingsGroup title={t("settingsWorkspaceContent")}>
        <SettingsLink onClick={() => goTo("workspace", "header-images")}>
          {t("settingsHeaderImages")}
        </SettingsLink>
        <SettingsLink onClick={() => goTo("workspace", "tags")}>{t("settingsTags")}</SettingsLink>
      </SettingsGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Header pictures

/** The pictures with their ids, under the key the header editor uses, so either refreshes both. */
function headerImageListKey(workspaceId: string) {
  return [...headerImagesKey(workspaceId), "withIds"] as const;
}

/** SettingsHeaderImagesScreen.kt: the header pictures of the workspace, each one deletable. */
export function HeaderImagesPage({ onBack }: { onBack: () => void }) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<HeaderImage | null>(null);

  const images = useQuery({
    queryKey: headerImageListKey(workspace.id),
    queryFn: ({ signal }) => listHeaderImages(workspace.id, signal),
  });

  const deletion = useMutation({
    mutationFn: (image: HeaderImage) => deleteHeaderImage(workspace.id, image.id),
    onSuccess: (_, image) => {
      queryClient.setQueryData<HeaderImage[]>(headerImageListKey(workspace.id), (list) =>
        list?.filter((each) => each.id !== image.id),
      );
      void queryClient.invalidateQueries({ queryKey: headerImagesKey(workspace.id) });
      setToDelete(null);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        title={t("settingsHeaderImages")}
        description={t("settingsHeaderImagesDescription")}
        onBack={onBack}
      />
      <LoadState
        isPending={images.isPending}
        isError={images.isError}
        failure={t("settingsHeaderImagesFailed")}
        onRetry={() => void images.refetch()}
      >
        {images.data?.length === 0 ? (
          <p className="text-sm">{t("settingsHeaderImagesEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.data?.map((image) => (
              <li key={image.id} className="group relative overflow-hidden rounded-md">
                <img src={image.url} alt="" className="aspect-video w-full object-cover" />
                <button
                  type="button"
                  aria-label={t("deleteHeaderImage")}
                  onClick={() => {
                    deletion.reset();
                    setToDelete(image);
                  }}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </LoadState>

      {toDelete && (
        <ConfirmDialog
          title={t("settingsHeaderImageDeleteTitle")}
          message={t("settingsHeaderImageDeleteMessage")}
          pending={deletion.isPending}
          error={deletion.isError ? t("settingsHeaderImageDeleteFailed") : null}
          onConfirm={() => deletion.mutate(toDelete)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tags

/** Whether another tag of the catalogue has [name], ignoring case and the spaces around it. */
export function isTagNameTaken(tags: DocumentTag[], name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return tags.some((tag) => tag.id !== exceptId && tag.name.trim().toLowerCase() === wanted);
}

type TagEdit =
  { kind: "new" } | { kind: "edit"; tag: DocumentTag } | { kind: "delete"; tag: DocumentTag };

/**
 * SettingsTagsScreen.kt: the tag catalogue of the workspace. A deleted tag is sent with
 * `deleted: true`, so the other devices learn about it too.
 */
export function TagsPage({ onBack }: { onBack: () => void }) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TagEdit | null>(null);

  const catalogue = useQuery({
    ...folderContentsQuery(workspace.id, ROOT_FOLDER_ID),
    select: (contents) => contents.tags.filter((tag) => !tag.deleted),
  });
  const tags = catalogue.data ?? [];

  const saving = useMutation({
    mutationFn: async (tag: DocumentTag) => {
      await saveTags(workspace.id, [tag]);
      return tag;
    },
    onSuccess: (tag) => {
      // The list shows the change before the catalogue is read again.
      queryClient.setQueryData<FolderContents>(
        menuKeys.folder(workspace.id, ROOT_FOLDER_ID),
        (contents) =>
          contents && {
            ...contents,
            tags: contents.tags.some((each) => each.id === tag.id)
              ? contents.tags.map((each) => (each.id === tag.id ? tag : each))
              : [...contents.tags, tag],
          },
      );
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
      setEditing(null);
    },
  });

  const open = (edit: TagEdit) => {
    saving.reset();
    setEditing(edit);
  };

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        title={t("settingsTags")}
        description={t("settingsTagsDescription")}
        onBack={onBack}
        action={
          <Button variant="secondary" className="h-8" onClick={() => open({ kind: "new" })}>
            <Plus size={14} aria-hidden />
            {t("settingsTagNew")}
          </Button>
        }
      />
      <LoadState
        isPending={catalogue.isPending}
        isError={catalogue.isError}
        failure={t("settingsTagsFailed")}
        onRetry={() => void catalogue.refetch()}
      >
        {tags.length === 0 ? (
          <p className="text-sm">{t("settingsTagsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-options-selector"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-on-bg">{tag.name}</span>
                  {tag.description && (
                    <span className="truncate text-xs text-text-lighter">{tag.description}</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("settingsTagEditNamed", { name: tag.name })}
                  onClick={() => open({ kind: "edit", tag })}
                  className="rounded-md p-1.5 hover:bg-highlight"
                >
                  <Pencil size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("settingsTagDeleteNamed", { name: tag.name })}
                  onClick={() => open({ kind: "delete", tag })}
                  className="rounded-md p-1.5 hover:bg-highlight"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </LoadState>

      {editing?.kind === "delete" && (
        <ConfirmDialog
          title={t("settingsTagDeleteTitle")}
          message={t("settingsTagDeleteMessage", { name: editing.tag.name })}
          pending={saving.isPending}
          error={saving.isError ? t("settingsTagSaveFailed") : null}
          onConfirm={() =>
            saving.mutate({ ...editing.tag, deleted: true, lastUpdatedAt: Date.now() })
          }
          onClose={() => setEditing(null)}
        />
      )}
      {(editing?.kind === "new" || editing?.kind === "edit") && (
        <TagFormDialog
          tag={editing.kind === "edit" ? editing.tag : null}
          catalogue={tags}
          pending={saving.isPending}
          failed={saving.isError}
          onSave={(draft) => {
            const now = Date.now();
            saving.mutate(
              editing.kind === "edit"
                ? { ...editing.tag, ...draft, lastUpdatedAt: now }
                : {
                    id: generateId(),
                    workspaceId: workspace.id,
                    ...draft,
                    createdAt: now,
                    lastUpdatedAt: now,
                    deleted: false,
                  },
            );
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TagFormDialog({
  tag,
  catalogue,
  pending,
  failed,
  onSave,
  onClose,
}: {
  tag: DocumentTag | null;
  catalogue: DocumentTag[];
  pending: boolean;
  failed: boolean;
  onSave: (draft: { name: string; description: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [description, setDescription] = useState(tag?.description ?? "");
  const trimmed = name.trim();
  const taken = trimmed !== "" && isTagNameTaken(catalogue, trimmed, tag?.id);
  const canSave = trimmed !== "" && !taken;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSave && !pending) onSave({ name: trimmed, description: description.trim() });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={tag ? t("settingsTagEdit") : t("settingsTagNew")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="settings-tag-form" disabled={!canSave} loading={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form id="settings-tag-form" className="flex flex-col gap-3" onSubmit={submit}>
        <TextField
          label={t("tagName")}
          value={name}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog is opened to type it
          autoFocus
          maxLength={60}
          error={taken ? t("tagNameTaken") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t("tagDescription")}
          placeholder={t("documentTagDescription")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {failed && (
          <p role="alert" className="text-sm text-error">
            {t("settingsTagSaveFailed")}
          </p>
        )}
      </form>
    </Dialog>
  );
}
