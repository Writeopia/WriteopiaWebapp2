# Writeopia Webapp

The web client of [Writeopia](https://github.com/leandroBorgesFerreira/Writeopia): React,
TypeScript, React Router v7 (SPA mode), Tailwind CSS and Vite. It is online-first and talks to
the Writeopia backend.

- Plan: [docs/plan/README.md](docs/plan/README.md)
- Progress log: [docs/PROGRESS.md](docs/PROGRESS.md)

## Requirements

- Node 24 (see `.nvmrc`; 22 or newer works)
- pnpm 12 — `npm install -g pnpm`, or prefix the commands below with `npx`

## Running locally

```bash
pnpm install
cp .env.example .env    # point WRITEOPIA_API at a backend
pnpm dev                # http://localhost:5173
```

The app calls relative `/api/...` URLs and the dev server proxies them to `WRITEOPIA_API`. The
session is kept in HttpOnly cookies scoped to `/api`, so the API must be reached through the
same origin as the page; do not call the backend host directly from the browser.

## Scripts

| Script                              | Does                                      |
| ----------------------------------- | ----------------------------------------- |
| `pnpm dev`                          | Dev server with the `/api` proxy          |
| `pnpm build`                        | Static production build in `build/client` |
| `pnpm preview`                      | Serves the production build               |
| `pnpm typecheck`                    | Route type generation and `tsc`           |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                    |
| `pnpm format` / `pnpm format:check` | Prettier                                  |
| `pnpm test` / `pnpm test:watch`     | Vitest (jsdom, Testing Library, MSW)      |

## Structure

```
app/
  root.tsx        HTML shell, providers, error boundary
  routes.ts       route table
  routes/         route modules
  core/
    theme/        color theme and accent color
    i18n/         strings
    ui/           shared components
test/
  setup.ts        test environment
  msw/            mocked backend for tests
```

Features are added under `app/features/<name>/` as described in the plan.

## Deploy

Merging to `main` runs `.github/workflows/main-merge.yml`: it checks and builds the app and, when
the repository variable `GCS_BUCKET` is set, syncs `build/client` to that Google Cloud Storage
bucket. See [docs/plan/01-foundation.md](docs/plan/01-foundation.md) for the infrastructure the
deploy needs.
