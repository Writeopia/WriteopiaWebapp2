import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "~/core/api";

import { apiUrl, aSubscription } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { getSubscription } from "./api";
import { formatMonthlyPrice } from "./paywall";

describe("getSubscription", () => {
  it("asks the backend whether the user has a subscription", async () => {
    server.use(
      http.get(apiUrl("/auth/subscription"), () => HttpResponse.json(aSubscription(false))),
    );

    expect(await getSubscription()).toEqual({
      premium: false,
      tier: "FREE",
      monthlyPriceCents: 499,
      currency: "USD",
    });
  });

  it("answers a subscription", async () => {
    server.use(
      http.get(apiUrl("/auth/subscription"), () => HttpResponse.json(aSubscription(true))),
    );

    expect((await getSubscription()).premium).toBe(true);
  });

  it("reads an answer without a price", async () => {
    server.use(
      http.get(apiUrl("/auth/subscription"), () =>
        HttpResponse.json({ premium: false, tier: "FREE" }),
      ),
    );

    const subscription = await getSubscription();
    expect(subscription.premium).toBe(false);
    expect(formatMonthlyPrice(subscription)).toBeNull();
  });

  it("fails without a session", async () => {
    await expect(getSubscription()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("formatMonthlyPrice", () => {
  it("writes the price in the currency, from cents", () => {
    expect(formatMonthlyPrice({ monthlyPriceCents: 499, currency: "USD" }, "en-US")).toBe("$4.99");
    expect(formatMonthlyPrice({ monthlyPriceCents: 1000, currency: "EUR" }, "de-DE")).toBe(
      "10,00 €",
    );
  });

  it("has no price while there is no answer, or an incomplete one", () => {
    expect(formatMonthlyPrice(undefined)).toBeNull();
    expect(formatMonthlyPrice({ monthlyPriceCents: null, currency: "USD" })).toBeNull();
    expect(formatMonthlyPrice({ monthlyPriceCents: 499, currency: null })).toBeNull();
  });

  it("has no price for a currency it does not know", () => {
    expect(formatMonthlyPrice({ monthlyPriceCents: 499, currency: "not a code" })).toBeNull();
  });
});
