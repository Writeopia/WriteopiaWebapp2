import { type InputHTMLAttributes, type ReactNode, useId } from "react";

import { cn } from "./cn";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Shown under the field, and announced, when the value is not valid. */
  error?: string;
  hint?: string;
  /** Placed inside the field, at its end, such as a button that acts on the value. */
  trailing?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  trailing,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text-light">
        {label}
      </label>
      <div className="relative flex">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            "h-10 w-full rounded-lg border bg-card-bg px-3 text-on-bg placeholder:text-text-lighter",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-error" : "border-card-border",
            trailing ? "pr-10" : undefined,
          )}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        )}
      </div>
      {message && (
        <p id={messageId} className={cn("text-sm", error ? "text-error" : "text-text-lighter")}>
          {message}
        </p>
      )}
    </div>
  );
}
