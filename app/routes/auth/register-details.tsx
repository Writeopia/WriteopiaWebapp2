import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";

import { ApiError } from "~/core/api";
import { useDebouncedValue } from "~/core/hooks/useDebouncedValue";
import { t } from "~/core/i18n";
import { Button, PasswordField, TextField } from "~/core/ui";
import {
  getLegalDocument,
  isUsernameAvailable,
  type LegalDocumentType,
  login,
  register,
} from "~/features/auth/api";
import { AuthCard, FormError } from "~/features/auth/components/AuthCard";
import { LegalDocumentDialog } from "~/features/auth/components/LegalDocumentDialog";
import { PasswordStrength } from "~/features/auth/components/PasswordStrength";
import { TermsAgreement } from "~/features/auth/components/TermsAgreement";
import { useRegisterFlow } from "~/features/auth/flows";
import { isValidUsername, validatePassword } from "~/features/auth/password";
import { paths, setSessionUser } from "~/features/auth/session";

const USERNAME_CHECK_DELAY_MS = 400;

/** Sign-up, step 3: who the user is, the first workspace, the password and the legal texts. */
export default function RegisterDetails() {
  const navigate = useNavigate();
  const { email, code, reset } = useRegisterFlow();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentType | null>(null);
  const [done, setDone] = useState(false);

  // Asked once the user stops typing. A failed check stays unknown: registering still
  // catches a taken username.
  const checkedUsername = useDebouncedValue(username, USERNAME_CHECK_DELAY_MS);
  const availability = useQuery({
    queryKey: ["username-available", checkedUsername],
    queryFn: () => isUsernameAvailable(checkedUsername),
    enabled: isValidUsername(checkedUsername),
    staleTime: 10_000,
  });
  const usernameValid = isValidUsername(username);
  const usernameChecking =
    usernameValid && (username !== checkedUsername || availability.isFetching);
  const usernameTaken = usernameValid && !usernameChecking && availability.data === false;
  const usernameFree = usernameValid && !usernameChecking && availability.data === true;

  const passwordValidation = validatePassword(password);

  const signUp = useMutation({
    mutationFn: async () => {
      // The version agreed to is the one served right now: the backend refuses an older one.
      const terms = await getLegalDocument("terms");
      const registered = await register({
        name: name.trim(),
        email,
        username,
        workspaceName: workspaceName.trim(),
        password,
        verificationCode: code,
        acceptedLegalVersion: terms.version,
      });

      if (registered.emailConfirmationRequired) return { next: "confirmEmail" as const };

      // The session cookies are only set by the web login.
      const result = await login(email, password);
      if (result.kind !== "signedIn") return { next: "login" as const };

      setSessionUser(result.user);
      return { next: "start" as const };
    },
    onSuccess: ({ next }) => {
      setDone(true);
      reset();
      if (next === "confirmEmail") void navigate(paths.confirmEmail, { state: { email } });
      else if (next === "login") void navigate(paths.login, { replace: true });
      else void navigate(paths.start, { replace: true });
    },
  });

  // Once signed up the flow is emptied, and this screen is on its way out.
  if ((!email || !code) && !done) return <Navigate to={paths.register} replace />;

  const canRegister =
    name.trim() !== "" &&
    usernameValid &&
    !usernameChecking &&
    !usernameTaken &&
    workspaceName.trim() !== "" &&
    passwordValidation.strength === "strong" &&
    termsAccepted;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canRegister) signUp.mutate();
  };

  // The backend explains a refused sign-up in plain text ("Username already taken").
  const error = !signUp.isError
    ? null
    : signUp.error instanceof ApiError && signUp.error.status < 500 && signUp.error.message
      ? signUp.error.message
      : t("registrationFailed");

  return (
    <AuthCard title={t("createYourAccount")} subtitle={email}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("name")}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t("username")}
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(event) => setUsername(event.target.value.trim())}
          error={
            usernameTaken
              ? t("usernameTaken")
              : username !== "" && !usernameValid
                ? t("usernameRules")
                : undefined
          }
          hint={usernameFree ? t("usernameAvailable") : undefined}
        />
        <TextField
          label={t("workspaceName")}
          autoComplete="organization"
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
        />
        <PasswordField
          label={t("password")}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrength validation={passwordValidation} />

        <TermsAgreement
          accepted={termsAccepted}
          onAcceptedChange={setTermsAccepted}
          onOpenDocument={setLegalDocument}
        />

        <FormError message={error} />
        <Button type="submit" loading={signUp.isPending} disabled={!canRegister}>
          {t("createAccount")}
        </Button>
      </form>

      <LegalDocumentDialog type={legalDocument} onClose={() => setLegalDocument(null)} />
    </AuthCard>
  );
}
