import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "~/core/api";
import { t } from "~/core/i18n";
import type { Icon } from "~/core/models";
import { Button, Dialog, showToast, Spinner } from "~/core/ui";
import { useEditor } from "~/features/editor/state/store";
import { deleteDocuments } from "~/features/menu/api";
import { IconPicker } from "~/features/menu/components/IconPicker";
import { menuKeys } from "~/features/menu/queries";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { isPublished, setPublished, siteUrl } from "../api";
import { type OptionsDialog, useDocumentOptions } from "../context";
import { HeaderEditorDialog } from "./HeaderEditorDialog";
import { AddTagDialog, TagsDialog } from "./TagDialogs";

type DocumentOptionsDialogsProps = {
  dialog: OptionsDialog;
  onClose: () => void;
  onDeleted: () => void;
};

/** Draws the dialog of the document's options that is open. */
export function DocumentOptionsDialogs({
  dialog,
  onClose,
  onDeleted,
}: DocumentOptionsDialogsProps) {
  const { open } = useDocumentOptions();

  switch (dialog) {
    case "header":
      return <HeaderEditorDialog onClose={onClose} />;
    case "icon":
      return <IconDialog onClose={onClose} />;
    case "tags":
      return <TagsDialog onClose={onClose} onAdd={() => open("addTag")} />;
    case "addTag":
      return <AddTagDialog onClose={onClose} />;
    case "publish":
      return <PublishDialog onClose={onClose} onPremiumRequired={() => open("premium")} />;
    case "premium":
      return <PremiumDialog onClose={onClose} />;
    case "delete":
      return <DeleteDocumentDialog onClose={onClose} onDeleted={onDeleted} />;
    default:
      return null;
  }
}

function IconDialog({ onClose }: { onClose: () => void }) {
  const { document, setIcon } = useDocumentOptions();
  const [icon, setChoice] = useState<Icon | null>(document.icon);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("changeIcon")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              setIcon(icon);
              onClose();
            }}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <IconPicker value={icon} onChange={setChoice} allowRemove />
    </Dialog>
  );
}

/** Publishing to the web (PublishDialog.kt): the state, the public link, and the switch. */
function PublishDialog({
  onClose,
  onPremiumRequired,
}: {
  onClose: () => void;
  onPremiumRequired: () => void;
}) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { document, isPremium, serverChanged } = useDocumentOptions();
  const key = ["published", workspace.id, document.id];
  const premiumRequired = (error: unknown) => error instanceof ApiError && error.isForbidden;

  const published = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => isPublished(workspace.id, document.id, signal),
    enabled: isPremium,
    staleTime: 0,
    retry: (count, error) => !premiumRequired(error) && count < 2,
  });

  // The next save of the document's own fields sends the publish state, so it must be this one.
  useEffect(() => {
    if (published.data !== undefined) serverChanged({ published: published.data });
  }, [published.data, serverChanged]);

  const toggle = useMutation({
    mutationFn: (publish: boolean) => setPublished(workspace.id, document.id, publish),
    onSuccess: (_result, publish) => queryClient.setQueryData(key, publish),
    onError: (error) => {
      if (premiumRequired(error)) onPremiumRequired();
    },
  });

  if (!isPremium || premiumRequired(published.error)) {
    return <PremiumDialog onClose={onClose} />;
  }

  const link = siteUrl(document.id);
  const copy = () => {
    navigator.clipboard
      .writeText(link)
      .then(() => showToast(t("publishLinkCopied"), { kind: "success" }))
      .catch(() => showToast(t("publishCopyFailed"), { kind: "error" }));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("publishTitle")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
          {published.data !== undefined && (
            <Button
              variant={published.data ? "danger" : "primary"}
              loading={toggle.isPending}
              onClick={() => toggle.mutate(!published.data)}
            >
              {published.data ? t("unpublish") : t("publish")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {published.isPending && <Spinner />}
        {published.isError && (
          <p role="alert" className="text-error">
            {t("publishLoadFailed")}
          </p>
        )}
        {toggle.isError && !premiumRequired(toggle.error) && (
          <p role="alert" className="text-error">
            {t("publishFailed")}
          </p>
        )}
        {published.data === false && <p>{t("publishExplanation")}</p>}
        {published.data === true && (
          <>
            <p>{t("publishedExplanation")}</p>
            <div className="flex items-center gap-2 rounded-lg border border-card-border px-3 py-2">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-link underline"
              >
                {link}
              </a>
              <Button variant="ghost" onClick={copy}>
                <Copy size={14} aria-hidden />
                {t("publishCopyLink")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function PremiumDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("premiumTitle")}
      actions={<Button onClick={onClose}>{t("close")}</Button>}
    >
      <p>{t("premiumFeatureMessage")}</p>
    </Dialog>
  );
}

function DeleteDocumentDialog({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { document, serverChanged } = useDocumentOptions();
  const title = useEditor((store) => store.state.blocks[store.state.order[0] ?? ""]?.text ?? "");

  const removal = useMutation({
    mutationFn: () => deleteDocuments(workspace.id, [document.id]),
    onSuccess: () => {
      serverChanged({ deleted: true });
      void queryClient.invalidateQueries({ queryKey: menuKeys.all(workspace.id) });
      onClose();
      onDeleted();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("deleteItemTitle", { title: title.trim() || t("untitled") })}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" loading={removal.isPending} onClick={() => removal.mutate()}>
            {t("delete")}
          </Button>
        </>
      }
    >
      {removal.isError && (
        <p role="alert" className="text-sm text-error">
          {t("deleteFailed")}
        </p>
      )}
    </Dialog>
  );
}
