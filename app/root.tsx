import "./app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { t } from "~/core/i18n";
import { themeInitScript } from "~/core/theme/theme";
import { useSystemThemeSync } from "~/core/theme/useTheme";
import { Spinner, Toaster } from "~/core/ui";

import type { Route } from "./+types/root";

export const meta: Route.MetaFunction = () => [
  { title: t("appName") },
  { name: "description", content: t("tagline") },
];

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/icon.png" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme and data-accent before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // The backend is the source of truth: lists are refetched when the user comes back to the tab.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  useSystemThemeSync();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}

/** What index.html shows while the app's JavaScript loads. */
export function HydrateFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={32} className="text-accent" />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  if (!notFound) console.error(error);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold">{t("errorTitle")}</h1>
      <p className="text-text-light">{notFound ? t("errorNotFound") : t("errorUnexpected")}</p>
    </main>
  );
}
