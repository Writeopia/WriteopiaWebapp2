import { type InputHTMLAttributes, useId } from "react";

import { cn } from "./cn";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Shown under the field, and announced, when the value is not valid. */
  error?: string;
  hint?: string;
};

export function TextField({ label, error, hint, className, id, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text-light">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          "h-10 rounded-lg border bg-card-bg px-3 text-on-bg placeholder:text-text-lighter",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-error" : "border-card-border",
        )}
        {...rest}
      />
      {message && (
        <p id={messageId} className={cn("text-sm", error ? "text-error" : "text-text-lighter")}>
          {message}
        </p>
      )}
    </div>
  );
}
