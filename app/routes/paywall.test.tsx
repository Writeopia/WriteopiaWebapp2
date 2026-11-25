import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { queryClient } from "~/core/query/queryClient";
import { APPS_DOWNLOAD_URL } from "~/features/auth/paywall";
import { paths } from "~/features/auth/session";

import { aUser, aWorkspace } from "../../test/fixtures";
import { apiUrl, aSubscription, signedIn } from "../../test/msw/handlers";
import { server } from "../../test/msw/server";
import Login from "./auth/login";
import Paywall, { clientLoader as paywallLoader } from "./paywall";
import { clientLoader as startLoader } from "./start";

const CHECK_FAILED = "Could not check your subscription. Please try again.";
/** A backend that cannot be reached is asked once more, a second later. */
const RETRIED = { timeout: 4000 };

function Destination() {
  const location = useLocation();
  return <p>at {location.pathname}</p>;
}

/** The login, the start and the paywall as the app wires them; the app and the workspaces end. */
function renderFlow(path: string) {
  const Stub = createRoutesStub([
    { path: paths.login, Component: Login },
    { path: paths.start, loader: startLoader, Component: () => null },
    { path: paths.paywall, loader: paywallLoader, Component: Paywall },
    { path: paths.app, Component: Destination },
    { path: paths.workspaces, Component: Destination },
  ]);

  return render(
    <QueryClientProvider client={queryClient}>
      <Stub initialEntries={[path]} />
    </QueryClientProvider>,
  );
}

function backend({ premium }: { premium: () => boolean }) {
  server.use(...signedIn(aUser()));
  server.use(
    http.get(apiUrl("/auth/subscription"), () => HttpResponse.json(aSubscription(premium()))),
    http.post(apiUrl("/auth/login/web"), () =>
      HttpResponse.json({ writeopiaUser: aUser(), enabled: true }),
    ),
    http.get(apiUrl("/workspace/user"), () => HttpResponse.json([aWorkspace()])),
  );
}

async function signIn() {
  await userEvent.type(screen.getByLabelText("Email or username"), "ana");
  await userEvent.type(screen.getByLabelText("Password"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("after signing in", () => {
  it("a user with a subscription goes on as before", async () => {
    backend({ premium: () => true });
    renderFlow(paths.login);

    await signIn();

    expect(await screen.findByText(`at ${paths.workspaces}`)).toBeInTheDocument();
  });

  it("a user without a subscription gets the paywall", async () => {
    backend({ premium: () => false });
    renderFlow(paths.login);

    await signIn();

    expect(await screen.findByRole("heading", { name: "Subscribe to Writeopia" })).toBeVisible();
    expect(screen.getByText("$4.99 per month")).toBeVisible();
  });
});

describe("Paywall", () => {
  it("sends a user without a session to the login", async () => {
    renderFlow(paths.paywall);

    expect(await screen.findByLabelText("Email or username")).toBeVisible();
  });

  it("lets a user who already subscribed go on", async () => {
    backend({ premium: () => true });
    renderFlow(paths.paywall);

    expect(await screen.findByText(`at ${paths.workspaces}`)).toBeInTheDocument();
  });

  it("recommends the apps, with their download page", async () => {
    backend({ premium: () => false });
    renderFlow(paths.paywall);

    const link = await screen.findByRole("link", { name: "Download the apps" });
    expect(link).toHaveAttribute("href", APPS_DOWNLOAD_URL);
  });

  it("asks again, and goes on once the user subscribed", async () => {
    let premium = false;
    backend({ premium: () => premium });
    renderFlow(paths.paywall);
    const checkAgain = await screen.findByRole("button", { name: "I've subscribed – check again" });

    await userEvent.click(checkAgain);
    expect(
      await screen.findByText("We couldn't find a subscription for this account yet."),
    ).toBeVisible();

    premium = true;
    await userEvent.click(checkAgain);
    expect(await screen.findByText(`at ${paths.workspaces}`)).toBeInTheDocument();
  });

  it("shows an error and a retry when the check fails, and keeps the user out", async () => {
    backend({ premium: () => false });
    renderFlow(paths.paywall);
    const checkAgain = await screen.findByRole("button", { name: "I've subscribed – check again" });
    server.use(http.get(apiUrl("/auth/subscription"), () => HttpResponse.error()));

    await userEvent.click(checkAgain);

    expect(await screen.findByText(CHECK_FAILED, {}, RETRIED)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
  });

  it("hides the price when the backend cannot be reached", async () => {
    server.use(...signedIn(aUser()));
    server.use(http.get(apiUrl("/auth/subscription"), () => HttpResponse.error()));
    renderFlow(paths.paywall);

    expect(await screen.findByText(CHECK_FAILED, {}, RETRIED)).toBeVisible();
    expect(screen.queryByText(/per month/)).not.toBeInTheDocument();
  });

  it("signs out to the login", async () => {
    backend({ premium: () => false });
    server.use(http.post(apiUrl("/auth/logout/web"), () => new HttpResponse("Logged out")));
    renderFlow(paths.paywall);

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Email or username")).toBeVisible();
  });
});
