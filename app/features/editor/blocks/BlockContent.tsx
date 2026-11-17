import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { useContext } from "react";

import { t } from "~/core/i18n";
import { storyTypeKey } from "~/core/models";
import { cn, Spinner } from "~/core/ui";

import { TitleFrameContext, useEditorActions } from "../components/editorContext";
import type { Decoration } from "../dom/spansToDom";
import { headingLevel, textOf } from "../state/blocks";
import { useEditor } from "../state/store";
import type { Block } from "../state/types";
import { EditableText } from "./EditableText";

type BlockContentProps = {
  block: Block;
  readOnly: boolean;
  decorations?: Decoration[];
};

const HEADING_CLASSES: Record<number, string> = {
  1: "text-3xl font-bold leading-tight",
  2: "text-2xl font-bold leading-snug",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
};

/** What a block shows, by its type (the drawers of the SDK, drawer/content/*Drawer.kt). */
export function BlockContent({ block, readOnly, decorations }: BlockContentProps) {
  const dispatch = useEditor((store) => store.dispatch);
  const frame = useContext(TitleFrameContext);
  const key = storyTypeKey(block.type);

  switch (key) {
    case "TITLE": {
      const title = (
        <EditableText
          block={block}
          readOnly={readOnly}
          decorations={decorations}
          ariaLabel={t("editorTitleLabel")}
          placeholder={t("editorTitlePlaceholder")}
          className="wr-placeholder-always py-1 text-4xl leading-tight font-bold"
        />
      );
      return frame ? frame({ block, readOnly, children: title }) : title;
    }

    case "TEXT":
    case "TEXT_BOX": {
      const level = headingLevel(block);
      return (
        <EditableText
          block={block}
          readOnly={readOnly}
          decorations={decorations}
          ariaLabel={level ? t("editorHeadingLabel", { level }) : t("editorParagraphLabel")}
          placeholder={level ? t("editorHeadingPlaceholder", { level }) : t("editorPlaceholder")}
          className={cn(
            "py-0.5 leading-relaxed",
            level !== null && `${HEADING_CLASSES[level]} mt-2`,
          )}
        />
      );
    }

    case "CHECK_ITEM":
      return (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1.5 size-4 shrink-0 accent-accent"
            checked={block.checked ?? false}
            disabled={readOnly}
            aria-label={t("editorCheckLabel", { text: textOf(block) || t("editorEmptyLine") })}
            onChange={(event) =>
              dispatch({ type: "check", id: block.id, checked: event.target.checked })
            }
          />
          <EditableText
            block={block}
            readOnly={readOnly}
            decorations={decorations}
            ariaLabel={t("editorCheckItemLabel")}
            placeholder={t("editorListPlaceholder")}
            className={cn(
              "py-0.5 leading-relaxed",
              block.checked && "text-text-lighter line-through",
            )}
          />
        </div>
      );

    case "UNORDERED_LIST_ITEM":
      return (
        <div className="flex items-start gap-2">
          <span aria-hidden className="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-on-bg" />
          <EditableText
            block={block}
            readOnly={readOnly}
            decorations={decorations}
            ariaLabel={t("editorListItemLabel")}
            placeholder={t("editorListPlaceholder")}
            className="py-0.5 leading-relaxed"
          />
        </div>
      );

    case "CODE_BLOCK":
      return (
        <EditableText
          block={block}
          readOnly={readOnly}
          decorations={decorations}
          ariaLabel={t("editorCodeLabel")}
          placeholder={t("editorCodePlaceholder")}
          className="rounded-md bg-light-bg px-3 py-2 font-mono text-sm leading-relaxed"
        />
      );

    case "DIVIDER":
      return (
        <div className="py-3" role="separator">
          <hr className="border-divider" />
        </div>
      );

    case "IMAGE":
      return <ImageBlock block={block} />;

    case "DOCUMENT_LINK":
      return <DocumentLinkBlock block={block} />;

    case "LINK_CARD":
      return <LinkCardBlock block={block} />;

    case "AI_ANSWER":
      return (
        <EditableText
          block={block}
          readOnly={readOnly}
          decorations={decorations}
          ariaLabel={t("editorAiAnswerLabel")}
          placeholder={t("editorPlaceholder")}
          className="py-0.5 leading-relaxed"
        />
      );

    case "SKELETON":
      return (
        <div
          role="status"
          aria-label={t("editorSkeletonLabel")}
          className="flex flex-col gap-2 py-2"
        >
          <span className="h-3 w-11/12 animate-pulse rounded bg-options-selector" />
          <span className="h-3 w-3/4 animate-pulse rounded bg-options-selector" />
        </div>
      );

    case "EQUATION":
      return block.url ? (
        <img src={block.url} alt={textOf(block)} className="max-w-full py-2" />
      ) : (
        <Placeholder>{textOf(block) || t("editorUnsupportedBlock")}</Placeholder>
      );

    default:
      // Spreadsheets, drawings and types this app does not know are kept as they are.
      return <Placeholder>{t("editorUnsupportedBlock")}</Placeholder>;
  }
}

function Placeholder({ children }: { children: string }) {
  return (
    <div className="my-1 rounded-md border border-dashed border-card-border px-3 py-2 text-sm text-text-lighter">
      {children}
    </div>
  );
}

function ImageBlock({ block }: { block: Block }) {
  const preview = useEditor((store) => store.uploading.get(block.id));
  const source = preview ?? block.url;

  if (!source) {
    return (
      <div className="my-1 flex items-center gap-2 rounded-md bg-light-bg px-3 py-6 text-sm text-text-lighter">
        <ImageOff size={16} aria-hidden />
        {t("editorImageMissing")}
      </div>
    );
  }
  return (
    <figure className="relative my-1">
      <img
        src={source}
        alt={textOf(block)}
        draggable={false}
        className={cn("max-h-[32rem] max-w-full rounded-md", preview && "opacity-60")}
      />
      {preview && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <Spinner label={t("editorImageUploading")} />
        </div>
      )}
    </figure>
  );
}

function DocumentLinkBlock({ block }: { block: Block }) {
  const { openDocument } = useEditorActions();
  const link = block.documentLink;
  const title =
    [link?.title, block.text].map((value) => value?.trim()).find(Boolean) ?? t("untitled");

  return (
    <button
      type="button"
      disabled={!link}
      onClick={() => link && openDocument(link.id)}
      className="my-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-options-selector"
    >
      <FileText size={18} aria-hidden className="shrink-0 text-text-lighter" />
      <span className="truncate underline decoration-card-border underline-offset-4">{title}</span>
    </button>
  );
}

function LinkCardBlock({ block }: { block: Block }) {
  const describing = useEditor((store) => store.describing.has(block.id));
  const url = block.url ?? "";
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Shown as written.
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 flex flex-col gap-1 rounded-lg border border-card-border bg-card-bg px-4 py-3 hover:border-accent"
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <ExternalLink size={14} aria-hidden />
        {host}
      </span>
      {describing ? (
        <span className="text-sm text-text-lighter">{t("editorLinkDescribing")}</span>
      ) : (
        textOf(block) && <span className="text-sm text-text-light">{textOf(block)}</span>
      )}
      <span className="truncate text-xs text-text-lighter">{url}</span>
    </a>
  );
}
