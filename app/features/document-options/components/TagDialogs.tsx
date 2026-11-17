import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";

import { t } from "~/core/i18n";
import { generateId } from "~/core/id";
import { type DocumentTag, type FolderContents, ROOT_FOLDER_ID } from "~/core/models";
import { Button, Dialog, TextField } from "~/core/ui";
import { menuKeys } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { saveTags, suggestTag } from "../api";
import { useDocumentOptions } from "../context";

/** The tags of the document, picked from the catalogue of the workspace. */
export function TagsDialog({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const { document, catalogue, change } = useDocumentOptions();
  const [selected, setSelected] = useState(() => new Set(document.tagIds));
  const readOnly = document.isLocked;

  const save = () => {
    // The order of the document's tags is kept; new ones go after them.
    const kept = document.tagIds.filter((id) => selected.has(id));
    const added = catalogue
      .map((tag) => tag.id)
      .filter((id) => selected.has(id) && !kept.includes(id));
    change({ tagIds: [...kept, ...added] });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("documentTags")}
      actions={
        <>
          {!readOnly && (
            <Button variant="ghost" className="mr-auto" onClick={onAdd}>
              {t("tagAdd")}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          {!readOnly && <Button onClick={save}>{t("save")}</Button>}
        </>
      }
    >
      {catalogue.length === 0 ? (
        <p className="text-sm">{t("tagsNone")}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {catalogue.map((tag) => (
            <li key={tag.id}>
              <label className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-options-selector">
                <input
                  type="checkbox"
                  className="mt-1 accent-accent"
                  checked={selected.has(tag.id)}
                  disabled={readOnly}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(tag.id);
                    else next.delete(tag.id);
                    setSelected(next);
                  }}
                />
                <span className="flex flex-col">
                  <span className="text-on-bg">{tag.name}</span>
                  {tag.description && (
                    <span className="text-sm text-text-lighter">{tag.description}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/**
 * A new tag for the catalogue, added to the document at once. Its name must be new to the
 * catalogue. The AI can write a first version, to change before saving.
 */
export function AddTagDialog({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { document, catalogue, change, canUseAi, currentText } = useDocumentOptions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const trimmed = name.trim();
  const taken = catalogue.some((tag) => tag.name.trim().toLowerCase() === trimmed.toLowerCase());

  const suggestion = useMutation({
    mutationFn: () => {
      const { title, text } = currentText();
      return suggestTag({
        documentTitle: title,
        documentText: text,
        existingTagNames: catalogue.map((tag) => tag.name),
      });
    },
    onSuccess: (draft) => {
      setName(draft.name);
      setDescription(draft.description);
    },
  });

  const creation = useMutation({
    mutationFn: async (tag: DocumentTag) => {
      await saveTags(workspace.id, [tag]);
      return tag;
    },
    onSuccess: (tag) => {
      // The catalogue knows the tag before it is read again, so its chip has a name.
      queryClient.setQueryData<FolderContents>(
        menuKeys.folder(workspace.id, ROOT_FOLDER_ID),
        (contents) => contents && { ...contents, tags: [...contents.tags, tag] },
      );
      change({ tagIds: [...document.tagIds, tag.id] });
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed === "" || taken) return;
    const now = Date.now();
    creation.mutate({
      id: generateId(),
      workspaceId: workspace.id,
      name: trimmed,
      description: description.trim(),
      createdAt: now,
      lastUpdatedAt: now,
      deleted: false,
    });
  };

  return (
    <Dialog open onClose={onClose} title={t("tagNew")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("tagName")}
          value={name}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog is for typing a name
          autoFocus
          error={taken ? t("tagNameTaken") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t("tagDescription")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {suggestion.isError && (
          <p role="alert" className="text-sm text-error">
            {t("tagSuggestFailed")}
          </p>
        )}
        {creation.isError && (
          <p role="alert" className="text-sm text-error">
            {t("tagCreateFailed")}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {canUseAi && (
            <Button
              variant="ghost"
              className="mr-auto"
              loading={suggestion.isPending}
              onClick={() => suggestion.mutate()}
            >
              <Sparkles size={16} aria-hidden />
              {t("tagSuggest")}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={creation.isPending} disabled={trimmed === "" || taken}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
