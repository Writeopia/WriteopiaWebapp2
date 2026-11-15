# 01 — Foundation (M0)

Goal: an empty but production-shaped app. Everything after this only adds features.

## Scaffold

```bash
pnpm create react-router@latest .        # framework mode
pnpm add @tanstack/react-query zustand zod
pnpm add -D tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jsdom msw eslint typescript-eslint eslint-plugin-react-hooks \
  eslint-plugin-jsx-a11y prettier prettier-plugin-tailwindcss @playwright/test
```

- `react-router.config.ts`: `ssr: false` so `pnpm build` emits a static SPA in `build/client/`
  with an `index.html` that handles every route client-side.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, path alias `~/*` → `app/*`.
- Pin Node in `.nvmrc` and `packageManager` in `package.json` so CI and local match.

## Scripts

| Script                              | Does                                               |
| ----------------------------------- | -------------------------------------------------- |
| `pnpm dev`                          | Vite dev server with `/api` proxied to the backend |
| `pnpm build`                        | Production SPA build                               |
| `pnpm typecheck`                    | `react-router typegen && tsc --noEmit`             |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                             |
| `pnpm format` / `pnpm format:check` | Prettier                                           |
| `pnpm test` / `pnpm test:watch`     | Vitest                                             |
| `pnpm e2e`                          | Playwright (added in M1, expanded in M9)           |

## Environment and the dev proxy

The app always calls relative `/api/...` URLs. Session cookies are `Path=/api; SameSite=Strict;
HttpOnly`, so the API must look same-origin to the browser.

```ts
// vite.config.ts
server: { proxy: { "/api": { target: process.env.WRITEOPIA_API ?? "http://localhost:8080", changeOrigin: true } } }
```

`WRITEOPIA_API` points at a local backend (see `Writeopia/docker`, `CreateTableLocally.sh`) or at
a deployed one. With a local backend in debug mode the cookies are not `Secure`, so `http://`
works.

## Theme tokens

Port `Writeopia/application/core/theme` to CSS variables consumed by Tailwind v4 `@theme`.

| Token                      | Light         | Dark          |
| -------------------------- | ------------- | ------------- |
| `--color-global-bg`        | `#F8F0F9`     | `#252525`     |
| `--color-light-bg`         | `#F1F1F1`     | `#222222`     |
| `--color-on-bg`            | `#363636`     | `#FFFFFF`     |
| `--color-text-light`       | `#444444`     | `#DFDFDF`     |
| `--color-text-lighter`     | `#666666`     | `#AAAAAA`     |
| `--color-highlight`        | `#E0E0E0`     | `#616161`     |
| `--color-card-border`      | `#D9D2DA`     | `#3A3A3A`     |
| `--color-divider`          | `#DFDFDF`     | `#333333`     |
| `--color-link`             | `#0000FF`     | `#42A5F5`     |
| `--color-options-selector` | `#00000022`   | `#FFFFFF22`   |
| `--color-selected-bg`      | accent at 15% | accent at 15% |

Accent colours (`AccentColor.kt`), light / dark: purple `#B7409A` / `#E987D0` (default),
blue `#2196F3` / `#64B5F6`, green `#4CAF50` / `#81C784`, orange `#FF9800` / `#FFB74D`.
`DYNAMIC` (wallpaper colours) has no web equivalent — map it to purple.

Radii: 4 / 6 / 12 px. Base text 16 px. Font: Roboto, plus the editor font choices
System / Serif / Monospace / Cursive.

Theme is applied with `data-theme="light|dark"` on `<html>`; `system` follows
`prefers-color-scheme`. An inline script in `root.tsx` sets it before first paint to avoid a
flash.

## Lint and format

- ESLint flat config: `typescript-eslint` (type-checked), `react-hooks`, `jsx-a11y`, import
  ordering; ban default exports outside `routes/`.
- Prettier with the Tailwind plugin for class sorting.
- No pre-commit hook initially; CI is the gate.

## Tests

- **Unit** (Vitest): pure logic — `Rank`, span maths, editor reducer, command parsing, colour
  conversion. These are ported with their Kotlin tests as the spec (e.g. `Writeopia/writeopia`
  `commonTest`, `Writeopia/writeopia_models` tests).
- **Component** (Testing Library + MSW): screens against mocked endpoints.
- **e2e** (Playwright): a handful of journeys against a real or dockerised backend — sign in,
  create a document, type, reload, text is still there.

## GitHub Actions

Mirrors `Writeopia/.github/workflows/build-and-test.yml` (PR) and the `web_build_and_publish` job
of `main-merge.yml` (deploy).

`.github/workflows/build-and-test.yml` — on `pull_request` to `main`:

```yaml
concurrency: { group: ${{ github.ref }}, cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

`.github/workflows/main-merge.yml` — on `push` to `main`:

```yaml
jobs:
  web_build_and_publish:
    name: Web - Build and Publish
    runs-on: ubuntu-latest
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm test
      - run: pnpm build
      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: "projects/640912732949/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider"
          service_account: "github-actions-deployer@writeopia.iam.gserviceaccount.com"
      - uses: google-github-actions/setup-gcloud@v3
      - name: Deploy to Cloud Storage
        run: |
          gsutil -m -h "Cache-Control:public,max-age=31536000,immutable" rsync -r build/client/assets gs://$BUCKET/assets
          gsutil -m rsync -r -d -x '^assets/' build/client gs://$BUCKET
          gsutil setmeta -h "Cache-Control:no-cache" gs://$BUCKET/index.html
      - name: Invalidate Cloud CDN cache
        run: gcloud compute url-maps invalidate-cdn-cache http-lb-writeopia2 --path "/index.html" --async
```

Differences from the Compose job, and why:

- No JDK/Gradle; Node + pnpm instead.
- Vite content-hashes everything in `assets/`, so those are cached forever and only
  `index.html` needs `no-cache` and invalidation (the Compose job invalidates `/*` because
  `writeopia.js` is not hashed).
- Hashed assets are uploaded before `index.html` so a user never gets an HTML file pointing at
  files that are not there yet.

### Infrastructure to arrange (outside this repo)

- **Workload identity**: the provider above is tied to the `Writeopia` repository. The new
  repository must be allowed to impersonate `github-actions-deployer` (attribute condition /
  IAM binding).
- **Bucket**: decide the name (see the decision in the README) and set `BUCKET` as a repo
  variable.
- **SPA fallback**: deep links such as `/app/document/123` and `/site/abc` must return
  `index.html`. Either set the bucket's website `NotFoundPage` to `index.html` or add a URL-map
  rewrite. Check how the current bucket handles `/site/{id}` and copy it.
- **`/api` routing**: the load balancer must keep sending `/api/*` to the backend on the same
  host as the bucket, otherwise the cookies are not sent.

## Tasks

- [x] Scaffold React Router v7 (SPA mode) + TypeScript strict + path alias
- [x] Tailwind v4 with the theme tokens, light/dark/system, accent switch
- [x] ESLint + Prettier configs, scripts
- [x] Vitest + Testing Library + MSW setup, one sample test
- [x] Vite dev proxy and `.env.example`
- [x] `core/ui` starter set: Button, TextField, Dialog, Menu, Spinner, Toast
- [x] i18n layer with the first strings
- [x] PR workflow
- [x] Deploy workflow (skips the deploy until the `GCS_BUCKET` repository variable is set)
- [ ] Infrastructure items above (bucket, workload identity, SPA fallback, `/api` routing)
- [x] `README.md` with local dev instructions
