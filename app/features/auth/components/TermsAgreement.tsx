import { t } from "~/core/i18n";

import type { LegalDocumentType } from "../api";

type TermsAgreementProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onOpenDocument: (type: LegalDocumentType) => void;
};

/** "I agree to the Terms of Service and the Privacy Policy", each name opening its text. */
export function TermsAgreement({
  accepted,
  onAcceptedChange,
  onOpenDocument,
}: TermsAgreementProps) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <input
        id="terms"
        type="checkbox"
        className="mt-1 accent-accent"
        checked={accepted}
        onChange={(event) => onAcceptedChange(event.target.checked)}
        aria-label={`${t("termsAgreePrefix")} ${t("termsOfService")} ${t("termsAgreeAnd")} ${t("privacyPolicy")}`}
      />
      <p>
        <label htmlFor="terms">{t("termsAgreePrefix")}</label>{" "}
        <button
          type="button"
          className="text-link underline"
          onClick={() => onOpenDocument("terms")}
        >
          {t("termsOfService")}
        </button>{" "}
        {t("termsAgreeAnd")}{" "}
        <button
          type="button"
          className="text-link underline"
          onClick={() => onOpenDocument("privacy")}
        >
          {t("privacyPolicy")}
        </button>
      </p>
    </div>
  );
}
