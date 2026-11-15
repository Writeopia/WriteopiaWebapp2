import { Outlet } from "react-router";

import { guestOnly } from "~/features/auth/session";

/** The screens for someone who is not signed in. */
export const clientLoader = guestOnly;

export default function AuthLayout() {
  return <Outlet />;
}
