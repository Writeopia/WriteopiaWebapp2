import { useQuery } from "@tanstack/react-query";

import { t } from "~/core/i18n";
import { Button, Dialog, Spinner } from "~/core/ui";

import { getLegalDocument, type LegalDocumentType } from "../api";

const titles = { terms: "termsOfService", privacy: "privacyPolicy" } as const;

type LegalDocumentDialogProps = {
  /** The text to show; null keeps the dialog closed. */
  type: LegalDocumentType | null;
  onClose: () => void;
};

/** The Terms of Service or the Privacy Policy, read from the sign-up form. */
export function LegalDocumentDialog({ type, onClose }: LegalDocumentDialogProps) {
  const query = useQuery({
    queryKey: ["legal", type],
    queryFn: () => getLegalDocument(type!),
    enabled: type !== null,
    staleTime: Infinity,
  });

  return (
    <Dialog
      open={type !== null}
      onClose={onClose}
      title={query.data?.title ?? (type ? t(titles[type]) : "")}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("close")}
        </Button>
      }
    >
      {query.isPending && (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      )}
      {query.isError && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{t("legalLoadError")}</p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {query.data && (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2 text-sm">
          <p className="text-text-lighter">
            {t("legalEffectiveDate", { date: query.data.effectiveDate })}
          </p>
          {query.data.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-1">
              <h3 className="font-bold text-on-bg">{section.heading}</h3>
              <p className="whitespace-pre-line">{section.body}</p>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
