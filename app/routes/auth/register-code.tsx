import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { showToast } from "~/core/ui";
import { sendRegisterCode, verifyRegisterCode } from "~/features/auth/api";
import { AuthCard } from "~/features/auth/components/AuthCard";
import { CodeForm } from "~/features/auth/components/CodeForm";
import { useRegisterFlow } from "~/features/auth/flows";
import { paths } from "~/features/auth/session";

/** Sign-up, step 2: the code that proves the email is the user's. */
export default function RegisterCode() {
  const navigate = useNavigate();
  const email = useRegisterFlow((flow) => flow.email);
  const setCode = useRegisterFlow((flow) => flow.setCode);

  const verify = useMutation({
    mutationFn: (code: string) => verifyRegisterCode(email, code),
    onSuccess: (_, code) => {
      setCode(code);
      void navigate(paths.registerDetails);
    },
  });

  const resend = useMutation({
    mutationFn: () => sendRegisterCode(email),
    onSuccess: () => showToast(t("codeSent"), { kind: "success" }),
    onError: () => showToast(t("verificationCodeFailed"), { kind: "error" }),
  });

  if (!email) return <Navigate to={paths.register} replace />;

  return (
    <AuthCard title={t("verifyYourEmail")} subtitle={t("codeSentTo", { email })}>
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
