import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { argbToCss, type Document } from "~/core/models";
import { Button, cn, Spinner } from "~/core/ui";
import { HeaderPicture } from "~/features/document-options/components/HeaderPicture";
import { headerOf, isDarkColor } from "~/features/document-options/header";
import type { TitleFrame } from "~/features/editor/components/editorContext";
import { ReadOnlyDocument } from "~/features/editor/components/ReadOnlyDocument";
import { ItemIcon } from "~/features/menu/icons";

import { getSiteDocument, sitePath } from "../api";

/**
 * A published document (SiteScreen.kt): no session and no side menu, the blocks read-only with
 * the header, in the visitor's own theme. A document that is gone or no longer published gets
 * a page that says so.
 */
export function SitePage({ documentId }: { documentId: string }) {
  const navigate = useNavigate();
  const site = useQuery({
    queryKey: ["site", documentId],
    queryFn: ({ signal }) => getSiteDocument(documentId, signal),
    staleTime: 5 * 60_000,
  });

  const document = site.data;
  useEffect(() => {
    if (document) window.document.title = document.title || t("untitled");
  }, [document]);

  const openDocument = useCallback((id: string) => void navigate(sitePath(id)), [navigate]);
  // One frame per document: a new one on every render would draw the title again from scratch.
  const titleFrame = useMemo(() => (document ? siteTitleFrame(document) : undefined), [document]);

  if (site.isPending) {
    return (
      <main className="flex h-full items-center justify-center">
        <Spinner size={32} className="text-accent" />
      </main>
    );
  }

  if (site.isError || !document) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-bold text-on-bg">
          {site.isError ? t("errorTitle") : t("siteNotFoundTitle")}
        </h1>
        <p className="text-text-light">
          {site.isError ? t("errorServer") : t("siteNotFoundMessage")}
        </p>
        {site.isError && (
          <Button variant="secondary" onClick={() => void site.refetch()}>
            {t("retry")}
          </Button>
        )}
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto bg-global-bg">
      <ReadOnlyDocument
        key={document.id}
        document={document}
        titleFrame={titleFrame}
        openDocument={openDocument}
      />
      <footer className="pb-8 text-center text-xs text-text-lighter">
        {t("sitePublishedWith")}
      </footer>
    </main>
  );
}

/** The header and the icon around the title, as the editor draws them, with nothing to change. */
function siteTitleFrame(document: Document): TitleFrame {
  return function SiteTitleFrame({ block, children }) {
    const header = headerOf(block);
    return (
      <div>
        {header.kind === "picture" && (
          <HeaderPicture
            url={header.url}
            alt={t("headerPictureAlt")}
            className="mb-3 h-[230px] rounded-lg"
          />
        )}
        <div
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
      </div>
    );
  };
}
