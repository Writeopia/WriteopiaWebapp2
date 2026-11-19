import {
  CheckSquare,
  Code,
  FilePlus,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Link,
  List,
  Square,
  SquareDashed,
  X,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import { t } from "~/core/i18n";
import { type Span, Spans, StoryTypes, Tags } from "~/core/models";
import { cn } from "~/core/ui";
import { AiPanel } from "~/features/ai/components/AiPanel";
import { useEditorActions } from "~/features/editor/components/editorContext";
import { targetIds } from "~/features/editor/state/reducer";
import { useEditor } from "~/features/editor/state/store";

import { useDocumentOptions } from "../context";
import { FONTS, useEditorFont } from "../font";
import { useDocumentActionItems } from "./DocumentActions";

type Tab = "page" | "text" | "ai";

const TAB_LABELS = {
  page: "sidePanelPage",
  text: "sidePanelText",
  ai: "sidePanelAi",
} as const;

/**
 * The side panel of the editor (SideEditorOptions.kt): the page — header, font, tags, actions,
 * export, publish — and the text — styles, highlights, decorations and blocks to insert. Each
 * text action goes to the focused block or the selected blocks.
 */
export function SidePanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("page");

  return (
    <aside
      aria-label={t("sidePanel")}
      // Its actions work on the selected lines, so a press here keeps them selected.
      data-keeps-selection
      className="flex w-72 shrink-0 flex-col border-l border-divider bg-global-bg"
    >
      <div className="flex items-center gap-1 border-b border-divider p-2">
        <div role="tablist" aria-label={t("sidePanel")} className="flex flex-1 gap-1">
          {(["page", "text", "ai"] as const).map((each) => (
            <button
              key={each}
              type="button"
              role="tab"
              aria-selected={tab === each}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setTab(each)}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                tab === each ? "bg-selected-bg text-accent" : "hover:bg-options-selector",
              )}
            >
              {t(TAB_LABELS[each])}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={t("sidePanelClose")}
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-md hover:bg-options-selector"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div role="tabpanel" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        {tab === "page" ? <PageOptions /> : tab === "text" ? <TextOptions /> : <AiPanel />}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-bold tracking-wide text-text-lighter uppercase">{title}</h3>
      {children}
    </section>
  );
}

type OptionButtonProps = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
  onClick: () => void;
};

function OptionButton({ label, icon, disabled, danger, pressed, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      // The caret stays in the text, for the text actions.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-options-selector disabled:opacity-40",
        danger && "text-error",
        pressed && "bg-selected-bg text-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PageOptions() {
  const { document, catalogue, open } = useDocumentOptions();
  const font = useEditorFont((state) => state.font);
  const setFont = useEditorFont((state) => state.setFont);
  const items = useDocumentActionItems();
  const tags = catalogue.filter((tag) => document.tagIds.includes(tag.id));
  const byId = (id: string) => items.find((item) => item.id === id)!;
  const render = (id: string) => {
    const item = byId(id);
    return (
      <OptionButton
        key={id}
        label={item.label}
        icon={item.icon}
        disabled={item.disabled}
        danger={item.danger}
        onClick={item.onSelect}
      />
    );
  };

  return (
    <>
      <Section title={t("headerTitle")}>{render("header")}</Section>

      <Section title={t("font")}>
        <div role="radiogroup" aria-label={t("font")} className="grid grid-cols-2 gap-1">
          {FONTS.map((each) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={font === each}
              onClick={() => setFont(each)}
              className={cn(
                "rounded-md border border-card-border px-2 py-1 text-sm",
                font === each && "border-accent bg-selected-bg text-accent",
              )}
            >
              {t(`font${each}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("documentTags")}>
        {tags.length === 0 ? (
          <p className="px-2 text-sm text-text-lighter">{t("documentTagsNone")}</p>
        ) : (
          <p className="px-2 text-sm">{tags.map((tag) => tag.name).join(", ")}</p>
        )}
        <OptionButton label={t("documentTagsView")} onClick={() => open("tags")} />
        {!document.isLocked && <OptionButton label={t("tagAdd")} onClick={() => open("addTag")} />}
      </Section>

      <Section title={t("actions")}>
        {["favorite", "lock", "move", "find", "icon", "delete"].map(render)}
      </Section>

      <Section title={t("export")}>{["exportMarkdown", "exportJson"].map(render)}</Section>

      <Section title={t("publish")}>{render("publish")}</Section>
    </>
  );
}

const HIGHLIGHTS: {
  span: Span;
  label: "highlightYellow" | "highlightGreen" | "highlightRed";
  className: string;
}[] = [
  { span: Spans.HIGHLIGHT_YELLOW, label: "highlightYellow", className: "text-yellow-500" },
  { span: Spans.HIGHLIGHT_GREEN, label: "highlightGreen", className: "text-green-600" },
  { span: Spans.HIGHLIGHT_RED, label: "highlightRed", className: "text-red-500" },
];

function TextOptions() {
  const readOnly = useEditor((store) => store.state.readOnly);
  const hasTarget = useEditor((store) => targetIds(store.state).length > 0);
  const focus = useEditor((store) => store.state.focus);
  const dispatch = useEditor((store) => store.dispatch);
  const { insertImages, addPage, openLinkDialog } = useEditorActions();
  const fileInput = useRef<HTMLInputElement>(null);

  if (readOnly) return <p className="text-sm text-text-lighter">{t("editorLockedHint")}</p>;

  const hasText = focus !== null && focus.start < focus.end;

  return (
    <>
      <Section title={t("text")}>
        <OptionButton
          label={t("editorTitleStyle")}
          icon={<Heading1 size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleHeading", tag: Tags.H1 })}
        />
        <OptionButton
          label={t("editorSubtitleStyle")}
          icon={<Heading2 size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleHeading", tag: Tags.H2 })}
        />
        <OptionButton
          label={t("editorHeadingStyle")}
          icon={<Heading3 size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleHeading", tag: Tags.H3 })}
        />
      </Section>

      <Section title={t("highlighting")}>
        <div className="flex gap-1">
          {HIGHLIGHTS.map((highlight) => (
            <button
              key={highlight.span}
              type="button"
              aria-label={t(highlight.label)}
              title={t(highlight.label)}
              disabled={!hasText}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => dispatch({ type: "toggleSpan", span: highlight.span })}
              className="flex size-8 items-center justify-center rounded-md hover:bg-options-selector disabled:opacity-40"
            >
              <Highlighter size={16} aria-hidden className={highlight.className} />
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("decoration")}>
        <OptionButton
          label={t("slashBox")}
          icon={<SquareDashed size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleTag", tag: Tags.HIGH_LIGHT_BLOCK })}
        />
        <OptionButton
          label={t("slashCard")}
          icon={<Square size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleTag", tag: Tags.CARD_BLOCK })}
        />
      </Section>

      <Section title={t("insert")}>
        <OptionButton
          label={t("slashCheckbox")}
          icon={<CheckSquare size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleType", storyType: StoryTypes.CHECK_ITEM })}
        />
        <OptionButton
          label={t("slashList")}
          icon={<List size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() =>
            dispatch({ type: "toggleType", storyType: StoryTypes.UNORDERED_LIST_ITEM })
          }
        />
        <OptionButton
          label={t("editorCode")}
          icon={<Code size={16} aria-hidden />}
          disabled={!hasTarget}
          onClick={() => dispatch({ type: "toggleType", storyType: StoryTypes.CODE_BLOCK })}
        />
        <OptionButton
          label={t("editorImage")}
          icon={<Image size={16} aria-hidden />}
          onClick={() => fileInput.current?.click()}
        />
        <OptionButton
          label={t("editorAddPage")}
          icon={<FilePlus size={16} aria-hidden />}
          onClick={addPage}
        />
        <OptionButton
          label={t("editorLinkTitle")}
          icon={<Link size={16} aria-hidden />}
          disabled={!hasText}
          onClick={() => focus && openLinkDialog(focus)}
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
            if (files.length > 0) insertImages(files, focus?.id ?? null);
          }}
        />
      </Section>
    </>
  );
}
