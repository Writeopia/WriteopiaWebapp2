import { PencilLine, X } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "~/core/i18n";
import { argbToCss } from "~/core/models";
import { cn } from "~/core/ui";
import type { Block } from "~/features/editor/state/types";
import { ItemIcon } from "~/features/menu/icons";

import { useDocumentOptions } from "../context";
import { headerOf, isDarkColor } from "../header";
import { HeaderPicture } from "./HeaderPicture";

type DocumentTitleFrameProps = { block: Block; readOnly: boolean; children: ReactNode };

/**
 * The title with what surrounds it (HeaderDrawer.kt): the header, a band of color behind the
 * title or a picture above it, the icon of the document, and its tags under it.
 */
export function DocumentTitleFrame({ block, readOnly, children }: DocumentTitleFrameProps) {
  const { document, catalogue, change, open } = useDocumentOptions();
  const header = headerOf(block);
  const tags = document.tagIds
    .map((id) => catalogue.find((tag) => tag.id === id))
    .filter((tag) => tag !== undefined);

  return (
    <div className="group/header relative">
      {header.kind === "picture" && (
        <HeaderPicture
          url={header.url}
          alt={t("headerPictureAlt")}
          className="mb-3 h-[230px] rounded-lg"
        />
      )}
      <div
        data-testid="document-header"
        data-header={header.kind}
        className={cn(
          "flex items-center gap-3",
          header.kind === "color" && "rounded-lg px-4 pt-32 pb-2",
        )}
        style={
          header.kind === "color"
            ? {
                backgroundColor: argbToCss(header.color),
                color: isDarkColor(header.color) ? "#ffffff" : "#111111",
              }
            : undefined
        }
      >
        {document.icon && (
          <ItemIcon icon={document.icon} kind="document" size={40} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {tags.length > 0 && (
        <ul aria-label={t("documentTags")} className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1 rounded-full bg-options-selector px-2.5 py-0.5 text-sm"
            >
              <button
                type="button"
                title={tag.description || undefined}
                onClick={() => open("tags")}
              >
                {tag.name}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={t("tagRemove", { name: tag.name })}
                  className="rounded-full text-text-lighter hover:text-on-bg"
                  onClick={() =>
                    change({ tagIds: document.tagIds.filter((each) => each !== tag.id) })
                  }
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <button
          type="button"
          aria-label={t("headerEdit")}
          title={t("headerEdit")}
          onClick={() => open("header")}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-card-bg/90 text-on-bg opacity-0 shadow-sm group-hover/header:opacity-100 hover:bg-options-selector focus-visible:opacity-100"
        >
          <PencilLine size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
