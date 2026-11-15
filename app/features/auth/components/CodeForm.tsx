import { type FormEvent, useState } from "react";

import { t } from "~/core/i18n";
import { Button, TextField } from "~/core/ui";

import { FormError } from "./AuthCard";

type CodeFormProps = {
  /** Checks the code; rejects when it is wrong. */
  onVerify: (code: string) => Promise<void>;
  /** Sends a new code. */
  onResend: () => Promise<void>;
  verifying: boolean;
  resending: boolean;
  error?: string | null;
};

const CODE_LENGTH = 6;

/** The 6-digit code sent by email, with the button to send another one. */
export function CodeForm({ onVerify, onResend, verifying, resending, error }: CodeFormProps) {
  const [code, setCode] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onVerify(code).catch(() => undefined);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label={t("enterCode")}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
      />
      <FormError message={error} />
      <Button type="submit" loading={verifying} disabled={code.length !== CODE_LENGTH}>
        {t("verify")}
      </Button>
      <Button
        variant="ghost"
        loading={resending}
        onClick={() => void onResend().catch(() => undefined)}
      >
        {t("resendCode")}
      </Button>
    </form>
  );
}
