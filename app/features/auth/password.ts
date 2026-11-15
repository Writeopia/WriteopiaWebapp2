/** The rules of a password, as PasswordValidator.kt of the Compose app applies them. */

export type PasswordStrength = "none" | "weak" | "medium" | "strong";

export type PasswordValidation = {
  strength: PasswordStrength;
  hasMinLength: boolean;
  hasSpecialChar: boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

const SPECIAL_CHAR = /[!@#$%^&*()_+\-=[\]{}|;':",./<>?`~\\]/;

export function validatePassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const hasSpecialChar = SPECIAL_CHAR.test(password);

  let strength: PasswordStrength;
  if (password.length === 0) strength = "none";
  else if (hasMinLength && hasSpecialChar) strength = "strong";
  else if (hasMinLength || hasSpecialChar) strength = "medium";
  else strength = "weak";

  return { strength, hasMinLength, hasSpecialChar };
}

/** Same rule as the backend: 3 to 30 letters, digits, '-' or '_'. */
export function isValidUsername(username: string): boolean {
  return /^[\p{L}\p{Nd}_-]{3,30}$/u.test(username);
}
