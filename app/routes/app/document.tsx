import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { ApiError } from "~/core/api";
import { t } from "~/core/i18n";
import { ROOT_FOLDER_ID } from "~/core/models";
import { Button, Spinner } from "~/core/ui";
import { DocumentEditor } from "~/features/editor/components/DocumentEditor";
import { getDocument } from "~/features/menu/api";
import { appPaths } from "~/features/menu/paths";
import { TopBar } from "~/features/shell/components/TopBar";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import type { Route } from "./+types/document";

/**
 * An open document. It is read once when the screen opens and never again from the cache:
 * from then on the editor holds it, and the step sync keeps both sides up to date.
 */
export default function DocumentRoute({ params }: Route.ComponentProps) {
  const { workspace } = useWorkspace();
  const document = useQuery({
    queryKey: ["document", workspace.id, params.documentId],
    queryFn: ({ signal }) => getDocument(workspace.id, params.documentId, signal),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const back = (
    <Link
      to={appPaths.folder(document.data?.parentId ?? ROOT_FOLDER_ID)}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-lighter hover:bg-options-selector"
    >
      <ChevronLeft size={16} aria-hidden />
      {t("backToFolder")}
    </Link>
  );

  if (document.data) {
    return <DocumentEditor key={document.data.id} document={document.data} navigation={back} />;
  }

  const notFound = document.error instanceof ApiError && document.error.isNotFound;
  return (
    <div className="flex h-full flex-col">
      <TopBar>{back}</TopBar>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {document.isPending && <Spinner />}
        {document.isError && (
          <>
            <p role="alert" className="text-error">
              {notFound ? t("documentNotFound") : t("menuLoadError")}
            </p>
            {!notFound && (
              <Button variant="secondary" onClick={() => void document.refetch()}>
                {t("retry")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
