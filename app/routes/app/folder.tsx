import { MenuScreen } from "~/features/menu/components/MenuScreen";

import type { Route } from "./+types/folder";

export default function FolderRoute({ params }: Route.ComponentProps) {
  return <MenuScreen key={params.folderId} view={{ kind: "folder", folderId: params.folderId }} />;
}
