import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import type { Workspace } from "~/core/models";
import { Button, Dialog, Spinner, TextField } from "~/core/ui";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { paths, requireSession } from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";
import { createWorkspace, selectWorkspace, workspacesQuery } from "~/features/workspaces/api";

export const clientLoader = requireSession;

/** The workspaces of the user: picking one opens the app in it. */
export default function ChooseWorkspace() {
  const navigate = useNavigate();
  const logout = useLogout();
  const workspaces = useQuery(workspacesQuery);
  const [creating, setCreating] = useState(false);

  const open = (workspace: Workspace) => {
    selectWorkspace(workspace.id);
    void navigate(paths.app);
  };

  return (
    <AuthCard
      title={t("chooseWorkspace")}
      footer={
        <button
          type="button"
          className="text-link underline"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? t("signingOut") : t("logout")}
        </button>
      }
    >
      {workspaces.isPending && (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      )}

      {workspaces.isError && (
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="text-error">
            {t("errorLoadingWorkspaces")}
          </p>
          <Button variant="secondary" onClick={() => void workspaces.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}

      {workspaces.data && (
        <>
          {workspaces.data.length === 0 && (
            <p className="text-center text-sm text-text-light">{t("noWorkspaces")}</p>
          )}
          <ul className="flex flex-col gap-2">
            {workspaces.data.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  onClick={() => open(workspace)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-card-border p-4 text-left hover:bg-options-selector"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{workspace.name}</span>
                    <span className="text-sm text-text-lighter">
                      {t("documentCount", { count: workspace.documentCount })}
                    </span>
                  </span>
                  <span className="text-sm text-text-lighter">
                    {t(workspace.role === "ADMIN" ? "roleAdmin" : "roleEditor")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            {t("createWorkspace")}
          </Button>
        </>
      )}

      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </AuthCard>
  );
}

function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => createWorkspace(name.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspacesQuery.queryKey });
      setName("");
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() !== "") create.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("createWorkspace")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("workspaceName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <FormError message={create.isError ? t("createWorkspaceFailed") : null} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={create.isPending} disabled={name.trim() === ""}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
