import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, showToast } from "~/core/ui";
import { resetPassword } from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import {
  isNewPasswordValid,
  NewPasswordFields,
} from "~/features/auth/components/NewPasswordFields";
import { paths, requireSession } from "~/features/auth/session";

export const clientLoader = requireSession;

/** Changes the password of the signed-in user. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");

  const save = useMutation({
    mutationFn: () => resetPassword(password),
    onSuccess: () => {
      showToast(t("passwordResetSuccess"), { kind: "success" });
      void navigate(paths.start, { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <AuthCard
      title={t("resetPassword")}
      subtitle={t("typeNewPassword")}
      footer={
        <Link to={paths.start} className="text-link underline">
          {t("back")}
        </Link>
      }
    >
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
