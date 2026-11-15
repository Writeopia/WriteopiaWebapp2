import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { createRoutesStub, useLocation } from "react-router";

import { queryClient } from "~/core/query/queryClient";
import { Toaster } from "~/core/ui";

type RenderRouteOptions = {
  /** The path of the screen under test. */
  path: string;
  /** What the router hands the screen as location.state. */
  state?: unknown;
  /** The paths the screen may navigate to; each one draws "at <path>". */
  destinations?: string[];
};

/** Where the screen under test navigated to, with the state it sent along. */
function Destination() {
  const location = useLocation();
  return (
    <p>
      at {location.pathname}
      {location.state ? ` ${JSON.stringify(location.state)}` : ""}
    </p>
  );
}

/** Draws a screen inside a router and the providers the app gives it. */
export function renderRoute(
  Component: ComponentType,
  { path, state, destinations = [] }: RenderRouteOptions,
) {
  const Stub = createRoutesStub([
    { path, Component },
    ...destinations.map((destination) => ({ path: destination, Component: Destination })),
  ]);

  return render(
    <QueryClientProvider client={queryClient}>
      <Stub initialEntries={[{ pathname: path, state }]} />
      <Toaster />
    </QueryClientProvider>,
  );
}
