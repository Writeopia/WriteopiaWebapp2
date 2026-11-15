import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, showToast } from "~/core/ui";
import { resetPasswordWithCode } from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import {
  isNewPasswordValid,
  NewPasswordFields,
} from "~/features/auth/components/NewPasswordFields";
import { useForgotPasswordFlow } from "~/features/auth/flows";
import { paths } from "~/features/auth/session";

/** Forgotten password, step 3: the new password. */
export default function ForgotPasswordNew() {
  const navigate = useNavigate();
  const { email, code, reset } = useForgotPasswordFlow();
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => resetPasswordWithCode(email, code, password),
    onSuccess: () => {
      setDone(true);
      reset();
      showToast(t("passwordResetSuccess"), { kind: "success" });
      void navigate(paths.login, { replace: true });
    },
  });

  // Once saved the flow is emptied, and this screen is on its way out.
  if ((!email || !code) && !done) return <Navigate to={paths.forgotPassword} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <AuthCard title={t("setNewPassword")} subtitle={t("typeNewPassword")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <NewPasswordFields
          password={password}
          repeated={repeated}
          onPasswordChange={setPassword}
          onRepeatedChange={setRepeated}
        />
        <FormError message={save.isError ? t("resetPasswordFailed") : null} />
        <Button
          type="submit"
          loading={save.isPending}
          disabled={!isNewPasswordValid(password, repeated)}
        >
          {t("resetPassword")}
        </Button>
      </form>
    </AuthCard>
  );
}
