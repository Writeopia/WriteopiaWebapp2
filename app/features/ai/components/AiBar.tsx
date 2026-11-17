import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { t } from "~/core/i18n";
import { Button, Spinner } from "~/core/ui";
import { useEditor, useEditorStoreApi } from "~/features/editor/state/store";

import { useAi } from "../context";

/** The button of the top bar that opens the command field. */
export function AskAiButton() {
  const { availability, reason, openCommand } = useAi();
  return (
    <button
      type="button"
      aria-label={t("askAi")}
      title={reason ?? t("askAiShortcut")}
      disabled={availability === "unavailable"}
      onClick={openCommand}
      className="flex size-9 items-center justify-center rounded-md hover:bg-options-selector disabled:opacity-40"
    >
      <Sparkles size={18} aria-hidden />
    </button>
  );
}

/**
 * The bar under the document (AiCommandBar.kt): the command field while it is open, the
 * progress of the AI with Stop while it answers, then Keep and Discard for its suggestion.
 */
export function AiBar() {
  const ai = useAi();
  const suggestion = useEditor((store) => store.state.suggestion);
  const store = useEditorStoreApi();
  const streaming = suggestion?.streaming ?? false;
  const ready = suggestion !== null && !streaming && !ai.busy;

  // Keep with ⌘/Ctrl+Enter and discard with Escape, wherever the focus is.
  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      const { dispatch } = store.getState();
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        dispatch({ type: "suggestAccept" });
      } else if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "suggestDiscard" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, store]);

  if (ready) {
    return (
      <Bar>
        <Sparkles size={16} aria-hidden className="shrink-0 text-accent" />
        <span className="flex-1 text-sm">
          {t("aiSuggestionReady")}
          <span className="ml-2 hidden text-xs text-text-lighter sm:inline">
            {t("aiSuggestionKeys")}
          </span>
        </span>
        <Button
          variant="secondary"
          className="h-8"
          onClick={() => store.getState().dispatch({ type: "suggestDiscard" })}
        >
          {t("aiDiscard")}
        </Button>
        <Button
          className="h-8"
          onClick={() => store.getState().dispatch({ type: "suggestAccept" })}
        >
          {t("aiKeep")}
        </Button>
      </Bar>
    );
  }

  if (ai.busy) {
    return (
      <Bar>
        <Spinner />
        <span role="status" className="flex-1 text-sm text-text-light">
          {suggestion ? t("aiWriting") : t("aiThinking")}
        </span>
        <Button variant="secondary" className="h-8" onClick={ai.stop}>
          {t("aiStop")}
        </Button>
      </Bar>
    );
  }

  return ai.commandOpen ? <CommandField /> : null;
}

function CommandField() {
  const { runCommand, closeCommand } = useAi();
  const [command, setCommand] = useState("");

  return (
    <Bar>
      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (command.trim()) runCommand(command.trim());
        }}
      >
        <Sparkles size={16} aria-hidden className="shrink-0 text-accent" />
        <input
          // The field is opened on purpose, to type in it at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label={t("aiCommandPlaceholder")}
          placeholder={t("aiCommandPlaceholder")}
          title={t("aiCommandHint")}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeCommand();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <Button type="submit" className="h-8" disabled={!command.trim()}>
          {t("aiCommandRun")}
        </Button>
      </form>
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-divider bg-global-bg px-3 py-2">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">{children}</div>
    </div>
  );
}
