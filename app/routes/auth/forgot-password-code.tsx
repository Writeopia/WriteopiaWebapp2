import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { showToast } from "~/core/ui";
import { requestPasswordReset, verifyPasswordResetCode } from "~/features/auth/api";
import { AuthCard } from "~/features/auth/components/AuthCard";
import { CodeForm } from "~/features/auth/components/CodeForm";
import { useForgotPasswordFlow } from "~/features/auth/flows";
import { paths } from "~/features/auth/session";

/** Forgotten password, step 2: the reset code sent by email. */
export default function ForgotPasswordCode() {
  const navigate = useNavigate();
  const email = useForgotPasswordFlow((flow) => flow.email);
  const setCode = useForgotPasswordFlow((flow) => flow.setCode);

  const verify = useMutation({
    mutationFn: (code: string) => verifyPasswordResetCode(email, code),
    onSuccess: (_, code) => {
      setCode(code);
      void navigate(paths.forgotPasswordNew);
    },
  });

  const resend = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: () => showToast(t("codeSent"), { kind: "success" }),
    onError: () => showToast(t("sendResetCodeFailed"), { kind: "error" }),
  });

  if (!email) return <Navigate to={paths.forgotPassword} replace />;

  return (
    <AuthCard title={t("enterResetCode")} subtitle={t("codeSentTo", { email })}>
      <CodeForm
        onVerify={verify.mutateAsync}
        onResend={resend.mutateAsync}
        verifying={verify.isPending}
        resending={resend.isPending}
        error={verify.isError ? t("invalidCode") : null}
      />
    </AuthCard>
  );
}
