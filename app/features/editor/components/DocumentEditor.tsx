import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { type Document, ROOT_FOLDER_ID, StoryTypes } from "~/core/models";
import { showToast } from "~/core/ui";
import { saveDocuments } from "~/features/menu/api";
import { appPaths } from "~/features/menu/paths";
import { menuKeys, newDocument } from "~/features/menu/queries";
import { TopBar } from "~/features/shell/components/TopBar";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { describeLinkCard, uploadImage } from "../api";
import { isTitle, newBlock, textOf } from "../state/blocks";
import { find, ordered } from "../state/reducer";
import { linkAt, sliceSpans } from "../state/spans";
import { createEditorStore, EditorStoreContext, useEditor } from "../state/store";
import type { Block, Caret } from "../state/types";
import { useDocumentSync } from "../sync/useDocumentSync";
import { EditorCanvas } from "./EditorCanvas";
import { type EditorActions, EditorActionsContext } from "./editorContext";
import { EditorToolbar } from "./EditorToolbar";
import { FindBar } from "./FindBar";
import { LinkDialog } from "./LinkDialog";

type DocumentEditorProps = {
  document: Document;
  /** Drawn at the start of the top bar: the way back. */
  navigation: React.ReactNode;
};

/** An open document: its blocks, its saving, and the work the blocks ask for. */
export function DocumentEditor({ document, navigation }: DocumentEditorProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<{ caret: Caret; url: string } | null>(null);

  const [store] = useState(() => {
    const created = createEditorStore();
    created.getState().dispatch({ type: "load", document, readOnly: document.isLocked });
    return created;
  });
  const { status, retry, flush } = useDocumentSync(store, document, workspace.id);

  useEffect(() => {
    store.getState().dispatch({ type: "setReadOnly", readOnly: document.isLocked });
  }, [store, document.isLocked]);

  // A link card made here (a pasted address) gets the description of its page from the
  // backend, once it is saved there.
  useEffect(() => {
    const described = new Set(
      ordered(store.getState().state)
        .filter((block) => block.type.number === StoryTypes.LINK_CARD.number)
        .map((block) => block.id),
    );
    return store.subscribe(({ state }) => {
      for (const block of ordered(state)) {
        if (block.type.number !== StoryTypes.LINK_CARD.number || described.has(block.id)) continue;
        described.add(block.id);
        void describe(block);
      }
    });

    async function describe(card: Block) {
      const { setDescribing, dispatch } = store.getState();
      setDescribing(card.id, true);
      try {
        await flush();
        const current = find(store.getState().state, card.id)?.block;
        if (!current) return;
        const described = await describeLinkCard(workspace.id, document.id, current);
        if (described) {
          dispatch(
            { type: "updateBlock", id: card.id, changes: { text: described.text } },
            { history: false },
          );
        }
      } catch {
        // The card stays without a description.
      } finally {
        setDescribing(card.id, false);
      }
    }
  }, [store, flush, workspace.id, document.id]);

  const actions = useMemo<EditorActions>(
    () => ({
      insertImages: (files, afterId) => {
        let after = afterId;
        for (const file of files) {
          const { dispatch, setUploading } = store.getState();
          const image: Block = { ...newBlock(StoryTypes.IMAGE, { text: null }), ephemeral: true };
          const preview = URL.createObjectURL(file);
          setUploading(image.id, preview);
          dispatch({ type: "insertBlocks", blocks: [image], afterId: after });
          after = image.id;

          uploadImage(file, file.name)
            .then((url) => {
              store
                .getState()
                .dispatch(
                  { type: "updateBlock", id: image.id, changes: { url, ephemeral: false } },
                  { history: false },
                );
            })
            .catch(() => {
              store.getState().dispatch({ type: "removeBlock", id: image.id }, { history: false });
              showToast(t("editorImageUploadFailed"), { kind: "error" });
            })
            .finally(() => {
              store.getState().setUploading(image.id, null);
              URL.revokeObjectURL(preview);
            });
        }
      },

      openLinkDialog: (caret) => {
        const block = find(store.getState().state, caret.id)?.block;
        if (!block || caret.start >= caret.end) return;
        const existing = linkAt(sliceSpans(block.spans, caret.start, caret.end), 0);
        setLink({ caret, url: existing?.extra ?? "" });
      },

      addPage: () => {
        const { state, dispatch } = store.getState();
        const focused = state.focus ? find(state, state.focus.id)?.block : undefined;
        const anchor = focused ?? ordered(state)[state.order.length - 1];
        const title = anchor && !isTitle(anchor) ? textOf(anchor).trim() : "";

        const page = newDocument(workspace.id, document.parentId ?? ROOT_FOLDER_ID);
        page.title = title;
        page.content = page.content.map((step) => ({ ...step, text: title }));

        saveDocuments(workspace.id, [page])
          .then(() => {
            dispatch({
              type: "insertBlocks",
              afterId: anchor?.id ?? null,
              blocks: [
                newBlock(StoryTypes.DOCUMENT_LINK, {
                  text: title,
                  documentLink: { id: page.id, title },
                }),
              ],
            });
            void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
          })
          .catch(() => showToast(t("createDocumentFailed"), { kind: "error" }));
      },

      openDocument: (documentId) => void navigate(appPaths.document(documentId)),

      focusCanvas: () => {
        const canvas = containerRef.current?.querySelector<HTMLElement>("[data-editor-canvas]");
        if (!canvas) return;
        const active = window.document.activeElement as HTMLElement | null;
        if (active && active !== canvas) active.blur();
        canvas.focus({ preventScroll: true });
      },
    }),
    [store, workspace.id, document.parentId, navigate, queryClient],
  );

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorActionsContext.Provider value={actions}>
        <div ref={containerRef} className="flex h-full flex-col">
          <TopBar>
            {navigation}
            <EditorToolbar status={status} onRetry={retry} />
          </TopBar>
          <SearchBar container={containerRef} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EditorCanvas />
          </div>
          {link && (
            <LinkDialog
              open
              initial={link.url}
              onClose={() => setLink(null)}
              onSave={(url) => {
                store.getState().dispatch({ type: "setLink", ...link.caret, url });
                setLink(null);
              }}
              onRemove={() => {
                store.getState().dispatch({ type: "setLink", ...link.caret, url: null });
                setLink(null);
              }}
            />
          )}
        </div>
      </EditorActionsContext.Provider>
    </EditorStoreContext.Provider>
  );
}

function SearchBar({ container }: { container: React.RefObject<HTMLElement | null> }) {
  const open = useEditor((store) => store.search.open);
  return open ? <FindBar canvas={container} /> : null;
}
