import { QueryClient } from "@tanstack/react-query";

import { ApiError, ApiParseError } from "~/core/api";

/**
 * The one cache of what the backend said. It lives outside React because the route loaders,
 * which run before any component, read the session from it.
 *
 * The backend is the source of truth: lists are refetched when the user comes back to the tab.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // An answer from the backend is final; only a failure to reach it is worth another try.
      retry: (failures, error) =>
        !(error instanceof ApiError) && !(error instanceof ApiParseError) && failures < 1,
    },
  },
});
