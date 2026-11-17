import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NetworkError } from "~/core/api";
import { queryClient } from "~/core/query/queryClient";

import { OfflineBanner } from "./OfflineBanner";

function Failing({ error }: { error: Error }) {
  useQuery({
    queryKey: ["failing", error.message],
    queryFn: () => Promise.reject(error),
    retry: false,
  });
  return null;
}

function renderBanner(children?: React.ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      {children}
    </QueryClientProvider>,
  );
}

const banner = () => screen.queryByText("The server cannot be reached. Check your connection.");

describe("the offline banner", () => {
  it("follows the browser going offline and online", () => {
    renderBanner();
    expect(banner()).not.toBeInTheDocument();

    act(() => void window.dispatchEvent(new Event("offline")));
    expect(banner()).toBeInTheDocument();

    act(() => void window.dispatchEvent(new Event("online")));
    expect(banner()).not.toBeInTheDocument();
  });

  it("shows when a request cannot reach the server", async () => {
    renderBanner(<Failing error={new NetworkError("Could not reach the server")} />);

    expect(await screen.findByText(/cannot be reached/)).toBeInTheDocument();
  });

  it("stays away for a request that only timed out", async () => {
    renderBanner(<Failing error={new NetworkError("Request timed out", true)} />);

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(banner()).not.toBeInTheDocument();
  });
});
