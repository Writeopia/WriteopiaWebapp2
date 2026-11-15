import { type StringKey, t } from "~/core/i18n";
import { cn } from "~/core/ui";

import type { PasswordStrength as Strength, PasswordValidation } from "../password";

const labels: Record<Exclude<Strength, "none">, StringKey> = {
  weak: "passwordWeak",
  medium: "passwordMedium",
  strong: "passwordStrong",
};

const bars: Record<Strength, number> = { none: 0, weak: 1, medium: 2, strong: 3 };

/** How strong the password being typed is, and which of the two rules it meets. */
export function PasswordStrength({ validation }: { validation: PasswordValidation }) {
  const { strength, hasMinLength, hasSpecialChar } = validation;
  if (strength === "none") return null;

  return (
    <div className="flex flex-col gap-2 text-sm" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3].map((bar) => (
            <span
              key={bar}
              className={cn(
                "h-1 flex-1 rounded-full",
                bar <= bars[strength] ? "bg-accent" : "bg-highlight",
              )}
            />
          ))}
        </div>
        <span className="text-text-light">{t(labels[strength])}</span>
      </div>
      <ul className="flex flex-col gap-1 text-text-lighter">
        <Requirement met={hasMinLength} label={t("passwordReqMinLength")} />
        <Requirement met={hasSpecialChar} label={t("passwordReqSpecialChar")} />
      </ul>
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-2", met && "text-on-bg")} data-met={met}>
      <span aria-hidden>{met ? "✓" : "○"}</span>
      {label}
    </li>
  );
}
