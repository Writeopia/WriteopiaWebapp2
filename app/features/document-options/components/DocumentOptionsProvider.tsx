import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "~/core/api";
import { t } from "~/core/i18n";
import { type Document, type Icon, ROOT_FOLDER_ID } from "~/core/models";
import { showToast } from "~/core/ui";
import { type TitleFrame, TitleFrameContext } from "~/features/editor/components/editorContext";
import { isTitle, textOf } from "~/features/editor/state/blocks";
import { ordered } from "~/features/editor/state/reducer";
import { useEditorStoreApi } from "~/features/editor/state/store";
import * as menuApi from "~/features/menu/api";
import { useMenuDialogs } from "~/features/menu/dialogs";
import { appPaths } from "~/features/menu/paths";
import { folderContentsQuery, menuKeys } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { isAiAvailable } from "../api";
import {
  type DocumentChanges,
  type DocumentOptions,
  DocumentOptionsContext,
  type OptionsDialog,
} from "../context";
import {
  documentJson,
  documentMarkdown,
  documentText,
  downloadFile,
  exportFileName,
} from "../export";
import { DocumentOptionsDialogs } from "./DocumentOptionsDialogs";
import { DocumentTitleFrame } from "./DocumentTitleFrame";

/** The title of the editor, drawn with the header, the icon and the tags of the document. */
function renderTitleFrame(props: Parameters<TitleFrame>[0]) {
  return <DocumentTitleFrame {...props} />;
}

type DocumentOptionsProviderProps = {
  document: Document;
  children: ReactNode;
};

/**
 * Holds what the options change on an open document (icon, tags, lock, favorite, folder) and
 * saves it. The document is sent without its steps, so only its own fields change, with the
 * title of the title step: the backend would otherwise take the title it was opened with.
 */
export function DocumentOptionsProvider({ document, children }: DocumentOptionsProviderProps) {
  const { workspace, user } = useWorkspace();
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openMenuDialog = useMenuDialogs((state) => state.open);
  const [current, setCurrent] = useState(document);
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<OptionsDialog>(null);

  const isPremium = user.tier === "PREMIUM";
  const catalogue = useQuery({
    ...folderContentsQuery(workspace.id, ROOT_FOLDER_ID),
    enabled: isPremium,
    select: (contents) => contents.tags.filter((tag) => !tag.deleted),
  });
  const favorites = useQuery({
    queryKey: [...menuKeys.all(workspace.id), "favoriteIds"],
    queryFn: ({ signal }) => menuApi.getFavoriteDocumentIds(workspace.id, signal),
    enabled: isPremium,
  });
  const ai = useQuery({
    queryKey: ["ai", "status"],
    queryFn: ({ signal }) => isAiAvailable(signal),
    enabled: isPremium,
    staleTime: 5 * 60_000,
  });

  // A locked document is read only until it is unlocked.
  useEffect(() => {
    store.getState().dispatch({ type: "setReadOnly", readOnly: current.isLocked });
  }, [store, current.isLocked]);

  const isFavorite = favorite ?? favorites.data?.includes(document.id) ?? document.isFavorite;

  const options = useMemo<DocumentOptions>(() => {
    const blocks = () => ordered(store.getState().state);
    const title = () => textOf(blocks().find(isTitle) ?? { text: current.title });
    const refreshMenu = () =>
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
    const failed = (error: unknown) =>
      showToast(
        t(error instanceof ApiError && error.isForbidden ? "premiumFeatureMessage" : "saveFailed"),
        { kind: "error" },
      );

    const change = (changes: DocumentChanges) => {
      const before = current;
      const next = { ...current, ...changes };
      setCurrent(next);
      menuApi
        .saveDocuments(workspace.id, [
          { ...next, title: title(), content: [], lastUpdatedAt: Date.now() },
        ])
        .then(refreshMenu)
        .catch((error: unknown) => {
          // Only what this change touched goes back; a later change keeps its fields.
          setCurrent((now) => ({
            ...now,
            ...Object.fromEntries(
              Object.keys(changes).map((key) => [key, before[key as keyof DocumentChanges]]),
            ),
          }));
          failed(error);
        });
    };

    return {
      document: { ...current, isFavorite },
      catalogue: catalogue.data ?? [],
      canUseAi: isPremium && ai.data === true,
      isPremium,
      change,
      setIcon: (icon: Icon | null) => change({ icon }),
      toggleFavorite: () => {
        const next = !isFavorite;
        setFavorite(next);
        menuApi
          .favoriteDocument(workspace.id, document.id, next)
          .then(refreshMenu)
          .catch((error: unknown) => {
            setFavorite(!next);
            failed(error);
          });
      },
      move: () =>
        openMenuDialog({
          type: "move",
          entries: [{ kind: "document", id: current.id, document: { ...current, title: title() } }],
          onMoved: (parentId) => setCurrent((now) => ({ ...now, parentId })),
        }),
      open: setDialog,
      exportMarkdown: () =>
        downloadFile(
          exportFileName(title(), "md"),
          documentMarkdown(blocks()),
          "text/markdown;charset=utf-8",
        ),
      exportJson: () =>
        downloadFile(
          exportFileName(title(), "json"),
          documentJson(current, blocks()),
          "application/json",
        ),
      currentText: () => ({ title: title(), text: documentText(blocks()) }),
    };
  }, [
    store,
    current,
    isFavorite,
    catalogue.data,
    isPremium,
    ai.data,
    workspace.id,
    document.id,
    queryClient,
    openMenuDialog,
  ]);

  return (
    <DocumentOptionsContext.Provider value={options}>
      <TitleFrameContext.Provider value={renderTitleFrame}>{children}</TitleFrameContext.Provider>
      <DocumentOptionsDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDeleted={() => void navigate(appPaths.folder(current.parentId ?? ROOT_FOLDER_ID))}
      />
    </DocumentOptionsContext.Provider>
  );
}
