import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { t } from "~/core/i18n";
import { Button, Dialog, TextField } from "~/core/ui";

import {
  getLegalDocument,
  type GoogleLoginResult,
  type GoogleSignUp,
  type LegalDocumentType,
  loginWithGoogle,
} from "../api";
import { isValidUsername } from "../password";
import { FormError } from "./AuthCard";
import { LegalDocumentDialog } from "./LegalDocumentDialog";
import { TermsAgreement } from "./TermsAgreement";

type GoogleSignUpDialogProps = {
  /** The Google account to make an account for; null keeps the dialog closed. */
  signUp: GoogleSignUp | null;
  onClose: () => void;
  /** The answer once the account exists (or the sign-in otherwise ends). */
  onResult: (result: GoogleLoginResult) => void;
};

/** The first sign-in of a Google account: the username of the new account and the Terms. */
export function GoogleSignUpDialog({ signUp, onClose, onResult }: GoogleSignUpDialogProps) {
  return signUp ? (
    <SignUpForm key={signUp.idToken} signUp={signUp} onClose={onClose} onResult={onResult} />
  ) : null;
}

function SignUpForm({
  signUp,
  onClose,
  onResult,
}: GoogleSignUpDialogProps & { signUp: GoogleSignUp }) {
  const [username, setUsername] = useState(signUp.suggestedUsername);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentType | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      // The version of the texts the user agreed to is the one served right now.
      const terms = await getLegalDocument("terms");
      return loginWithGoogle({
        idToken: signUp.idToken,
        username: username.trim(),
        acceptedLegalVersion: terms.version,
      });
    },
    onSuccess: (result) => {
      if (result.kind !== "usernameTaken") onResult(result);
    },
  });

  const usernameTaken = create.data?.kind === "usernameTaken";
  const validUsername = isValidUsername(username.trim());
  const error = create.isError ? t("errorServer") : null;

  return (
    <>
      <Dialog
        open
        onClose={() => {
          if (!create.isPending) onClose();
        }}
        title={t("googleSignUpTitle")}
        actions={
          <>
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              {t("cancel")}
            </Button>
            <Button
              loading={create.isPending}
              disabled={!termsAccepted || !validUsername}
              onClick={() => create.mutate()}
            >
              {t("createAccount")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">{t("googleSignUpMessage", { email: signUp.email })}</p>
          <TextField
            label={t("username")}
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={usernameTaken ? t("usernameTaken") : undefined}
          />
          <TermsAgreement
            accepted={termsAccepted}
            onAcceptedChange={setTermsAccepted}
            onOpenDocument={setLegalDocument}
          />
          <FormError message={error} />
        </div>
      </Dialog>
      <LegalDocumentDialog type={legalDocument} onClose={() => setLegalDocument(null)} />
    </>
  );
}
