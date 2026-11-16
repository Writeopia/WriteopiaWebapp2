import { t } from "~/core/i18n";
import { TopBar } from "~/features/shell/components/TopBar";

/** Where the documents graph will be. */
export default function GraphRoute() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <h1 className="px-1 font-medium">{t("documentsGraph")}</h1>
      </TopBar>
      <p className="flex flex-1 items-center justify-center p-6 text-center text-text-light">
        {t("graphComingSoon")}
      </p>
    </div>
  );
}
