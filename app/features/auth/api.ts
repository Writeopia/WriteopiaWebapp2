import { z } from "zod";

import { api, ApiError, renewSession } from "~/core/api";
import { tierSchema, type User, userSchema } from "~/core/models";

/**
 * The account endpoints, as AuthApi.kt of the Compose app calls them. The web session is two
 * HttpOnly cookies set by the backend, so no call here ever carries or returns a token.
 */

/** A 401 from these is their answer, not an expired session to renew. */
const noRenewal = { renewSession: false } as const;

const authResponseSchema = z.object({
  writeopiaUser: userSchema,
  enabled: z.boolean().default(true),
});

const registerResponseSchema = z.object({
  writeopiaUser: userSchema,
  emailConfirmationRequired: z.boolean().default(false),
});

const successSchema = z.object({
  success: z.boolean(),
  message: z.string().nullish(),
});

const legalDocumentSchema = z.object({
  type: z.string(),
  version: z.string(),
  effectiveDate: z.string(),
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

export const subscriptionSchema = z.object({
  premium: z.boolean(),
  tier: tierSchema,
  monthlyPriceCents: z.number().nullish(),
  currency: z.string().nullish(),
});

/** Whether the account may use the cloud, and what the subscription costs. */
export type Subscription = z.infer<typeof subscriptionSchema>;

export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalDocumentType = "terms" | "privacy";

export type LoginResult =
  | { kind: "signedIn"; user: User }
  /** The account exists but its email was never confirmed. */
  | { kind: "unconfirmed"; user: User }
  | { kind: "invalidCredentials" }
  /** The account is being deleted. */
  | { kind: "deletionPending" };

/** Signs in with an email or a username. On success the backend sets the session cookies. */
export async function login(identifier: string, password: string): Promise<LoginResult> {
  try {
    const response = await api.post(
      "/auth/login/web",
      { identifier, password },
      authResponseSchema,
      noRenewal,
    );

    return { kind: response.enabled ? "signedIn" : "unconfirmed", user: response.writeopiaUser };
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return { kind: "invalidCredentials" };
    if (error instanceof ApiError && error.isForbidden) return { kind: "deletionPending" };
    throw error;
  }
}

const googleSignUpSchema = z.object({
  idToken: z.string(),
  email: z.string(),
  name: z.string(),
  suggestedUsername: z.string(),
});

/** A Google account with no Writeopia account yet: what the sign-up step starts from. */
export type GoogleSignUp = z.infer<typeof googleSignUpSchema>;

export type GoogleLoginResult =
  | LoginResult
  /** No account yet: ask for a username and the Terms, then send the token back. */
  | { kind: "signUpRequired"; signUp: GoogleSignUp }
  | { kind: "usernameTaken" };

export type GoogleLoginRequest = {
  /** The Google ID token: from Google's button, or [GoogleSignUp.idToken] when signing up. */
  idToken: string;
  username?: string;
  acceptedLegalVersion?: string;
};

/**
 * Signs in with a Google ID token. On success the backend sets the session cookies. The first
 * sign-in of a Google account answers [signUpRequired]; sent again with a username and the
 * legal version, it creates the account.
 */
export async function loginWithGoogle(request: GoogleLoginRequest): Promise<GoogleLoginResult> {
  try {
    const response = await api.post(
      "/auth/login/google/web",
      request,
      authResponseSchema,
      noRenewal,
    );

    return { kind: response.enabled ? "signedIn" : "unconfirmed", user: response.writeopiaUser };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 422) {
      return { kind: "signUpRequired", signUp: googleSignUpSchema.parse(JSON.parse(error.body)) };
    }
    if (error.isConflict && request.username !== undefined) return { kind: "usernameTaken" };
    if (error.isUnauthorized) return { kind: "invalidCredentials" };
    if (error.isForbidden) return { kind: "deletionPending" };
    throw error;
  }
}

/** Ends the session: the backend revokes the refresh token and clears the cookies. */
export function logout(): Promise<void> {
  return api.send("POST", "/auth/logout/web", undefined, noRenewal);
}

/** The signed-in user; null when there is no session. An expired session is renewed first. */
export function getSessionUser(): Promise<User | null> {
  return api.get("/auth/user/current", userSchema).catch(nullWithoutSession);
}

/**
 * The same question from a screen that is already open for a guest: finding no session is
 * the expected answer there, so nobody is told that a session expired.
 */
export async function findSessionUser(): Promise<User | null> {
  const ask = () => api.get("/auth/user/current", userSchema, noRenewal).catch(nullWithoutSession);

  return (await ask()) ?? ((await renewSession()) ? ask() : null);
}

function nullWithoutSession(error: unknown): null {
  if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) return null;
  throw error;
}

/**
 * Whether the signed-in user has a subscription: the source of truth for the paywall, whatever
 * tier the login answered with. An expired session is renewed first, like [getSessionUser].
 */
export function getSubscription(): Promise<Subscription> {
  return api.get("/auth/subscription", subscriptionSchema);
}

/**
 * First step of sign-up: emails a verification code. The answer is the same whether or not
 * the email is already registered.
 */
export function sendRegisterCode(email: string): Promise<void> {
  return api.send("POST", "/auth/register/email/send", { email }, noRenewal);
}

/** Second step of sign-up. The code is not consumed: it is sent again with [register]. */
export function verifyRegisterCode(email: string, code: string): Promise<void> {
  return api.send("POST", "/auth/register/email/verify", { email, code }, noRenewal);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const response = await api.get("/auth/username/available", z.object({ available: z.boolean() }), {
    query: { username },
    ...noRenewal,
  });
  return response.available;
}

/** The Terms of Service or the Privacy Policy. Public. */
export function getLegalDocument(type: LegalDocumentType): Promise<LegalDocument> {
  return api.get(`/auth/legal/${type}`, legalDocumentSchema, noRenewal);
}

export type RegisterRequest = {
  name: string;
  email: string;
  username: string;
  workspaceName: string;
  password: string;
  verificationCode: string;
  /** The version of the legal texts the user agreed to; the backend refuses an older one. */
  acceptedLegalVersion: string;
};

export async function register(
  request: RegisterRequest,
): Promise<{ user: User; emailConfirmationRequired: boolean }> {
  const response = await api.post("/auth/register", request, registerResponseSchema, noRenewal);
  return {
    user: response.writeopiaUser,
    emailConfirmationRequired: response.emailConfirmationRequired,
  };
}

/** Confirms the email of an account that signed up without verifying it. */
export async function confirmEmail(email: string, code: string): Promise<void> {
  await api.post("/auth/email/confirm", { email, code }, z.unknown(), noRenewal);
}

export function resendConfirmationEmail(email: string): Promise<void> {
  return succeeded(api.post("/auth/email/resend", { email }, successSchema, noRenewal));
}

/** First step of a forgotten password: emails a reset code. */
export function requestPasswordReset(email: string): Promise<void> {
  return succeeded(api.post("/auth/password/forgot", { email }, successSchema, noRenewal));
}

export function verifyPasswordResetCode(email: string, code: string): Promise<void> {
  return succeeded(
    api.post("/auth/password/verify-code", { email, code }, successSchema, noRenewal),
  );
}

export function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return succeeded(
    api.post(
      "/auth/password/reset-with-code",
      { email, code, newPassword },
      successSchema,
      noRenewal,
    ),
  );
}

/** Changes the password of the signed-in user. */
export function resetPassword(newPassword: string): Promise<void> {
  return api.send("PUT", "/auth/password/reset", { newPassword });
}

/** These endpoints can refuse with a 200 and `success: false`; that is a failure too. */
async function succeeded(
  request: Promise<{ success: boolean; message?: string | null }>,
): Promise<void> {
  const response = await request;
  if (!response.success) throw new ApiError(200, response.message ?? "Request refused");
}
