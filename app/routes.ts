import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/start.tsx"),

  layout("routes/auth/layout.tsx", [
    route("auth/login", "routes/auth/login.tsx"),
    route("auth/register", "routes/auth/register.tsx"),
    route("auth/register/code", "routes/auth/register-code.tsx"),
    route("auth/register/details", "routes/auth/register-details.tsx"),
    route("auth/confirm-email", "routes/auth/confirm-email.tsx"),
    route("auth/forgot-password", "routes/auth/forgot-password.tsx"),
    route("auth/forgot-password/code", "routes/auth/forgot-password-code.tsx"),
    route("auth/forgot-password/new", "routes/auth/forgot-password-new.tsx"),
  ]),

  route("auth/reset-password", "routes/auth/reset-password.tsx"),
  route("workspaces", "routes/workspaces.tsx"),
  route("account-deletion-started", "routes/account-deletion-started.tsx"),
  route("site/:documentId", "routes/site.tsx"),

  route("app", "routes/app/layout.tsx", [
    index("routes/app/index.tsx"),
    route("folder/:folderId", "routes/app/folder.tsx"),
    route("favorites", "routes/app/favorites.tsx"),
    route("tag/:tagId", "routes/app/tag.tsx"),
    route("document/:documentId", "routes/app/document.tsx"),
    route("graph", "routes/app/graph.tsx"),
    route("notifications", "routes/app/notifications.tsx"),
  ]),
] satisfies RouteConfig;
