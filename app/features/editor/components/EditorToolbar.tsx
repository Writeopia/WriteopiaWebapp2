import {
  CheckSquare,
  Code,
  FilePlus,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  Lock,
  Minus,
  Plus,
  Redo2,
  Search,
  Square,
  SquareDashed,
  Undo2,
} from "lucide-react";
import { useRef } from "react";

import { t } from "~/core/i18n";
import { StoryTypes, Tags } from "~/core/models";
import { Menu, type MenuItem } from "~/core/ui";

import { targetIds } from "../state/reducer";
import { useEditor } from "../state/store";
import type { SyncStatus } from "../sync/stepSync";
import { useEditorActions } from "./editorContext";

/**
 * The editor's part of the top bar: what is saved, find, undo and redo, and the menu that
 * adds and changes blocks. The full side panel of the desktop app comes with the document
 * options (06); these are the editor actions it will call.
 */
export function EditorToolbar({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  const readOnly = useEditor((store) => store.state.readOnly);
  const hasTarget = useEditor((store) => targetIds(store.state).length > 0);
  const canUndo = useEditor((store) => store.canUndo);
  const canRedo = useEditor((store) => store.canRedo);
  const dispatch = useEditor((store) => store.dispatch);
  const undo = useEditor((store) => store.undo);
  const redo = useEditor((store) => store.redo);
  const setSearch = useEditor((store) => store.setSearch);
  const { insertImages, addPage } = useEditorActions();
  const fileInput = useRef<HTMLInputElement>(null);

  const items: MenuItem[] = [
    {
      id: "heading-1",
      label: t("editorTitleStyle"),
      icon: <Heading1 size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleHeading", tag: Tags.H1 }),
    },
    {
      id: "heading-2",
      label: t("editorSubtitleStyle"),
      icon: <Heading2 size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleHeading", tag: Tags.H2 }),
    },
    {
      id: "heading-3",
      label: t("editorHeadingStyle"),
      icon: <Heading3 size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleHeading", tag: Tags.H3 }),
    },
    {
      id: "checkbox",
      label: t("slashCheckbox"),
      icon: <CheckSquare size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleType", storyType: StoryTypes.CHECK_ITEM }),
    },
    {
      id: "list",
      label: t("slashList"),
      icon: <List size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleType", storyType: StoryTypes.UNORDERED_LIST_ITEM }),
    },
    {
      id: "code",
      label: t("editorCode"),
      icon: <Code size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleType", storyType: StoryTypes.CODE_BLOCK }),
    },
    {
      id: "box",
      label: t("slashBox"),
      icon: <SquareDashed size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleTag", tag: Tags.HIGH_LIGHT_BLOCK }),
    },
    {
      id: "card",
      label: t("slashCard"),
      icon: <Square size={16} />,
      disabled: !hasTarget,
      onSelect: () => dispatch({ type: "toggleTag", tag: Tags.CARD_BLOCK }),
    },
    {
      id: "divider",
      label: t("slashDivider"),
      icon: <Minus size={16} />,
      onSelect: () => dispatch({ type: "toggleType", storyType: StoryTypes.DIVIDER }),
    },
    {
      id: "image",
      label: t("editorImage"),
      icon: <Image size={16} />,
      onSelect: () => fileInput.current?.click(),
    },
    {
      id: "page",
      label: t("editorAddPage"),
      icon: <FilePlus size={16} />,
      onSelect: addPage,
    },
  ];

  return (
    <div className="ml-auto flex items-center gap-1">
      <SaveStatus status={status} onRetry={onRetry} />
      {readOnly ? (
        <span className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-lighter">
          <Lock size={14} aria-hidden />
          {t("editorLocked")}
        </span>
      ) : (
        <>
          <IconButton label={t("undo")} disabled={!canUndo} onClick={undo}>
            <Undo2 size={16} aria-hidden />
          </IconButton>
          <IconButton label={t("redo")} disabled={!canRedo} onClick={redo}>
            <Redo2 size={16} aria-hidden />
          </IconButton>
        </>
      )}
      <IconButton label={t("editorFind")} onClick={() => setSearch({ open: true })}>
        <Search size={16} aria-hidden />
      </IconButton>
      {!readOnly && (
        <>
          <Menu
            label={t("editorInsert")}
            align="end"
            items={items}
            trigger={<Plus size={18} aria-hidden />}
            triggerClassName="flex size-9 items-center justify-center rounded-md hover:bg-options-selector"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) insertImages(files);
            }}
          />
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      // The caret stays in the text.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-md hover:bg-options-selector disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SaveStatus({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  if (status === "failed") {
    return (
      <span role="alert" className="flex items-center gap-2 px-2 text-sm text-error">
        {t("editorSaveFailed")}
        <button type="button" onClick={onRetry} className="font-medium underline">
          {t("retry")}
        </button>
      </span>
    );
  }
  return (
    <span role="status" className="px-2 text-sm text-text-lighter">
      {status === "saved" ? t("editorSaved") : t("editorSaving")}
    </span>
  );
}
