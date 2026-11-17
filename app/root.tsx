import "./app.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from "react-router";

import { ApiError, NetworkError, onSessionExpired } from "~/core/api";
import { t } from "~/core/i18n";
import { queryClient } from "~/core/query/queryClient";
import { themeInitScript } from "~/core/theme/theme";
import { useSystemThemeSync } from "~/core/theme/useTheme";
import { Button, OfflineBanner, Spinner, Toaster } from "~/core/ui";
import { clearSession, paths } from "~/features/auth/session";

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
  const navigate = useNavigate();
  useSystemThemeSync();

  // A session that expired and could not be renewed: back to the login.
  useEffect(
    () =>
      onSessionExpired(() => {
        clearSession();
        void navigate(paths.login, { replace: true });
      }),
    [navigate],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
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
  // The backend did not answer, or answered that it is in trouble: worth trying again.
  const unreachable =
    error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);

  if (!notFound) console.error(error);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold">{t("errorTitle")}</h1>
      <p className="text-text-light">
        {notFound ? t("errorNotFound") : unreachable ? t("errorServer") : t("errorUnexpected")}
      </p>
      {!notFound && <Button onClick={() => window.location.reload()}>{t("retry")}</Button>}
    </main>
  );
}
