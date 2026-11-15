import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Links under the form, like "Create account". */
  footer?: ReactNode;
};

/** The frame of the sign-in, sign-up and password screens: the logo, a title and a form. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-card-border bg-card-bg p-8">
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
