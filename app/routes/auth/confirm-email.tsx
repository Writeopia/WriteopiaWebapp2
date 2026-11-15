import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { showToast, TextField } from "~/core/ui";
import { confirmEmail, resendConfirmationEmail } from "~/features/auth/api";
import { AuthCard } from "~/features/auth/components/AuthCard";
import { CodeForm } from "~/features/auth/components/CodeForm";
import { paths } from "~/features/auth/session";

/** For an account whose email was never confirmed: the code sent to it activates the account. */
export default function ConfirmEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromLogin = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(emailFromLogin);

  const confirm = useMutation({
    mutationFn: (code: string) => confirmEmail(email.trim(), code),
    onSuccess: () => {
      showToast(t("emailConfirmed"), { kind: "success" });
      void navigate(paths.login, { replace: true });
    },
  });

  const resend = useMutation({
    mutationFn: () => resendConfirmationEmail(email.trim()),
    onSuccess: () => showToast(t("codeSent"), { kind: "success" }),
    onError: () => showToast(t("verificationCodeFailed"), { kind: "error" }),
  });

  return (
    <AuthCard
      title={t("confirmYourEmail")}
      subtitle={emailFromLogin ? t("codeSentTo", { email: emailFromLogin }) : undefined}
    >
      {!emailFromLogin && (
        <TextField
          label={t("email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      )}
      <CodeForm
        onVerify={confirm.mutateAsync}
        onResend={resend.mutateAsync}
        verifying={confirm.isPending}
        resending={resend.isPending}
        error={confirm.isError ? t("invalidCode") : null}
      />
    </AuthCard>
  );
}
