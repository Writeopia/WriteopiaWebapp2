import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";

import { findSessionQuietly, guestOnly, hasSessionHint, paths } from "~/features/auth/session";

/** The screens for someone who is not signed in. */
export const clientLoader = guestOnly;

export default function AuthLayout() {
  const navigate = useNavigate();

  // Without a hint the screen opened before the backend was asked: someone who is signed in
  // after all goes to the app. With one, the loader already asked.
  useEffect(() => {
    if (hasSessionHint()) return;

    let open = true;
    findSessionQuietly()
      .then((user) => {
        if (user && open) void navigate(paths.start, { replace: true });
      })
      // The screen is usable as it is; its own request will say when the backend is down.
      .catch(() => undefined);

    return () => {
      open = false;
    };
  }, [navigate]);

  return <Outlet />;
}
