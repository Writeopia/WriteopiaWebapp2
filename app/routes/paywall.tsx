import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudUpload, Download, type LucideIcon, RefreshCw, Sparkles, Users } from "lucide-react";
import { redirect, useNavigate } from "react-router";

import { type StringKey, t } from "~/core/i18n";
import { Button, buttonClasses } from "~/core/ui";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { APPS_DOWNLOAD_URL, formatMonthlyPrice } from "~/features/auth/paywall";
import {
  loadSubscription,
  paths,
  recheckSubscription,
  requireSignedIn,
  subscriptionQuery,
} from "~/features/auth/session";
import { useLogout } from "~/features/auth/useLogout";

/** What the subscription brings: the reasons to subscribe. */
const BENEFITS: { icon: LucideIcon; title: StringKey; description: StringKey }[] = [
  { icon: RefreshCw, title: "paywallBenefitSync", description: "paywallBenefitSyncDescription" },
  { icon: Sparkles, title: "paywallBenefitAi", description: "paywallBenefitAiDescription" },
  { icon: Users, title: "paywallBenefitTeam", description: "paywallBenefitTeamDescription" },
  {
    icon: CloudUpload,
    title: "paywallBenefitBackup",
    description: "paywallBenefitBackupDescription",
  },
];

/** Needs a session; someone who already has a subscription goes on to the app. */
export async function clientLoader() {
  await requireSignedIn();
  const subscription = await loadSubscription().catch(() => null);

  if (subscription?.premium) return redirect(paths.start);
  return null;
}

/**
 * Shown to a signed-in user without a subscription: the cloud account needs one. Nothing
 * here lets the user in unless the backend says the subscription is there.
 */
export default function Paywall() {
  const navigate = useNavigate();
  const logout = useLogout();
  const subscription = useQuery(subscriptionQuery);

  const check = useMutation({
    mutationFn: recheckSubscription,
    onSuccess: (answer) => {
      if (answer.premium) void navigate(paths.start, { replace: true });
    },
  });

  const price = formatMonthlyPrice(subscription.data);
  const failed = check.isError || (subscription.isError && !check.isSuccess);
  const notYet = check.isSuccess && !check.data.premium;

  return (
    <AuthCard
      title={t("paywallTitle")}
      footer={
        <button
          type="button"
          className="text-link underline"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? t("signingOut") : t("paywallSignOut")}
        </button>
      }
    >
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm text-text-light">{t("paywallDescription")}</p>
      </div>

      <ul className="flex flex-col gap-4">
        {BENEFITS.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon size={20} className="mt-0.5 shrink-0 text-link" aria-hidden />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{t(title)}</span>
              <span className="text-sm text-text-light">{t(description)}</span>
            </div>
          </li>
        ))}
      </ul>

      {price && <p className="text-center text-lg font-semibold">{t("paywallPrice", { price })}</p>}

      {failed && (
        <div className="flex flex-col items-center gap-3">
          <FormError message={t("paywallCheckFailed")} />
          <Button variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {notYet && !check.isPending && (
        <p role="status" className="text-center text-sm text-text-light">
          {t("paywallNotSubscribed")}
        </p>
      )}

      <Button loading={check.isPending} onClick={() => check.mutate()}>
        {t("paywallCheckAgain")}
      </Button>

      <section className="flex flex-col gap-3 rounded-lg border border-card-border p-4">
        <h2 className="font-semibold">{t("paywallTryAppsTitle")}</h2>
        <p className="text-sm text-text-light">{t("paywallTryAppsDescription")}</p>
        <a
          href={APPS_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses("secondary")}
        >
          <Download size={16} aria-hidden />
          {t("paywallDownloadApps")}
        </a>
      </section>
    </AuthCard>
  );
}
