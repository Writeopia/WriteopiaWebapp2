import { SitePage } from "~/features/site/components/SitePage";

import type { Route } from "./+types/site";

/** A published document, public: no session and no shell. */
export default function SiteRoute({ params }: Route.ComponentProps) {
  return <SitePage documentId={params.documentId} />;
}
