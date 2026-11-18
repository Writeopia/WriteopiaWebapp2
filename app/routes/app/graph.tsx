import { t } from "~/core/i18n";
import { DocumentsGraph } from "~/features/graph/components/DocumentsGraph";
import { TopBar } from "~/features/shell/components/TopBar";

/** The documents graph of the workspace. */
export default function GraphRoute() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <h1 className="px-1 font-medium">{t("documentsGraph")}</h1>
      </TopBar>
      <DocumentsGraph />
    </div>
  );
}
