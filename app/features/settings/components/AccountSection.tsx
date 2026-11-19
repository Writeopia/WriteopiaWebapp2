import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, buttonClasses, Dialog, Spinner, TextField } from "~/core/ui";
import { clearSession, paths } from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";
import { workspacesQuery } from "~/features/workspaces/api";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { deleteAccount, exportWorkspace } from "../api";
import { LoadState, OptionCards, SettingsGroup, SettingsLink } from "./parts";

/** Who is signed in, the way out, the export of a workspace and the deletion of the account. */
export function AccountSection() {
  const { user } = useWorkspace();
  const logout = useLogout();
  const [dialog, setDialog] = useState<"export" | "delete" | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title={t("accountSection")}>
        <p className="text-sm text-on-bg">{t("account", { name: user.name, tier: user.tier })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={paths.workspaces} className={buttonClasses("secondary")}>
            {t("changeWorkspace")}
          </Link>
          <Link to={paths.resetPassword} className={buttonClasses("secondary")}>
            {t("resetPassword")}
          </Link>
          <Button variant="secondary" onClick={() => logout.mutate()}>
            {t("logout")}
          </Button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("exportSection")}>
        <SettingsLink onClick={() => setDialog("export")}>{t("exportWorkspace")}</SettingsLink>
      </SettingsGroup>

      <SettingsGroup title={t("dangerZone")}>
        <div>
          <Button variant="danger" onClick={() => setDialog("delete")}>
            {t("deleteAccount")}
          </Button>
        </div>
      </SettingsGroup>

      {dialog === "export" && <ExportWorkspaceDialog onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteAccountDialog onClose={() => setDialog(null)} />}

      {logout.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center gap-3 bg-black/40 text-white">
          <Spinner label={t("signingOut")} />
          <span>{t("signingOut")}</span>
        </div>
      )}
    </div>
  );
}

/** ExportWorkspaceDialog.kt: pick a workspace, start the export, say how it went. */
export function ExportWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const workspaces = useQuery(workspacesQuery);
  const [selected, setSelected] = useState<string>(workspace.id);
  const exporting = useMutation({ mutationFn: exportWorkspace });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("exportWorkspace")}
      actions={
        exporting.isSuccess ? (
          <Button onClick={onClose}>{t("ok")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              loading={exporting.isPending}
              disabled={!workspaces.data}
              onClick={() => exporting.mutate(selected)}
            >
              {t("startExport")}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">{t("exportWorkspaceDescription")}</p>
        {exporting.isSuccess ? (
          <p role="status" className="text-sm text-on-bg">
            {t("exportStarted")}
          </p>
        ) : (
          <LoadState
            isPending={workspaces.isPending}
            isError={workspaces.isError}
            failure={t("errorLoadingTeams")}
            onRetry={() => void workspaces.refetch()}
          >
            <OptionCards
              label={t("selectWorkspaceToExport")}
              value={selected}
              onChange={(id) => {
                setSelected(id);
                exporting.reset();
              }}
              options={(workspaces.data ?? []).map((each) => ({
                value: each.id,
                label: each.name,
              }))}
            />
          </LoadState>
        )}
        {exporting.isError && (
          <p role="alert" className="text-sm text-error">
            {t("exportFailed")}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The deletion of the account. Confirm stays disabled until the user types their email, so
 * it cannot be done by a slip.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useWorkspace();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase();

  const deletion = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      // The account can no longer be used; nothing of it is kept here.
      clearSession();
      void navigate(paths.accountDeletionStarted, { replace: true });
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("areYouSure")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            loading={deletion.isPending}
            onClick={() => deletion.mutate()}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (matches && !deletion.isPending) deletion.mutate();
        }}
      >
        <p className="text-sm">{t("notesWillBeDeleted")}</p>
        <TextField
          label={t("deleteAccountTypeEmail", { email: user.email })}
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        {deletion.isError && (
          <p role="alert" className="text-sm text-error">
            {t("deleteAccountFailed")}
          </p>
        )}
      </form>
    </Dialog>
  );
}
