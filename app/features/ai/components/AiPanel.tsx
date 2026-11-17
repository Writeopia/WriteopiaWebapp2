import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { t } from "~/core/i18n";
import { Button, cn } from "~/core/ui";
import { useEditor } from "~/features/editor/state/store";

import { getAiUsage, type QuickAction } from "../api";
import { aiKeys, useAi } from "../context";
import type { QuickActionTarget } from "../runner";

const QUICK_ACTIONS: { action: QuickAction; label: () => string }[] = [
  { action: "summary", label: () => t("aiSummary") },
  { action: "actionPoints", label: () => t("aiActionPoints") },
  { action: "faq", label: () => t("aiFaq") },
  { action: "tags", label: () => t("aiTags") },
];

/**
 * The AI tab of the side panel (AiOptionsTabs.kt): the command, the quick actions with what
 * they apply to, and the tokens used this month.
 */
export function AiPanel() {
  const ai = useAi();
  const hasSelectedLines = useEditor((store) => store.state.selectedIds.size > 0);
  const hasSuggestion = useEditor((store) => store.state.suggestion !== null);
  const [target, setTarget] = useState<QuickActionTarget>("document");
  const usage = useQuery({
    queryKey: aiKeys.usage,
    queryFn: ({ signal }) => getAiUsage(signal),
    enabled: ai.availability === "ready",
  });

  const blocked = ai.availability !== "ready" || ai.busy || hasSuggestion;
  const needsLines = target === "selection" && !hasSelectedLines;

  const targets: { value: QuickActionTarget | "cursor"; label: string }[] = [
    { value: "document", label: t("aiTargetDocument") },
    { value: "selection", label: t("aiTargetSelectedLines") },
    { value: "cursor", label: t("aiTargetCursor") },
  ];

  return (
    <>
      {ai.reason && <p className="text-sm text-text-light">{ai.reason}</p>}

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-bold tracking-wide text-text-lighter uppercase">
          {t("aiCommand")}
        </h3>
        <Button
          variant="secondary"
          className="h-9 justify-start"
          disabled={ai.availability === "unavailable"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={ai.openCommand}
        >
          {t("aiCommandHint")}
        </Button>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-bold tracking-wide text-text-lighter uppercase">
          {t("quickActions")}
        </h3>
        <span className="text-sm">{t("applyTo")}</span>
        <div role="radiogroup" aria-label={t("applyTo")} className="flex gap-1">
          {targets.map((each) => (
            <button
              key={each.value}
              type="button"
              role="radio"
              aria-checked={target === each.value}
              disabled={each.value === "cursor"}
              title={each.value === "cursor" ? t("aiTargetCursorUnavailable") : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => each.value !== "cursor" && setTarget(each.value)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-xs disabled:opacity-40",
                target === each.value ? "bg-selected-bg text-accent" : "hover:bg-options-selector",
              )}
            >
              {each.label}
            </button>
          ))}
        </div>
        {needsLines && <p className="text-xs text-error">{t("selectLinesFirst")}</p>}
        {QUICK_ACTIONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={blocked || needsLines}
            // The selected lines stay selected.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => ai.runQuickAction(action, target)}
            className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-options-selector disabled:opacity-40"
          >
            {label()}
          </button>
        ))}
      </section>

      {usage.data && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-bold tracking-wide text-text-lighter uppercase">
            {t("aiUsage")}
          </h3>
          <p className="text-sm">
            {usage.data.quota
              ? t("aiUsageOf", {
                  used: usage.data.totalTokens.toLocaleString("en-US"),
                  quota: usage.data.quota.toLocaleString("en-US"),
                })
              : t("aiUsageTokens", { used: usage.data.totalTokens.toLocaleString("en-US") })}
          </p>
        </section>
      )}
    </>
  );
}
