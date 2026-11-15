import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, TextField } from "~/core/ui";
import { sendRegisterCode } from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { useRegisterFlow } from "~/features/auth/flows";
import { paths } from "~/features/auth/session";

/** Sign-up, step 1: the email that receives the verification code. */
export default function RegisterEmail() {
  const navigate = useNavigate();
  const setFlowEmail = useRegisterFlow((flow) => flow.setEmail);
  const [email, setEmail] = useState(() => useRegisterFlow.getState().email);

  const sendCode = useMutation({
    mutationFn: () => sendRegisterCode(email.trim()),
    onSuccess: () => {
      setFlowEmail(email.trim());
      void navigate(paths.registerCode);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendCode.mutate();
  };

  return (
    <AuthCard
      title={t("createYourAccount")}
      subtitle={t("registerEnterEmail")}
      footer={
        <>
          {t("alreadyHaveAccount")}{" "}
          <Link to={paths.login} className="text-link underline">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FormError message={sendCode.isError ? t("verificationCodeFailed") : null} />
        <Button type="submit" loading={sendCode.isPending} disabled={!email.includes("@")}>
          {t("sendVerificationCode")}
        </Button>
      </form>
    </AuthCard>
  );
}
