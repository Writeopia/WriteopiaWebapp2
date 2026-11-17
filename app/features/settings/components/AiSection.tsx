import { useQuery } from "@tanstack/react-query";

import { t } from "~/core/i18n";
import { cn } from "~/core/ui";
import { type AiUsage, getAiUsage } from "~/features/ai/api";
import { aiKeys } from "~/features/ai/context";

import { LoadState, OptionCards, SettingsGroup } from "./parts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "1.2K", "3M": how SettingsCloudAiScreen.kt writes the tokens. */
export function formatCompactNumber(value: number): string {
  return compact.format(value);
}

/** The share of the quota used, from 0 to 1. No quota reads as nothing used. */
export function usageShare(usage: Pick<AiUsage, "totalTokens" | "quota">): number {
  if (!usage.quota || usage.quota <= 0) return 0;
  return Math.min(Math.max(usage.totalTokens / usage.quota, 0), 1);
}

/**
 * Which AI runs, and how much of the month's tokens it used. The web runs the cloud AI only:
 * a page cannot reach a local Ollama without it allowing the origin (docs/plan/README.md).
 */
export function AiSection() {
  const usage = useQuery({
    queryKey: aiKeys.usage,
    queryFn: ({ signal }) => getAiUsage(signal),
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title={t("runAiWith")}>
        <OptionCards
          label={t("runAiWith")}
          value="cloud"
          onChange={() => undefined}
          options={[{ value: "cloud", label: t("cloudAi"), description: t("aiProviderCloudHint") }]}
        />
      </SettingsGroup>

      <SettingsGroup title={t("cloudAiUsage")}>
        <LoadState
          isPending={usage.isPending}
          isError={usage.isError}
          failure={t("usageFailed")}
          onRetry={() => void usage.refetch()}
          loadingLabel={t("loadingUsage")}
        >
          {usage.data && <UsageCard usage={usage.data} />}
        </LoadState>
      </SettingsGroup>
    </div>
  );
}

function UsageCard({ usage }: { usage: AiUsage }) {
  const share = usageShare(usage);
  const percent = Math.floor(share * 100);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-options-selector p-4">
      <p className="text-lg font-bold text-on-bg">
        {usage.quota
          ? `${formatCompactNumber(usage.totalTokens)} / ${formatCompactNumber(usage.quota)}`
          : formatCompactNumber(usage.totalTokens)}
      </p>
      <p className="text-sm">{t("tokensUsed")}</p>
      {usage.quota ? (
        <>
          <div
            role="progressbar"
            aria-label={t("cloudAiUsage")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded bg-on-bg/20"
          >
            <div
              className={cn("h-full rounded", share >= 0.9 ? "bg-error" : "bg-accent")}
              style={{ width: `${share * 100}%` }}
            />
          </div>
          <p className="text-sm">{percent}%</p>
        </>
      ) : null}
      {usage.requestCount === 0 && <p className="text-sm">{t("noUsageData")}</p>}
    </div>
  );
}
