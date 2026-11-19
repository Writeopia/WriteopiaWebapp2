import { Square, SquareCheck } from "lucide-react";

import {
  argbToCss,
  type Document,
  isStoryType,
  type StoryStep,
  storyTypeKey,
  Tags,
} from "~/core/models";
import { cn } from "~/core/ui";

/**
 * The first lines of a document, drawn on its card. Read-only and small: text, headings,
 * checkboxes, list items, code, images, videos and dividers. Blocks with nothing to show are skipped.
 */

const HEADING_CLASSES: Record<string, string> = {
  [Tags.H1]: "text-base font-bold",
  [Tags.H2]: "text-[0.95rem] font-bold",
  [Tags.H3]: "text-sm font-bold",
  [Tags.H4]: "text-sm font-medium",
};

function hasText(step: StoryStep): boolean {
  return (step.text ?? "").trim() !== "";
}

/** Whether a step draws anything on a card. */
export function isPreviewable(step: StoryStep): boolean {
  switch (storyTypeKey(step.type)) {
    case "TITLE":
      return false;
    case "IMAGE":
    case "VIDEO":
      return step.url !== null && step.url !== "";
    case "DIVIDER":
      return true;
    case "DOCUMENT_LINK":
      return (step.documentLink?.title ?? "").trim() !== "" || hasText(step);
    case "LINK_CARD":
      return hasText(step) || (step.url ?? "") !== "";
    case "TEXT":
    case "CHECK_ITEM":
    case "UNORDERED_LIST_ITEM":
    case "CODE_BLOCK":
    case "AI_ANSWER":
      return hasText(step);
    default:
      return false;
  }
}

/** The steps a card shows: the first [limit] that draw something. */
export function previewSteps(document: Document, limit: number): StoryStep[] {
  return document.content.filter(isPreviewable).slice(0, limit);
}

/** The first line of text of a document, for the list arrangement. */
export function previewSnippet(document: Document): string {
  const step = document.content.find(
    (candidate) => !isStoryType(candidate.type, "TITLE") && hasText(candidate),
  );
  return step?.text?.trim() ?? "";
}

/**
 * The header of a document: it is kept in the title step, as a picture (url) or as a color
 * (decoration). Null when the document has neither.
 */
export function documentHeader(
  document: Document,
): { imageUrl: string } | { color: string } | null {
  const title = document.content.find((step) => isStoryType(step.type, "TITLE"));
  if (!title) return null;

  if (title.url) return { imageUrl: title.url };
  if (title.decoration.backgroundColor !== null) {
    return { color: argbToCss(title.decoration.backgroundColor) };
  }
  return null;
}

export function DocumentPreview({ steps }: { steps: StoryStep[] }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-text-light">
      {steps.map((step) => (
        <PreviewStep key={step.id} step={step} />
      ))}
    </div>
  );
}

function PreviewStep({ step }: { step: StoryStep }) {
  const text = step.text ?? "";

  switch (storyTypeKey(step.type)) {
    case "CHECK_ITEM": {
      const Box = step.checked ? SquareCheck : Square;
      return (
        <p className="flex items-start gap-1.5">
          <Box size={14} aria-hidden className="mt-0.5 shrink-0 text-text-lighter" />
          <span className={cn("break-words", step.checked && "text-text-lighter line-through")}>
            {text}
          </span>
        </p>
      );
    }
    case "UNORDERED_LIST_ITEM":
      return (
        <p className="flex items-start gap-1.5">
          <span aria-hidden className="shrink-0">
            •
          </span>
          <span className="break-words">{text}</span>
        </p>
      );
    case "CODE_BLOCK":
      return (
        <pre className="overflow-hidden rounded-sm bg-light-bg px-2 py-1 font-mono text-xs whitespace-pre-wrap">
          {text}
        </pre>
      );
    case "IMAGE":
      return (
        <img
          src={step.url ?? ""}
          alt=""
          loading="lazy"
          className="max-h-32 w-full rounded-sm object-cover"
        />
      );
    case "VIDEO":
      return (
        <video
          src={step.url ?? ""}
          muted
          preload="metadata"
          aria-hidden
          className="max-h-32 w-full rounded-sm object-cover"
        />
      );
    case "DIVIDER":
      return <hr className="my-1 border-divider" />;
    case "DOCUMENT_LINK":
      return <p className="break-words text-link">{step.documentLink?.title ?? text}</p>;
    case "LINK_CARD":
      return <p className="break-words text-link">{text || step.url}</p>;
    default: {
      const heading = step.tags.map((tag) => HEADING_CLASSES[tag.tag]).find(Boolean);
      return <p className={cn("break-words", heading && `${heading} text-on-bg`)}>{text}</p>;
    }
  }
}
