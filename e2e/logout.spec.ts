import { expect, test } from "@playwright/test";

import { FakeBackend, titleStep } from "./backend";

test("signing out from the settings opens the login", async ({ page }) => {
  const backend = new FakeBackend("doc-1", [titleStep("Groceries")]);
  await backend.install(page);

  // Like the real backend: once signed out every call answers 401 and nothing renews.
  let signedIn = true;
  let sessionChecks = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/logout/web") {
        signedIn = false;
        return route.fulfill({ status: 200, body: "Logged out successfully" });
      }
      if (signedIn) return route.fallback();
      if (path === "/api/auth/user/current") sessionChecks++;
      return route.fulfill({ status: 401, body: "Unauthorized" });
    },
  );

  await page.goto("/app");
  // The dev server prepares its modules on the first visit.
  await page.getByRole("button", { name: "Settings" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Logout" }).click();

  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByLabel("Password")).toBeVisible();
  // The login asks once who is signed in (twice under StrictMode), not in a loop.
  expect(sessionChecks).toBeLessThanOrEqual(2);
});
