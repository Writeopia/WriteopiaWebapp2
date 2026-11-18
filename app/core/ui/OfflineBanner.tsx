import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { NetworkError } from "~/core/api";
import { t } from "~/core/i18n";

/**
 * Says so when the backend cannot be reached: the browser is offline, or a request failed
 * without an answer (not a timeout). It goes away when the browser is back online or the next
 * request is answered.
 */
export function OfflineBanner() {
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        (event.action.type !== "error" && event.action.type !== "success")
      ) {
        return;
      }
      if (event.action.type === "success") setOffline(false);
      else if (event.action.error instanceof NetworkError && !event.action.error.timedOut) {
        setOffline(true);
      }
    });

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      unsubscribe();
    };
  }, [queryClient]);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-error px-4 py-1.5 text-sm text-global-bg"
    >
      <WifiOff size={14} aria-hidden />
      {t("offlineBanner")}
    </div>
  );
}
