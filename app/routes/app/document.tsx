import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { ApiError } from "~/core/api";
import { t } from "~/core/i18n";
import { ROOT_FOLDER_ID } from "~/core/models";
import { Button, Spinner } from "~/core/ui";
import { getDocument } from "~/features/menu/api";
import { ItemIcon } from "~/features/menu/icons";
import { appPaths } from "~/features/menu/paths";
import { TopBar } from "~/features/shell/components/TopBar";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import type { Route } from "./+types/document";

/**
 * Where the editor will be. Until then it shows which document was opened and the way back
 * to its folder.
 */
export default function DocumentRoute({ params }: Route.ComponentProps) {
  const { workspace } = useWorkspace();
  const document = useQuery({
    queryKey: ["document", workspace.id, params.documentId],
    queryFn: ({ signal }) => getDocument(workspace.id, params.documentId, signal),
  });

  const notFound = document.error instanceof ApiError && document.error.isNotFound;
  const title = document.data?.title.trim() ? document.data.title : t("untitled");

  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <Link
          to={appPaths.folder(document.data?.parentId ?? ROOT_FOLDER_ID)}
          className="rounded-md px-2 py-1 text-sm text-text-lighter hover:bg-options-selector"
        >
          {t("backToFolder")}
        </Link>
      </TopBar>
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
        {document.data && (
          <>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ItemIcon icon={document.data.icon} kind="document" size={24} />
              {title}
            </h1>
            <p className="text-text-light">{t("editorComingSoon")}</p>
          </>
        )}
      </div>
    </div>
  );
}
