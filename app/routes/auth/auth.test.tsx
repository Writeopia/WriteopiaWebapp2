import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { queryClient } from "~/core/query/queryClient";
import { useForgotPasswordFlow, useRegisterFlow } from "~/features/auth/flows";
import { paths, sessionUserKey } from "~/features/auth/session";

import { aUser } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { renderRoute } from "../../../test/render";
import ConfirmEmail from "./confirm-email";
import ForgotPasswordEmail from "./forgot-password";
import ForgotPasswordCode from "./forgot-password-code";
import ForgotPasswordNew from "./forgot-password-new";
import Login from "./login";
import RegisterEmail from "./register";
import RegisterCode from "./register-code";
import RegisterDetails from "./register-details";
import ResetPassword from "./reset-password";

const STRONG_PASSWORD = "secret-word!";

/** Records the JSON body of each request to a POST or PUT endpoint, and answers with [answer]. */
function record(method: "post" | "put", path: string, answer: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      bodies.push(await request.json());
      return answer();
    }),
  );
  return bodies;
}

const text = (body: string, status: number) => () => new HttpResponse(body, { status });
const json =
  (body: object, status = 200) =>
  () =>
    HttpResponse.json(body, { status });

describe("Login", () => {
  const destinations = [paths.start, paths.confirmEmail, paths.accountDeletionStarted];

  async function signIn() {
    await userEvent.type(screen.getByLabelText("Email or username"), " ana ");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("keeps the button off until both fields are filled", async () => {
    renderRoute(Login, { path: paths.login });
    const button = screen.getByRole("button", { name: "Sign in" });

    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Email or username"), "ana");
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    expect(button).toBeEnabled();
  });

  it("signs in and goes to the start", async () => {
    const bodies = record(
      "post",
      "/auth/login/web",
      json({ writeopiaUser: aUser(), enabled: true }),
    );
    renderRoute(Login, { path: paths.login, destinations });

    await signIn();

    expect(await screen.findByText(`at ${paths.start}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ identifier: "ana", password: "secret" }]);
    expect(queryClient.getQueryData(sessionUserKey)).toEqual(aUser());
  });

  it("sends an account that is not confirmed to confirm its email", async () => {
    record("post", "/auth/login/web", json({ writeopiaUser: aUser(), enabled: false }));
    renderRoute(Login, { path: paths.login, destinations });

    await signIn();

    expect(
      await screen.findByText(`at ${paths.confirmEmail} {"email":"ana@writeopia.io"}`),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(sessionUserKey)).toBeUndefined();
  });

  it("says so when the credentials are wrong", async () => {
    record("post", "/auth/login/web", text("Invalid credentials", 401));
    renderRoute(Login, { path: paths.login, destinations });

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Login failed. Please check your credentials.",
    );
  });

  it("sends an account being deleted to its notice", async () => {
    record("post", "/auth/login/web", text("Account is being deleted", 403));
    renderRoute(Login, { path: paths.login, destinations });

    await signIn();

    expect(await screen.findByText(`at ${paths.accountDeletionStarted}`)).toBeInTheDocument();
  });

  it("says so when the server fails", async () => {
    record("post", "/auth/login/web", text("Login failed", 500));
    renderRoute(Login, { path: paths.login, destinations });

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
  });
});

describe("Register", () => {
  it("step 1 sends the code and moves on", async () => {
    const bodies = record("post", "/auth/register/email/send", text("", 200));
    renderRoute(RegisterEmail, { path: paths.register, destinations: [paths.registerCode] });

    await userEvent.type(screen.getByLabelText("Email"), "ana@writeopia.io");
    await userEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));

    expect(await screen.findByText(`at ${paths.registerCode}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io" }]);
    expect(useRegisterFlow.getState().email).toBe("ana@writeopia.io");
  });

  it("step 1 says so when the code cannot be sent", async () => {
    record("post", "/auth/register/email/send", json({ success: false, message: "Too many" }, 429));
    renderRoute(RegisterEmail, { path: paths.register });

    await userEvent.type(screen.getByLabelText("Email"), "ana@writeopia.io");
    await userEvent.click(screen.getByRole("button", { name: "Send Verification Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not send the verification code",
    );
  });

  it("step 2 goes back to the email when there is none", () => {
    renderRoute(RegisterCode, { path: paths.registerCode, destinations: [paths.register] });

    expect(screen.getByText(`at ${paths.register}`)).toBeInTheDocument();
  });

  it("step 2 checks the code and keeps it for the last step", async () => {
    useRegisterFlow.getState().setEmail("ana@writeopia.io");
    const bodies = record("post", "/auth/register/email/verify", text("", 200));
    renderRoute(RegisterCode, { path: paths.registerCode, destinations: [paths.registerDetails] });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "12a3456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(`at ${paths.registerDetails}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io", code: "123456" }]);
    expect(useRegisterFlow.getState().code).toBe("123456");
  });

  it("step 2 refuses a wrong code and can send another", async () => {
    useRegisterFlow.getState().setEmail("ana@writeopia.io");
    record(
      "post",
      "/auth/register/email/verify",
      json({ success: false, message: "Invalid code" }, 400),
    );
    const resent = record("post", "/auth/register/email/send", text("", 200));
    renderRoute(RegisterCode, { path: paths.registerCode });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code");

    await userEvent.click(screen.getByRole("button", { name: "Resend Code" }));
    expect(await screen.findByText("Confirmation code sent!")).toBeInTheDocument();
    expect(resent).toEqual([{ email: "ana@writeopia.io" }]);
  });

  describe("step 3", () => {
    function verified() {
      useRegisterFlow.getState().setEmail("ana@writeopia.io");
      useRegisterFlow.getState().setCode("123456");
    }

    function withBackend({ available = true } = {}) {
      server.use(
        http.get(apiUrl("/auth/username/available"), () => HttpResponse.json({ available })),
        http.get(apiUrl("/auth/legal/:type"), ({ params }) =>
          HttpResponse.json({
            type: params.type,
            version: "2026-01",
            effectiveDate: "2026-01-01",
            title: params.type === "terms" ? "Terms of Service" : "Privacy Policy",
            sections: [{ heading: "1. Using Writeopia", body: "Be kind." }],
          }),
        ),
      );
    }

    async function fill({ username = "ana_w" } = {}) {
      await userEvent.type(screen.getByLabelText("Name"), "Ana");
      await userEvent.type(screen.getByLabelText("Username"), username);
      await userEvent.type(screen.getByLabelText("Workspace name"), "Personal");
      await userEvent.type(screen.getByLabelText("Password"), STRONG_PASSWORD);
      await userEvent.click(screen.getByRole("checkbox"));
    }

    const createAccount = () => screen.getByRole("button", { name: "Create account" });

    it("goes back to the email when the email was not verified", () => {
      renderRoute(RegisterDetails, { path: paths.registerDetails, destinations: [paths.register] });

      expect(screen.getByText(`at ${paths.register}`)).toBeInTheDocument();
    });

    it("registers with the verified code and the legal version, then signs in", async () => {
      verified();
      withBackend();
      const registered = record(
        "post",
        "/auth/register",
        json({ writeopiaUser: aUser(), emailConfirmationRequired: false }),
      );
      const logins = record("post", "/auth/login/web", json({ writeopiaUser: aUser() }));
      renderRoute(RegisterDetails, { path: paths.registerDetails, destinations: [paths.start] });

      await fill();
      expect(await screen.findByText("This username is available")).toBeInTheDocument();
      await userEvent.click(createAccount());

      expect(await screen.findByText(`at ${paths.start}`)).toBeInTheDocument();
      expect(registered).toEqual([
        {
          name: "Ana",
          email: "ana@writeopia.io",
          username: "ana_w",
          workspaceName: "Personal",
          password: STRONG_PASSWORD,
          verificationCode: "123456",
          acceptedLegalVersion: "2026-01",
        },
      ]);
      expect(logins).toEqual([{ identifier: "ana@writeopia.io", password: STRONG_PASSWORD }]);
      expect(queryClient.getQueryData(sessionUserKey)).toEqual(aUser());
      expect(useRegisterFlow.getState().email).toBe("");
    });

    it("keeps the button off for a taken username", async () => {
      verified();
      withBackend({ available: false });
      renderRoute(RegisterDetails, { path: paths.registerDetails });

      await fill();

      expect(await screen.findByText("This username is already taken")).toBeInTheDocument();
      expect(createAccount()).toBeDisabled();
    });

    it("keeps the button off until the password is strong and the terms accepted", async () => {
      verified();
      withBackend();
      renderRoute(RegisterDetails, { path: paths.registerDetails });

      await userEvent.type(screen.getByLabelText("Name"), "Ana");
      await userEvent.type(screen.getByLabelText("Username"), "ana_w");
      await userEvent.type(screen.getByLabelText("Workspace name"), "Personal");
      await userEvent.type(screen.getByLabelText("Password"), "weakpass");
      await userEvent.click(screen.getByRole("checkbox"));
      await screen.findByText("This username is available");
      expect(screen.getByText("Medium password")).toBeInTheDocument();
      expect(createAccount()).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Password"), "!");
      expect(screen.getByText("Strong password")).toBeInTheDocument();
      expect(createAccount()).toBeEnabled();

      await userEvent.click(screen.getByRole("checkbox"));
      expect(createAccount()).toBeDisabled();
    });

    it("explains the rules of a username", async () => {
      verified();
      withBackend();
      renderRoute(RegisterDetails, { path: paths.registerDetails });

      await userEvent.type(screen.getByLabelText("Username"), "a!");

      expect(screen.getByText("3 to 30 letters, digits, - or _")).toBeInTheDocument();
    });

    it("shows the legal texts", async () => {
      verified();
      withBackend();
      renderRoute(RegisterDetails, { path: paths.registerDetails });

      await userEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));

      expect(await screen.findByRole("dialog", { name: "Privacy Policy" })).toBeInTheDocument();
      expect(await screen.findByText("Be kind.")).toBeInTheDocument();
    });

    it("shows why the backend refused", async () => {
      verified();
      withBackend();
      record("post", "/auth/register", text("Username already taken", 409));
      renderRoute(RegisterDetails, { path: paths.registerDetails });

      await fill();
      await screen.findByText("This username is available");
      await userEvent.click(createAccount());

      expect(await screen.findByRole("alert")).toHaveTextContent("Username already taken");
    });

    it("sends to the email confirmation when the backend asks for it", async () => {
      verified();
      withBackend();
      record(
        "post",
        "/auth/register",
        json({ writeopiaUser: aUser(), emailConfirmationRequired: true }),
      );
      renderRoute(RegisterDetails, {
        path: paths.registerDetails,
        destinations: [paths.confirmEmail],
      });

      await fill();
      await screen.findByText("This username is available");
      await userEvent.click(createAccount());

      expect(await screen.findByText(/^at \/auth\/confirm-email/)).toBeInTheDocument();
    });
  });
});

describe("ConfirmEmail", () => {
  it("confirms the email it was handed and goes to the login", async () => {
    const bodies = record("post", "/auth/email/confirm", json({ writeopiaUser: aUser() }));
    renderRoute(ConfirmEmail, {
      path: paths.confirmEmail,
      state: { email: "ana@writeopia.io" },
      destinations: [paths.login],
    });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(`at ${paths.login}`)).toBeInTheDocument();
    expect(screen.getByText("Email confirmed successfully!")).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io", code: "654321" }]);
  });

  it("asks for the email when it was opened directly", async () => {
    const bodies = record("post", "/auth/email/resend", json({ success: true }));
    renderRoute(ConfirmEmail, { path: paths.confirmEmail });

    await userEvent.type(screen.getByLabelText("Email"), "ana@writeopia.io");
    await userEvent.click(screen.getByRole("button", { name: "Resend Code" }));

    expect(await screen.findByText("Confirmation code sent!")).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io" }]);
  });

  it("refuses a wrong code", async () => {
    record("post", "/auth/email/confirm", json({ success: false, message: "Invalid code" }, 400));
    renderRoute(ConfirmEmail, { path: paths.confirmEmail, state: { email: "ana@writeopia.io" } });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code");
  });
});

describe("Forgot password", () => {
  it("step 1 asks for the reset code", async () => {
    const bodies = record("post", "/auth/password/forgot", json({ success: true }));
    renderRoute(ForgotPasswordEmail, {
      path: paths.forgotPassword,
      destinations: [paths.forgotPasswordCode],
    });

    await userEvent.type(screen.getByLabelText("Email"), "ana@writeopia.io");
    await userEvent.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(await screen.findByText(`at ${paths.forgotPasswordCode}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io" }]);
  });

  it("step 1 treats a refusal with a 200 as a failure", async () => {
    record("post", "/auth/password/forgot", json({ success: false, message: "Try later" }));
    renderRoute(ForgotPasswordEmail, { path: paths.forgotPassword });

    await userEvent.type(screen.getByLabelText("Email"), "ana@writeopia.io");
    await userEvent.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the reset code");
  });

  it("step 2 checks the code", async () => {
    useForgotPasswordFlow.getState().setEmail("ana@writeopia.io");
    const bodies = record("post", "/auth/password/verify-code", json({ success: true }));
    renderRoute(ForgotPasswordCode, {
      path: paths.forgotPasswordCode,
      destinations: [paths.forgotPasswordNew],
    });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "111222");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(`at ${paths.forgotPasswordNew}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ana@writeopia.io", code: "111222" }]);
  });

  it("step 2 refuses a wrong code", async () => {
    useForgotPasswordFlow.getState().setEmail("ana@writeopia.io");
    record("post", "/auth/password/verify-code", json({ success: false, message: "Invalid code" }));
    renderRoute(ForgotPasswordCode, { path: paths.forgotPasswordCode });

    await userEvent.type(screen.getByLabelText("Enter 6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code");
  });

  it("step 3 goes back to the start of the flow without a verified code", () => {
    renderRoute(ForgotPasswordNew, {
      path: paths.forgotPasswordNew,
      destinations: [paths.forgotPassword],
    });

    expect(screen.getByText(`at ${paths.forgotPassword}`)).toBeInTheDocument();
  });

  it("step 3 saves a strong password typed twice", async () => {
    useForgotPasswordFlow.getState().setEmail("ana@writeopia.io");
    useForgotPasswordFlow.getState().setCode("111222");
    const bodies = record("post", "/auth/password/reset-with-code", json({ success: true }));
    renderRoute(ForgotPasswordNew, { path: paths.forgotPasswordNew, destinations: [paths.login] });
    const save = screen.getByRole("button", { name: "Reset your password" });

    await userEvent.type(screen.getByLabelText("New password"), STRONG_PASSWORD);
    await userEvent.type(screen.getByLabelText("Repeat password"), "something else");
    expect(screen.getByText("The passwords do not match")).toBeInTheDocument();
    expect(save).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Repeat password"));
    await userEvent.type(screen.getByLabelText("Repeat password"), STRONG_PASSWORD);
    await userEvent.click(save);

    expect(await screen.findByText(`at ${paths.login}`)).toBeInTheDocument();
    expect(screen.getByText("Password reset successfully!")).toBeInTheDocument();
    expect(bodies).toEqual([
      { email: "ana@writeopia.io", code: "111222", newPassword: STRONG_PASSWORD },
    ]);
  });
});

describe("ResetPassword", () => {
  async function typeNewPassword() {
    await userEvent.type(screen.getByLabelText("New password"), STRONG_PASSWORD);
    await userEvent.type(screen.getByLabelText("Repeat password"), STRONG_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Reset your password" }));
  }

  it("changes the password of the signed-in user", async () => {
    const bodies = record("put", "/auth/password/reset", text("", 200));
    renderRoute(ResetPassword, { path: paths.resetPassword, destinations: [paths.start] });

    await typeNewPassword();

    expect(await screen.findByText(`at ${paths.start}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ newPassword: STRONG_PASSWORD }]);
  });

  it("says so when it fails", async () => {
    record("put", "/auth/password/reset", text("nope", 400));
    renderRoute(ResetPassword, { path: paths.resetPassword });

    await typeNewPassword();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reset the password"),
    );
  });
});
