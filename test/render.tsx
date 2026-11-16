import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { createRoutesStub, useLocation } from "react-router";

import { queryClient } from "~/core/query/queryClient";
import { Toaster } from "~/core/ui";
import { MenuActionsProvider } from "~/features/menu/actions";
import { MenuDialogs } from "~/features/menu/components/MenuDialogs";
import { WorkspaceProvider, type WorkspaceSession } from "~/features/workspaces/WorkspaceContext";

import { aUser, aWorkspace } from "./fixtures";

type RenderRouteOptions = {
  /** The path of the screen under test. */
  path: string;
  /** The pattern of its route, when the path has parameters: "/app/folder/:folderId". */
  route?: string;
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
      {location.search}
      {location.state ? ` ${JSON.stringify(location.state)}` : ""}
    </p>
  );
}

/** Draws a screen inside a router and the providers the app gives it. */
export function renderRoute(
  Component: ComponentType,
  { path, route = path, state, destinations = [] }: RenderRouteOptions,
) {
  const Stub = createRoutesStub([
    { path: route, Component },
    ...destinations.map((destination) => ({ path: destination, Component: Destination })),
  ]);

  return render(
    <QueryClientProvider client={queryClient}>
      <Stub initialEntries={[{ pathname: path, state }]} />
      <Toaster />
    </QueryClientProvider>,
  );
}

/**
 * Draws a screen of the app (everything under /app) with what the app layout gives it: the
 * signed-in user, the workspace, the changes of the menu and its dialogs.
 */
export function renderAppRoute(
  Component: ComponentType,
  options: RenderRouteOptions & { session?: WorkspaceSession },
) {
  const session = options.session ?? { user: aUser({ tier: "PREMIUM" }), workspace: aWorkspace() };

  function Screen() {
    return (
      <WorkspaceProvider value={session}>
        <MenuActionsProvider>
          <Component />
          <MenuDialogs />
        </MenuActionsProvider>
      </WorkspaceProvider>
    );
  }

  return renderRoute(Screen, options);
}
