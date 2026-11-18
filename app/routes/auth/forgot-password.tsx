import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, TextField } from "~/core/ui";
import { requestPasswordReset } from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { useForgotPasswordFlow } from "~/features/auth/flows";
import { paths } from "~/features/auth/session";

/** Forgotten password, step 1: the email that receives the reset code. */
export default function ForgotPasswordEmail() {
  const navigate = useNavigate();
  const setFlowEmail = useForgotPasswordFlow((flow) => flow.setEmail);
  const [email, setEmail] = useState(() => useForgotPasswordFlow.getState().email);

  const sendCode = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    onSuccess: () => {
      setFlowEmail(email.trim());
      void navigate(paths.forgotPasswordCode);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendCode.mutate();
  };

  return (
    <AuthCard title={t("forgotPasswordTitle")} subtitle={t("enterYourEmail")} backTo={paths.login}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FormError message={sendCode.isError ? t("sendResetCodeFailed") : null} />
        <Button type="submit" loading={sendCode.isPending} disabled={!email.includes("@")}>
          {t("sendResetCode")}
        </Button>
      </form>
    </AuthCard>
  );
}
