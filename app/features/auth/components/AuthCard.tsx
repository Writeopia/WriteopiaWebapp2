import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { t } from "~/core/i18n";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Links under the form, like "Create account". */
  footer?: ReactNode;
  /** Where the arrow at the top left goes; without it there is no arrow. */
  backTo?: string;
};

/** The frame of the sign-in, sign-up and password screens: the logo, a title and a form. */
export function AuthCard({ title, subtitle, children, footer, backTo }: AuthCardProps) {
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="relative flex w-full max-w-md flex-col gap-6 rounded-lg border border-card-border bg-card-bg p-8">
        {backTo && (
          <Link
            to={backTo}
            aria-label={t("back")}
            title={t("back")}
            className="absolute top-3 left-3 rounded-md p-1 text-on-bg hover:bg-options-selector"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
        )}
        <header className="flex flex-col items-center gap-2 text-center">
          <img src="/icon.png" alt="" width={56} height={56} />
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-text-light">{subtitle}</p>}
        </header>
        {children}
        {footer && <footer className="text-center text-sm text-text-light">{footer}</footer>}
      </div>
    </main>
  );
}

/** A failure of the form, announced when it appears. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;

  return (
    <p role="alert" className="text-sm text-error">
      {message}
    </p>
  );
}
