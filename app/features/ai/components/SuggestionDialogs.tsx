import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, Sparkles } from "lucide-react";
import { useState } from "react";

import { t } from "~/core/i18n";
import { generateId } from "~/core/id";
import { type DocumentTag, type FolderContents, ROOT_FOLDER_ID } from "~/core/models";
import { Button, Dialog, showToast, Spinner } from "~/core/ui";
import { saveTags, suggestTag } from "~/features/document-options/api";
import { useDocumentOptions } from "~/features/document-options/context";
import { createFolder, moveDocument } from "~/features/menu/api";
import { menuKeys } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { promptAbout } from "../actions";
import { oneLine } from "../actions";
import { askAi, folderSuggestions, MAX_TAG_CANDIDATES, tagSuggestions } from "../api";

const FOLDER_NAME_PROMPT =
  "Name a folder that would hold the following document and others like it: a broad category " +
  'of at most three words, like "Meetings", "Recipes" or "Project Atlas", not a title for ' +
  "this one document. Answer only with the name: no quotes, no Markdown, no punctuation. Use " +
  "the language of the text.";

type DialogProps = {
  onClose: () => void;
  /** The offer is taken: it is not made again for this document. */
  onDone: () => void;
};

/**
 * Files a document of the root (FolderSuggestionDialog.kt): the folders the backend says it
 * belongs to, and a new folder named by the AI.
 */
export function FolderSuggestionDialog({ onClose, onDone }: DialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { document, serverChanged, currentText } = useDocumentOptions();

  const suggestions = useQuery({
    queryKey: ["ai", "folderSuggestions", document.id],
    queryFn: ({ signal }) => {
      const { title, text } = currentText();
      return folderSuggestions(
        { documentTitle: title, documentText: text, workspaceId: workspace.id },
        signal,
      );
    },
    retry: false,
    gcTime: 0,
  });

  const move = useMutation({
    mutationFn: async (target: { folderId: string } | { create: true }) => {
      let folderId: string;
      if ("folderId" in target) {
        folderId = target.folderId;
      } else {
        const { title, text } = currentText();
        const name = oneLine(
          await askAi(promptAbout(FOLDER_NAME_PROMPT, `Title: ${title}\n\n${text}`)),
        );
        if (!name) throw new Error("The AI answered no folder name");
        folderId = (await createFolder(workspace.id, ROOT_FOLDER_ID, { title: name, icon: null }))
          .id;
      }
      await moveDocument(workspace.id, document.id, folderId);
      return folderId;
    },
    onSuccess: (folderId) => {
      serverChanged({ parentId: folderId });
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
      onDone();
      onClose();
    },
    onError: (_, target) =>
      showToast(t("folderId" in target ? "folderSuggestionMoveFailed" : "folderSuggestionFailed"), {
        kind: "error",
      }),
  });

  const options = suggestions.data ?? [];

  return (
    <Dialog open onClose={onClose} title={t("folderSuggestionTitle")}>
      <div className="flex flex-col gap-2">
        {suggestions.isPending ? (
          <p className="flex items-center gap-2 text-sm text-text-light">
            <Spinner /> {t("folderSuggestionLoading")}
          </p>
        ) : (
          options.length === 0 && (
            <p className="text-sm text-text-light">{t("folderSuggestionNone")}</p>
          )
        )}
        {options.map((option) => (
          <button
            key={option.folderId}
            type="button"
            disabled={move.isPending}
            onClick={() => move.mutate({ folderId: option.folderId })}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-options-selector disabled:opacity-50"
          >
            <Folder size={16} aria-hidden />
            {option.folderName || option.folderId}
          </button>
        ))}
        <Button
          variant="secondary"
          loading={move.isPending && !("folderId" in (move.variables ?? {}))}
          disabled={move.isPending || suggestions.isPending}
          onClick={() => move.mutate({ create: true })}
        >
          <Sparkles size={16} aria-hidden />
          {move.isPending && !("folderId" in (move.variables ?? {}))
            ? t("folderSuggestionCreating")
            : t("folderSuggestionCreate")}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Tags an untagged document (TagSuggestionDialog.kt): the tags of the catalogue the backend
 * says fit, all selected, and a new tag made up by the AI.
 */
export function TagSuggestionDialog({ onClose, onDone }: DialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { document, catalogue, change, currentText } = useDocumentOptions();
  const candidates = catalogue.slice(0, MAX_TAG_CANDIDATES);
  // The tags the writer unticked; the suggested ones start ticked.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());

  const suggestions = useQuery({
    queryKey: ["ai", "tagSuggestions", document.id],
    queryFn: ({ signal }) => {
      const { title, text } = currentText();
      return tagSuggestions(
        {
          documentTitle: title,
          documentText: text,
          tags: candidates.map(({ id, name, description }) => ({ id, name, description })),
        },
        signal,
      );
    },
    enabled: candidates.length > 0,
    retry: false,
    gcTime: 0,
  });

  const options = (suggestions.data ?? [])
    .map((suggestion) => candidates.find((tag) => tag.id === suggestion.tagId))
    .filter((tag): tag is DocumentTag => tag !== undefined);

  const creation = useMutation({
    mutationFn: async () => {
      const { title, text } = currentText();
      const draft = await suggestTag({
        documentTitle: title,
        documentText: text,
        existingTagNames: catalogue.map((tag) => tag.name),
      });
      const now = Date.now();
      const tag: DocumentTag = {
        id: generateId(),
        workspaceId: workspace.id,
        name: draft.name,
        description: draft.description,
        createdAt: now,
        lastUpdatedAt: now,
        deleted: false,
      };
      await saveTags(workspace.id, [tag]);
      return tag;
    },
    onSuccess: (tag) => {
      queryClient.setQueryData<FolderContents>(
        menuKeys.folder(workspace.id, ROOT_FOLDER_ID),
        (contents) => contents && { ...contents, tags: [...contents.tags, tag] },
      );
      change({ tagIds: [...document.tagIds, tag.id] });
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
      onDone();
      onClose();
    },
    onError: () => showToast(t("tagSuggestionFailed"), { kind: "error" }),
  });

  const chosen = options.filter((tag) => !unticked.has(tag.id));
  const loading = candidates.length > 0 && suggestions.isPending;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("tagSuggestionTitle")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={chosen.length === 0 || creation.isPending}
            onClick={() => {
              change({ tagIds: [...document.tagIds, ...chosen.map((tag) => tag.id)] });
              onDone();
              onClose();
            }}
          >
            {t("tagSuggestionApply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-text-light">
            <Spinner /> {t("tagSuggestionLoading")}
          </p>
        )}
        {candidates.length === 0 && (
          <p className="text-sm text-text-light">{t("tagSuggestionCatalogueEmpty")}</p>
        )}
        {!loading && candidates.length > 0 && options.length === 0 && (
          <p className="text-sm text-text-light">{t("tagSuggestionNone")}</p>
        )}
        {options.map((tag) => (
          <label key={tag.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-accent"
              checked={!unticked.has(tag.id)}
              onChange={(event) => {
                const next = new Set(unticked);
                if (event.target.checked) next.delete(tag.id);
                else next.add(tag.id);
                setUnticked(next);
              }}
            />
            <span>
              {tag.name}
              {tag.description && (
                <span className="block text-xs text-text-lighter">{tag.description}</span>
              )}
            </span>
          </label>
        ))}
        <Button
          variant="secondary"
          loading={creation.isPending}
          disabled={loading}
          onClick={() => creation.mutate()}
        >
          <Sparkles size={16} aria-hidden />
          {creation.isPending ? t("tagSuggestionCreating") : t("tagSuggestionCreate")}
        </Button>
      </div>
    </Dialog>
  );
}
