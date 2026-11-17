# 08 — Settings (M7)

A dialog with a section list on the left, opened from the side menu
(`?settings=<section>` so it is linkable and the back button closes it).

Reference: `Writeopia/application/features/account/.../ui/` — `SettingsDialog.kt` (the desktop
and web dialog; the authoritative list of what each section contains), `SettingsAccountScreen.kt`,
`SettingsAppearanceScreen.kt`, `SettingsAiScreen.kt`, `SettingsCloudAiScreen.kt`,
`SettingsWorkspaceScreen.kt`, `SettingsHeaderImagesScreen.kt`, `SettingsTagsScreen.kt`,
`SettingsTeamsScreen.kt`, `WorkspaceUsersScreen.kt`, `UserSearchScreen.kt`, `UserAddScreen.kt`,
`UserEditScreen.kt`, `ExportWorkspaceDialog.kt`; view models in `.../viewmodel/`.

Sections: **Account · Appearance · AI · Workspace · Teams**, with the app version at the bottom.

## Account

| Option                           | Behaviour                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account line                     | "Account: <name> - <tier>" (FREE / PREMIUM)                                                                                                                              |
| Change workspace                 | Goes to `/workspaces`                                                                                                                                                    |
| Reset password                   | Goes to `/auth/reset-password`                                                                                                                                           |
| Logout                           | `POST /auth/logout/web`, "Signing out…" overlay                                                                                                                          |
| **Export** → Export workspace    | Dialog: pick a workspace → `POST /workspace/{ws}/export` → "Export started. A download link will be sent to your email when ready." / failure message                    |
| **Danger zone** → Delete account | Confirmation dialog: warns that notes will be deleted and requires typing the account **email** to enable Confirm → `DELETE /auth/account` → `/account-deletion-started` |

Not on the web: the offline states ("You are offline", "Sign in", "Switch space").

## Appearance

| Option       | Values                      | Stored                                        |
| ------------ | --------------------------- | --------------------------------------------- |
| Color theme  | Light, Dark, System         | `localStorage`, applied as `data-theme`       |
| Accent color | Purple, Blue, Green, Orange | `localStorage`, sets the accent CSS variables |

"Dynamic color" (wallpaper-based) is an Android/desktop feature; on the web it is omitted and a
stored `dynamic` value is treated as purple.

The Kotlin web app stores these under the disconnected-user key
(`UiConfigurationLocalStorageRepository`); here they are simply per-browser.

## AI

| Option         | Behaviour                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Run AI with    | Cloud AI / Local AI. Web: cloud only (see the README decision); show the cloud hint text                             |
| Cloud AI usage | `GET /api/ai/usage`: progress bar, "used / quota" in compact numbers, percentage, loading and "no usage data" states |

If local AI is enabled later: Ollama URL and model tiers come from the public
`GET /api/ai/local-config` (`LocalAiAutoConfigResponse`), models from Ollama's `/api/tags`.

## Workspace

| Option         | Behaviour                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace name | Shown (rename request type exists: `WorkspaceNameChangeRequest` — confirm the endpoint before exposing editing)                                                                                                |
| Header images  | Sub-page: grid of the workspace's header pictures (`GET /api/ai/header-images/{ws}`), delete with confirmation (`DELETE …/{imageId}`), empty / failed / retry states                                           |
| Tags           | Sub-page: the tag catalogue — create ("New tag": name + description), edit, delete with confirmation; name must be unique ("name taken"). Saved with `POST /api/docs/workspace/tag` (delete = `deleted: true`) |

Not on the web: Local folder.

## Teams

| Option     | Behaviour                                                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your teams | The user's workspaces with role                                                                                                                                                                                                        |
| Members    | Paginated list for the current workspace: `GET /workspace/{ws}/users/paginated` — name, username, email, role                                                                                                                          |
| Add user   | Admins only ("Only admins can add users"). Autocomplete by username (`GET /workspace/{ws}/users/search`, debounced, 5 per page) → pick → choose role → `POST /workspace/user`. Errors: already in the workspace (409), not found (404) |
| Edit user  | Change role ADMIN ↔ EDITOR → `PUT /workspace/role`; 409 = cannot demote the last admin                                                                                                                                                 |

## Version

Show the web app version (from `package.json` at build time via `import.meta.env`) and the commit
SHA.

## Tests

- Component: each section with MSW; delete-account confirmation gating; add-user error branches;
  last-admin error; theme and accent persistence; export workspace success/failure.

## Tasks

- [x] Settings dialog shell and routing
- [x] Account section
- [x] Export workspace dialog
- [x] Delete account flow
- [x] Appearance section (theme, accent)
- [x] AI section (provider hint, usage)
- [x] Workspace section: header images sub-page
- [x] Workspace section: tags sub-page
- [x] Teams: workspaces, members list (paginated)
- [x] Teams: add user (search, role), edit role
- [x] Version footer

## What was built

| Module (`app/features/settings/`) | Contents                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sections.ts`                     | `?settings=<section>[/<page>...]`: parse, write, and move inside the dialog (replace)                                                    |
| `api.ts`                          | Export, delete account, header images with ids and their delete, members, user search, add, role                                         |
| `components/SettingsDialog.tsx`   | Section list, the section, the version footer (`VITE_APP_VERSION`, `VITE_COMMIT_SHA`)                                                    |
| `components/*Section.tsx`         | Account (+ export and delete-account dialogs), Appearance, AI, Workspace (+ header images, tags), Teams (+ members, add user, edit role) |

Pages in the address: `workspace/header-images`, `workspace/tags`, `teams/<workspaceId>`,
`teams/<workspaceId>/add`, `teams/<workspaceId>/user/<userId>`.

Differences from the plan above:

- **Workspace name** is shown, not editable. The endpoint exists (`PUT /api/workspace/name`,
  admins only, `{ workspaceId, newName }`) but the Compose app does not expose it either.
- **Teams** follows `SettingsTeamsScreen.kt`: the list of the user's workspaces opens the members
  of any of them, not only the current one. Adding users and changing roles show only where the
  user is an admin; elsewhere "Only admins can add users".
- **Members** load 20 at a time with a "Load more" button instead of loading on scroll.
- **AI**: only "Cloud AI" is offered (README decision 3). The usage is read for every user; a
  FREE user gets the failure with Retry.
- The commit comes from `GITHUB_SHA` in CI, from `git` locally, or reads "dev" (`buildInfo.ts`).
