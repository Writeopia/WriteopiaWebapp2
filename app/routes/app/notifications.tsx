import { BellOff } from "lucide-react";

import { t } from "~/core/i18n";
import { TopBar } from "~/features/shell/components/TopBar";

/**
 * NotificationsScreen.kt: the backend sends no notifications yet, so the screen only says so.
 * It is kept so the place exists when they come.
 */
export default function NotificationsRoute() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <h1 className="px-1 font-medium">{t("notifications")}</h1>
      </TopBar>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-text-light">
        <BellOff size={28} aria-hidden className="text-text-lighter" />
        <p>{t("noNotifications")}</p>
      </div>
    </div>
  );
}
