import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, TextField } from "~/core/ui";
import { login } from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { paths, setSessionUser } from "~/features/auth/session";

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const signIn = useMutation({
    mutationFn: () => login(identifier.trim(), password),
    onSuccess: (result) => {
      switch (result.kind) {
        case "signedIn":
          setSessionUser(result.user);
          void navigate(paths.start, { replace: true });
          break;
        case "unconfirmed":
          void navigate(paths.confirmEmail, { state: { email: result.user.email } });
          break;
        case "deletionPending":
          void navigate(paths.accountDeletionStarted, { replace: true });
          break;
        case "invalidCredentials":
          break;
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate();
  };

  const error = signIn.isError
    ? t("errorServer")
    : signIn.data?.kind === "invalidCredentials"
      ? t("loginFailed")
      : null;

  return (
    <AuthCard
      title={t("startNow")}
      subtitle={t("signInToAccount")}
      footer={
        <>
          {t("noAccountYet")}{" "}
          <Link to={paths.register} className="text-link underline">
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("emailOrUsername")}
          autoComplete="username"
          autoCapitalize="none"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
        <TextField
          label={t("password")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Link to={paths.forgotPassword} className="self-end text-sm text-link underline">
          {t("forgotPassword")}
        </Link>
        <FormError message={error} />
        <Button
          type="submit"
          loading={signIn.isPending}
          disabled={identifier.trim() === "" || password === ""}
        >
          {t("signIn")}
        </Button>
      </form>
    </AuthCard>
  );
}
