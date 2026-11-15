import { t } from "~/core/i18n";
import { TextField } from "~/core/ui";

import { validatePassword } from "../password";
import { PasswordStrength } from "./PasswordStrength";

type NewPasswordFieldsProps = {
  password: string;
  repeated: string;
  onPasswordChange: (password: string) => void;
  onRepeatedChange: (repeated: string) => void;
};

/** Whether a new password, typed twice, can be sent: strong, and the same both times. */
export function isNewPasswordValid(password: string, repeated: string): boolean {
  return validatePassword(password).strength === "strong" && password === repeated;
}

/** A new password and its repetition, with the strength of the first. */
export function NewPasswordFields({
  password,
  repeated,
  onPasswordChange,
  onRepeatedChange,
}: NewPasswordFieldsProps) {
  const mismatch = repeated.length > 0 && password !== repeated;

  return (
    <>
      <TextField
        label={t("newPassword")}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
      />
      <PasswordStrength validation={validatePassword(password)} />
      <TextField
        label={t("repeatPassword")}
        type="password"
        autoComplete="new-password"
        value={repeated}
        onChange={(event) => onRepeatedChange(event.target.value)}
        error={mismatch ? t("passwordsDoNotMatch") : undefined}
      />
    </>
  );
}
