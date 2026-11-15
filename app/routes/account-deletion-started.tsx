import { t } from "~/core/i18n";
import { Button } from "~/core/ui";
import { AuthCard } from "~/features/auth/components/AuthCard";
import { useLogout } from "~/features/auth/useLogout";

/** Shown to someone whose account is being deleted: there is nothing left to open. */
export default function AccountDeletionStarted() {
  const logout = useLogout();

  return (
    <AuthCard
      title={t("accountDeletionStartedTitle")}
      subtitle={t("accountDeletionStartedDescription")}
    >
      <Button loading={logout.isPending} onClick={() => logout.mutate()}>
        {t("logout")}
      </Button>
    </AuthCard>
  );
}
