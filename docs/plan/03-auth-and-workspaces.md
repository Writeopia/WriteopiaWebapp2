# 03 — Auth and workspaces (M1)

Reference: `Writeopia/application/features/auth/` (screens and view models),
`application/core/auth_core/` (`AuthApi.kt`, `WorkspaceApi.kt`,
`jsMain/.../LocalStorageAuthRepository.kt`), `application/web/.../MainWeb.kt` (web navigation),
`backend/core/auth/.../routing/`. Swift equivalents: `LoginView.swift`,
`ForgotPasswordViews.swift`, `EmailConfirmationView.swift`, `ChooseWorkspaceView.swift`.

Endpoints are listed in [02](02-api-and-data.md).

## Routes

| Route                        | Screen                                             | Guard                        |
| ---------------------------- | -------------------------------------------------- | ---------------------------- |
| `/`                          | Start: decides where to go                         | —                            |
| `/auth/login`                | Login                                              | guests only                  |
| `/auth/register`             | Register step 1: email                             | guests only                  |
| `/auth/register/code`        | Step 2: verification code                          | guests only                  |
| `/auth/register/details`     | Step 3: name, username, workspace, password, legal | guests only                  |
| `/auth/confirm-email`        | Confirm email for an unconfirmed account           | —                            |
| `/auth/forgot-password`      | Email                                              | guests only                  |
| `/auth/forgot-password/code` | Code                                               | guests only                  |
| `/auth/forgot-password/new`  | New password                                       | guests only                  |
| `/auth/reset-password`       | Change password while logged in                    | session                      |
| `/workspaces`                | Choose / create workspace                          | session                      |
| `/account-deletion-started`  | Notice shown when the account is being deleted     | —                            |
| `/app/*`                     | The app                                            | session + selected workspace |

Guards are React Router `clientLoader`s: `requireSession` calls `GET /auth/user/current` through
TanStack Query (cached), `requireWorkspace` checks the selected workspace.

## Start logic

1. `GET /auth/user/current` → 200: session valid. 401/403: try `POST /auth/refresh/web` once,
   then repeat. Network error: show an offline/retry screen (do not log the user out).
2. No session → `/auth/login`.
3. Session, no workspace selected (or the saved one is no longer in `GET /workspace/user`) →
   `/workspaces`.
4. Otherwise → `/app`.

The selected workspace id and the cached user are kept in `localStorage`, as the Kotlin web app
does in `LocalStorageAuthRepository`. Nothing sensitive is stored.

## Login

- Fields: email **or** username (`identifier`), password. Links: forgot password, create account.
- `POST /auth/login/web`:
  - 200 and `enabled: true` → go to `/workspaces`.
  - 200 and `enabled: false` → account not confirmed → `/auth/confirm-email` with the email.
  - 401 → "invalid credentials" inline error.
  - 403 → `/account-deletion-started`.

## Register

Three steps, state kept in a small store so a refresh in the middle restarts cleanly.

1. **Email** → `POST /auth/register/email/send`. The response is the same whether or not the
   email exists, so always move on.
2. **Code** → `POST /auth/register/email/verify`. The code is _not_ consumed; keep it for step 3.
   "Resend code" repeats step 1.
3. **Details**: name, username (debounced `GET /auth/username/available`), workspace name,
   password with strength indicator, and a required checkbox for Terms of Service and Privacy
   Policy. Each legal text opens in a dialog from `GET /auth/legal/{terms|privacy}`; send its
   `version` as `acceptedLegalVersion`.
   → `POST /auth/register`. If `emailConfirmationRequired` → confirm-email screen; else log in
   with the same credentials (`/auth/login/web`) so the cookies are set.

Password rules (`PasswordValidator.kt`): minimum 8 characters and at least one special character.
Strength: none / weak (neither) / medium (one) / strong (both).

## Email confirmation

For accounts that logged in with `enabled: false`: 6-digit style code input,
`POST /auth/email/confirm`, "resend" → `POST /auth/email/resend`. After confirming, log in.

## Forgot my password

1. Email → `POST /auth/password/forgot`.
2. Code → `POST /auth/password/verify-code`; resend available.
3. New password + repeat, same strength rules → `POST /auth/password/reset-with-code` → login.

## Reset password (logged in)

New password + repeat → `PUT /auth/password/reset`. Reached from Settings → Account.

## Logout

`POST /auth/logout/web`, clear the TanStack Query cache and the stored workspace, go to login.
Show the "Signing out…" state while it runs.

## Choose workspace

- `GET /workspace/user` → cards with name, role and document count.
- Selecting one stores its id and navigates to `/app`.
- "Create workspace" dialog → `POST /workspace/create {name}` → refetch the list.
- Error state with retry ("Error loading workspaces").
- The web has no "space choice" (private vs open) and no "workspace sync" screen.

## Extract (export) workspace

Lives in Settings → Account (built in M7, specified here because it is a workspace feature).
A dialog lists the user's workspaces; choosing one calls `POST /workspace/{ws}/export`. The
backend prepares the archive asynchronously: show "Export started. A download link will be sent
to your email when ready." Reference: `ExportWorkspaceDialog.kt`.

## Tests

- Unit: password validator, start-logic decision function, refresh single-flight.
- Component (MSW): login outcomes (200/enabled false/401/403), the three register steps,
  username taken, forgot-password flow, workspace list/create/error.
- e2e: register → login → choose workspace (against a dev backend).

## What was built

| Where                            | Contents                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/features/auth/api.ts`       | The account endpoints; `login` answers one of four outcomes instead of throwing                                                                |
| `app/features/auth/session.ts`   | `loadSessionUser`, `setSessionUser`, `clearSession`, `decideStart`, the guards (`requireSession`, `requireWorkspace`, `guestOnly`) and `paths` |
| `app/features/auth/password.ts`  | Password strength and username rules                                                                                                           |
| `app/features/auth/flows.ts`     | In-memory state handed between the steps of sign-up and of a forgotten password                                                                |
| `app/features/auth/components/`  | `AuthCard`, `CodeForm`, `NewPasswordFields`, `PasswordStrength`, `LegalDocumentDialog`                                                         |
| `app/features/workspaces/api.ts` | List and create workspaces; the selected workspace id in `localStorage`                                                                        |
| `app/routes/`                    | `start`, `auth/*`, `workspaces`, `account-deletion-started`, `app/layout` + a placeholder `app/home`                                           |
| `app/core/query/queryClient.ts`  | The shared query cache, read by the loaders                                                                                                    |

Differences from the description above:

- After a successful login the app goes to `/`, and the start logic sends it on: straight to the
  app when this browser already has a workspace selected that still exists, otherwise to the
  choice of a workspace.
- After confirming an email the user is sent to the login, with a toast; the password is not kept
  around to sign in for them.
- Sign-up fetches the Terms at submit time and sends their `version`, as `RegisterViewModel.kt`
  does, and requires a strong password and a username that is not taken.
- A password change (forgotten or signed in) requires a strong password typed twice.
- A session that expires and cannot be renewed clears the cache and goes to the login
  (`onSessionExpired` in `root.tsx`).
- When the backend cannot be reached at the start, the app shows an error with Retry instead of
  the login.

## Tasks

- [x] `features/auth/api.ts`, `features/workspaces/api.ts`
- [x] Session store + `requireSession` / `requireWorkspace` / `guestOnly` loaders
- [x] Start screen logic
- [x] Login screen
- [x] Register: email, code, details (username check, strength indicator, legal dialogs)
- [x] Email confirmation screen
- [x] Forgot password: email, code, new password
- [x] Reset password screen
- [x] Logout
- [x] Account-deletion-started screen
- [x] Choose workspace + create workspace dialog
- [x] Auth layout (logo, theme-aware background)
- [x] Unit and component tests as listed
- [ ] e2e: register → login → choose workspace against a dev backend (needs a running backend)
- [ ] Export workspace (M7, in Settings)
