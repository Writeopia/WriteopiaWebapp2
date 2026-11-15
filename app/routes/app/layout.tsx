import { Outlet } from "react-router";

import { requireWorkspace } from "~/features/auth/session";

import type { Route } from "./+types/layout";

/** Everything under /app needs a session and a workspace to work in. */
export const clientLoader = requireWorkspace;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return <Outlet context={loaderData} />;
}
