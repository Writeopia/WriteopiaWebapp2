import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, TextField } from "~/core/ui";
import {
  type GoogleLoginResult,
  type GoogleSignUp,
  login,
  loginWithGoogle,
} from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import {
  GoogleSignInButton,
  googleWebClientId,
} from "~/features/auth/components/GoogleSignInButton";
import { GoogleSignUpDialog } from "~/features/auth/components/GoogleSignUpDialog";
import { paths, setSessionUser } from "~/features/auth/session";

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [googleSignUp, setGoogleSignUp] = useState<GoogleSignUp | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);

  /** The answer of a password or Google sign-in. */
  const onResult = (result: GoogleLoginResult) => {
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
      case "signUpRequired":
        setGoogleSignUp(result.signUp);
        break;
      case "invalidCredentials":
      case "usernameTaken":
        break;
    }
  };

  const signIn = useMutation({
    mutationFn: () => login(identifier.trim(), password),
    onSuccess: onResult,
  });

  const googleSignIn = useMutation({
    mutationFn: (idToken: string) => loginWithGoogle({ idToken }),
    onMutate: () => setGoogleFailed(false),
    onSuccess: onResult,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate();
  };

  const error = signIn.isError
    ? t("errorServer")
    : signIn.data?.kind === "invalidCredentials"
      ? t("loginFailed")
      : googleFailed || googleSignIn.isError || googleSignIn.data?.kind === "invalidCredentials"
        ? t("googleSignInFailed")
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

      {googleWebClientId && (
        <div className="mt-4 flex flex-col items-center gap-4">
          <div className="flex w-full items-center gap-3 text-sm text-text-lighter">
            <span className="h-px flex-1 bg-divider" />
            {t("orContinueWith")}
            <span className="h-px flex-1 bg-divider" />
          </div>
          <GoogleSignInButton
            onCredential={(idToken) => googleSignIn.mutate(idToken)}
            onError={() => setGoogleFailed(true)}
          />
        </div>
      )}

      <GoogleSignUpDialog
        signUp={googleSignUp}
        onClose={() => setGoogleSignUp(null)}
        onResult={(result) => {
          setGoogleSignUp(null);
          onResult(result);
        }}
      />
    </AuthCard>
  );
}
