import { MenuScreen } from "~/features/menu/components/MenuScreen";

import type { Route } from "./+types/tag";

export default function TagRoute({ params }: Route.ComponentProps) {
  return <MenuScreen key={params.tagId} view={{ kind: "tag", tagId: params.tagId }} />;
}
