import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand";

import type { Document, FolderContents } from "~/core/models";
import { patchDocument } from "~/features/menu/cache";
import { menuKeys } from "~/features/menu/queries";

import { syncSteps } from "../api";
import { ordered, titleText } from "../state/reducer";
import type { EditorStore } from "../state/store";
import { StepSync, type SyncStatus } from "./stepSync";

/** How long the title waits before the menu shows it. */
const TITLE_DELAY_MS = 500;

/**
 * Saves the open document while it is edited: its steps through the step sync, which also
 * brings the changes made elsewhere; the title follows in the menu. Warns before the page
 * closes with changes not saved, and sends them at once when the page is hidden.
 */
export function useDocumentSync(
  store: StoreApi<EditorStore>,
  document: Document,
  workspaceId: string,
): { status: SyncStatus; retry: () => void; flush: () => Promise<void> } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>("saved");
  const syncRef = useRef<StepSync | null>(null);

  useEffect(() => {
    const sync = new StepSync(
      {
        documentId: document.id,
        workspaceId,
        send: (request) => syncSteps(workspaceId, request),
        onServerUpdate: (steps, deletedIds, keepIds) =>
          store
            .getState()
            .dispatch({ type: "serverUpdate", steps, deletedIds, keepIds }, { history: false }),
        onStatus: setStatus,
      },
      ordered(store.getState().state),
    );
    syncRef.current = sync;

    let title = titleText(store.getState().state);
    let titleTimer: ReturnType<typeof setTimeout> | null = null;
    const showTitle = (value: string) => {
      queryClient.setQueriesData<FolderContents>(
        { queryKey: menuKeys.contents(workspaceId) },
        (contents) =>
          contents ? patchDocument(contents, document.id, { title: value }) : contents,
      );
    };

    const unsubscribe = store.subscribe((current, previous) => {
      const { state } = current;
      if (state.blocks === previous.state.blocks && state.order === previous.state.order) return;
      sync.update(ordered(state));

      const nextTitle = titleText(state);
      if (nextTitle !== title) {
        title = nextTitle;
        if (titleTimer) clearTimeout(titleTimer);
        titleTimer = setTimeout(() => showTitle(nextTitle), TITLE_DELAY_MS);
      }
    });

    const onHidden = () => {
      if (window.document.visibilityState === "hidden") void sync.flush();
    };
    const onPageHide = () => void sync.flush();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!sync.hasUnsaved()) return;
      void sync.flush();
      event.preventDefault();
    };
    window.document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (titleTimer) {
        clearTimeout(titleTimer);
        showTitle(title);
      }
      // Leaving the document sends what waits, then the menu reads the lists again.
      void sync.flush().finally(() => {
        sync.stop();
        void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspaceId) });
      });
    };
  }, [store, document.id, workspaceId, queryClient]);

  const retry = useCallback(() => void syncRef.current?.retry(), []);
  const flush = useCallback(() => syncRef.current?.flush() ?? Promise.resolve(), []);
  return { status, retry, flush };
}
