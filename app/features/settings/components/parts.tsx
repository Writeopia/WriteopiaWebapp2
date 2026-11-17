import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "~/core/i18n";
import { Button, cn, Dialog, Spinner } from "~/core/ui";

/** The heading of a group of options in a section. */
export function SettingsGroup({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-xs font-bold tracking-wide text-text-lighter uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** The top of a page that opens inside a section, with the way back to it. */
export function SubPageHeader({
  title,
  description,
  onBack,
  action,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t("back")}
          onClick={onBack}
          className="rounded-md p-1 text-on-bg hover:bg-options-selector"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        <h3 className="flex-1 font-medium text-on-bg">{title}</h3>
        {action}
      </div>
      {description && <p className="text-sm">{description}</p>}
    </div>
  );
}

/** A row that opens a page or a dialog. */
export function SettingsLink({
  children,
  detail,
  onClick,
}: {
  children: ReactNode;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md bg-options-selector px-3 py-3 text-left text-sm text-on-bg hover:bg-highlight"
    >
      <span className="flex-1">{children}</span>
      {detail && <span className="text-xs text-text-lighter">{detail}</span>}
      <span aria-hidden>›</span>
    </button>
  );
}

/** A choice between a few options, each with an optional line under it. */
export function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm",
            "disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "border-accent bg-selected-bg text-on-bg"
              : "border-card-border hover:bg-options-selector",
          )}
        >
          <span className="font-medium text-on-bg">{option.label}</span>
          {option.description && (
            <span className="text-xs text-text-lighter">{option.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Loading, a failure with a retry, or the content. */
export function LoadState({
  isPending,
  isError,
  failure,
  onRetry,
  loadingLabel,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  failure: string;
  onRetry: () => void;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm">
        <Spinner label={loadingLabel} />
        {loadingLabel && <span>{loadingLabel}</span>}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 py-2">
        <p role="alert" className="text-sm text-error">
          {failure}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = t("delete"),
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{message}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
