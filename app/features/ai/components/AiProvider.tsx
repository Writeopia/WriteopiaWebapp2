import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { t } from "~/core/i18n";
import { showToast } from "~/core/ui";
import { useDocumentOptions } from "~/features/document-options/context";
import { titleText } from "~/features/editor/state/reducer";
import { useEditorStoreApi } from "~/features/editor/state/store";

import { aiFailure } from "../api";
import { type AiAvailability, AiContext, type AiControls, aiKeys } from "../context";
import { runCommand, runQuickAction } from "../runner";

type AiProviderProps = {
  children: ReactNode;
  /** Takes the function that opens the command field, for the editor's shortcut. */
  registerAskAi?: (open: () => void) => void;
};

/**
 * The AI of the open document: who may ask it, the request running, and what a failure tells
 * the writer. One request at a time; Stop cancels it and the document comes back as it was.
 */
export function AiProvider({ children, registerAskAi }: AiProviderProps) {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();
  const { canUseAi, isPremium, open } = useDocumentOptions();
  const [commandOpen, setCommandOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const availability: AiAvailability = !isPremium ? "premium" : canUseAi ? "ready" : "unavailable";

  // Leaving the document stops what the AI is writing.
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    (work: (signal: AbortSignal) => Promise<void>) => {
      if (availability === "premium") {
        open("premium");
        return;
      }
      if (availability !== "ready" || controller.current) return;

      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      work(current.signal)
        .catch((error: unknown) => {
          if (current.signal.aborted) return;
          const failure = aiFailure(error);
          if (failure === "premium") open("premium");
          else if (failure === "quota") showToast(t("aiQuotaExceeded"), { kind: "error" });
          else {
            const reason = error instanceof Error ? error.message : String(error);
            showToast(t("aiFailed", { reason }), { kind: "error" });
          }
        })
        .finally(() => {
          if (controller.current === current) controller.current = null;
          setBusy(false);
          void queryClient.invalidateQueries({ queryKey: aiKeys.usage });
        });
    },
    [availability, open, queryClient],
  );

  const openCommand = useCallback(() => {
    if (availability === "premium") open("premium");
    else if (availability === "ready") setCommandOpen(true);
  }, [availability, open]);

  useEffect(() => registerAskAi?.(openCommand), [registerAskAi, openCommand]);

  const controls = useMemo<AiControls>(
    () => ({
      availability,
      reason:
        availability === "ready"
          ? null
          : availability === "premium"
            ? t("aiPremiumOnly")
            : t("aiUnavailable"),
      busy,
      commandOpen,
      openCommand,
      closeCommand: () => setCommandOpen(false),
      runCommand: (command) => {
        setCommandOpen(false);
        run((signal) => runCommand(store, command, titleText(store.getState().state), signal));
      },
      runQuickAction: (action, target) =>
        run((signal) => runQuickAction(store, action, target, signal)),
      run,
      stop: () => {
        controller.current?.abort();
        controller.current = null;
        setBusy(false);
        // What was suggested so far goes too.
        store.getState().dispatch({ type: "suggestDiscard" });
      },
    }),
    [availability, busy, commandOpen, openCommand, run, store],
  );

  return <AiContext.Provider value={controls}>{children}</AiContext.Provider>;
}
