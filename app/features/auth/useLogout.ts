import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { logout } from "./api";
import { clearSession, paths } from "./session";

/** Signs out. The local session is dropped even when the backend cannot be told. */
export function useLogout() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => logout().catch(() => undefined),
    onSettled: () => {
      clearSession();
      void navigate(paths.login, { replace: true });
    },
  });
}
