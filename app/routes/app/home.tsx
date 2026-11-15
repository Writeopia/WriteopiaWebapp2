import { Link, useOutletContext } from "react-router";

import { t } from "~/core/i18n";
import type { User, Workspace } from "~/core/models";
import { Button } from "~/core/ui";
import { AuthCard } from "~/features/auth/components/AuthCard";
import { paths } from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";

/**
 * Placeholder for the app: it shows who is signed in and where. The shell and the document
 * menu replace it.
 */
export default function AppHome() {
  const { user, workspace } = useOutletContext<{ user: User; workspace: Workspace }>();
  const logout = useLogout();

  return (
    <AuthCard title={workspace.name} subtitle={t("account", { name: user.name, tier: user.tier })}>
      <p className="text-center text-sm text-text-light">{t("appPlaceholder")}</p>
      <Link to={paths.workspaces} className="text-center text-link underline">
        {t("changeWorkspace")}
      </Link>
      <Link to={paths.resetPassword} className="text-center text-link underline">
        {t("resetPassword")}
      </Link>
      <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
        {logout.isPending ? t("signingOut") : t("logout")}
      </Button>
    </AuthCard>
  );
}
