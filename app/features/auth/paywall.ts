import type { Subscription } from "./api";

/**
 * The download page of the native apps, on the landing page (WriteopiaLandingPage, route
 * /download). Their offline space is free and needs no account.
 */
export const APPS_DOWNLOAD_URL = "https://writeopia.io/download";

/**
 * The monthly price of the subscription, like "$4.99"; null when the backend did not say.
 * Without a locale it is written the way the browser writes money.
 */
export function formatMonthlyPrice(
  subscription: Pick<Subscription, "monthlyPriceCents" | "currency"> | undefined,
  locale?: string,
): string | null {
  const cents = subscription?.monthlyPriceCents;
  const currency = subscription?.currency;
  if (cents === null || cents === undefined || !currency) return null;

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    // An unknown currency code: better no price than a wrong one.
    return null;
  }
}
