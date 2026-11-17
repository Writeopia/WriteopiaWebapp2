import { FolderInput, Sparkles, Tags, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { t } from "~/core/i18n";
import type { StringKey } from "~/core/i18n/strings.en";
import { ROOT_FOLDER_ID } from "~/core/models";
import { Spinner } from "~/core/ui";
import { useDocumentOptions } from "~/features/document-options/context";
import { useEditorActions } from "~/features/editor/components/editorContext";
import { ordered } from "~/features/editor/state/reducer";
import { useEditor, useEditorStoreApi } from "~/features/editor/state/store";
import type { EditorState } from "~/features/editor/state/types";

import { applyWritingAction } from "../actions";
import { type AgentState, WritingAgent } from "../agent";
import { type WritingAction, writingSuggestions } from "../api";
import { useAi } from "../context";
import { FolderSuggestionDialog, TagSuggestionDialog } from "./SuggestionDialogs";

const LABELS: Record<WritingAction, StringKey> = {
  CODE_BLOCK: "writingSuggestionCodeBlock",
  LIST: "writingSuggestionList",
  CHECK_LIST: "writingSuggestionCheckList",
  NEW_DOCUMENT_LINK: "writingSuggestionNewDocumentLink",
  IMAGE: "writingSuggestionImage",
  DRAWING: "writingSuggestionDrawing",
  SPREADSHEET: "writingSuggestionSpreadsheet",
  SECTION_HEADING: "writingSuggestionSectionHeading",
  DOCUMENT_TITLE: "writingSuggestionDocumentTitle",
  CALLOUT: "writingSuggestionCallout",
  TLDR: "writingSuggestionTldr",
  CONCLUSION: "writingSuggestionConclusion",
};

/**
 * The suggestions of the writing agent (WritingSuggestionsBox.kt), in a small box at the
 * corner of the document: the actions the writer likely wants next, and the offers to file and
 * tag the document.
 */
export function WritingAgentBox() {
  const ai = useAi();
  const store = useEditorStoreApi();
  const { addPage } = useEditorActions();
  const { document } = useDocumentOptions();
  const readOnly = useEditor((editor) => editor.state.readOnly);
  const hasSuggestion = useEditor((editor) => editor.state.suggestion !== null);
  const [state, setState] = useState<AgentState | null>(null);
  const [dialog, setDialog] = useState<"folder" | "tags" | null>(null);
  const agent = useRef<WritingAgent | null>(null);

  const inRoot = (document.parentId ?? ROOT_FOLDER_ID) === ROOT_FOLDER_ID;
  const hasTags = document.tagIds.length > 0;
  const meta = useRef({ inRoot, hasTags });

  const ready = ai.availability === "ready" && !readOnly;

  useEffect(() => {
    if (!ready) return;
    const documentOf = (editor: EditorState) => ({
      blocks: ordered(editor).filter((block) => !block.hidden && !block.ephemeral),
      focusId: editor.focus?.id ?? null,
      ...meta.current,
    });
    const created = new WritingAgent({ ask: writingSuggestions, onChange: setState });
    agent.current = created;
    created.open(documentOf(store.getState().state));
    const unsubscribe = store.subscribe((current, previous) => {
      if (current.state !== previous.state) created.update(documentOf(current.state));
    });
    return () => {
      unsubscribe();
      created.stop();
      agent.current = null;
      setState(null);
    };
  }, [ready, store]);

  // A move or a tag changes the offers.
  useEffect(() => {
    meta.current = { inRoot, hasTags };
    const editor = store.getState().state;
    agent.current?.update({
      blocks: ordered(editor).filter((block) => !block.hidden && !block.ephemeral),
      focusId: editor.focus?.id ?? null,
      inRoot,
      hasTags,
    });
  }, [inRoot, hasTags, store]);

  const dialogs = (
    <>
      {dialog === "folder" && (
        <FolderSuggestionDialog
          onClose={() => setDialog(null)}
          onDone={() => agent.current?.declineFolder()}
        />
      )}
      {dialog === "tags" && (
        <TagSuggestionDialog
          onClose={() => setDialog(null)}
          onDone={() => agent.current?.declineTags()}
        />
      )}
    </>
  );

  if (
    !state ||
    (state.suggestions.length === 0 && !state.offerFolder && !state.offerTags && !state.loading)
  ) {
    return dialogs;
  }

  const blocked = ai.busy || hasSuggestion;
  const apply = (action: WritingAction) => {
    const blockId = state.blockId;
    agent.current?.take(action);
    ai.run((signal) => applyWritingAction(action, blockId, { store, addPage, signal }));
  };

  return (
    <>
      <section
        aria-label={t("writingSuggestionsBadge")}
        className="absolute right-4 bottom-4 z-10 flex w-64 flex-col gap-1 rounded-lg border border-card-border bg-card-bg p-2 shadow-lg"
      >
        <header className="flex items-center gap-2 px-1">
          <Sparkles size={14} aria-hidden className="text-accent" />
          <h2 className="flex-1 text-xs font-bold tracking-wide text-text-lighter uppercase">
            {t("writingSuggestions")}
          </h2>
          {state.loading && <Spinner />}
          <button
            type="button"
            aria-label={t("writingSuggestionsHide")}
            title={t("writingSuggestionsHide")}
            onClick={() => agent.current?.dismiss()}
            className="flex size-6 items-center justify-center rounded hover:bg-options-selector"
          >
            <X size={14} aria-hidden />
          </button>
        </header>
        {state.suggestions.map(({ action }) => (
          <Item key={action} disabled={blocked} onClick={() => apply(action)}>
            {t(LABELS[action])}
          </Item>
        ))}
        {state.offerFolder && (
          <Item disabled={blocked} onClick={() => setDialog("folder")}>
            <FolderInput size={14} aria-hidden />
            {t("writingSuggestionFolder")}
          </Item>
        )}
        {state.offerTags && (
          <Item disabled={blocked} onClick={() => setDialog("tags")}>
            <Tags size={14} aria-hidden />
            {t("writingSuggestionTags")}
          </Item>
        )}
      </section>
      {dialogs}
    </>
  );
}

function Item(props: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-options-selector disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
