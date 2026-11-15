# Progress log

Newest entry first. One entry per working session: what was done, what was decided, what is
next. Tick the matching checkboxes in `docs/plan/*.md` in the same change.

Entry template:

```
## YYYY-MM-DD — <milestone> — <short title>
**Done**
- …
**Decisions**
- …
**Verified** (commands run and their result)
- …
**Next**
- …
```

---

## 2026-11-15 — M0 — Foundation

**Done**

- Scaffolded the app: React 19, React Router 7.18 in SPA mode (`ssr: false`), Vite 8,
  TypeScript 6 (strict), Tailwind 4, TanStack Query, Zustand, Zod, pnpm 12.
- Theme: design tokens ported from the Compose app as CSS variables, light / dark / system and
  the four accent colors, remembered in `localStorage` and applied before first paint
  (`app/core/theme`).
- i18n layer with the first strings (`app/core/i18n`).
- Shared components: Button, TextField, Dialog, Menu, Spinner, Toast (`app/core/ui`).
- Placeholder home route that exercises the theme and the components.
- ESLint (type-checked, react-hooks, jsx-a11y, import sorting, named exports only) and Prettier.
- Vitest + Testing Library + MSW; 23 tests for the theme, i18n, components and the mocked backend.
- Dev proxy for `/api` (`WRITEOPIA_API`, see `.env.example`).
- GitHub Actions: `build-and-test.yml` (pull requests) and `main-merge.yml` (build and deploy).
- `README.md` with local instructions.

**Decisions**

- TypeScript 6 and ESLint 9, not the newest majors: `@react-router/dev` and `typescript-eslint`
  do not accept TypeScript 7 yet, and `eslint-plugin-jsx-a11y` does not accept ESLint 10.
- React Router stays on v7 as planned, although v8 exists.
- The deploy reads the bucket from the repository variable `GCS_BUCKET` and the load balancer
  from `CDN_URL_MAP`; with no bucket set the job only checks and builds. The bucket itself is
  still an open decision.
- MSW 3 renamed the unhandled-request option to `onUnhandledFrame`.
- Playwright is not installed yet; it comes with the first e2e journey in M1.

**Verified**

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (23 passed) and `pnpm build`
  (static `build/client/index.html`) all pass locally.
- In Chrome against `pnpm dev`: the page renders, theme and accent switch and survive a reload,
  toast and dialog work, no console errors. The dev proxy forwards `/api` (502 with no backend
  running).
- Not verified: the workflows have never run on GitHub, and nothing was deployed.

**Next**

- Infrastructure for the deploy (bucket, workload identity for this repository, SPA fallback).
- M1 — Auth and workspaces (`docs/plan/02-api-and-data.md`, `03-auth-and-workspaces.md`).

---

## 2026-11-15 — Planning — Implementation plan written

**Done**

- Surveyed the Writeopia repository: client API calls, wire models, backend routes, the Compose
  web entry point, theme, settings, document menu, editor view model, CI workflows.
- Wrote the plan in `docs/plan/` (README + 9 feature documents).

**Decisions**

- None final yet. Four are open in `docs/plan/README.md` → "Decisions to confirm": bucket and
  domain, editor engine, local AI on the web, languages.

**Verified**

- Nothing built yet; no code in the repository.
- Items inferred rather than read end to end are listed in `docs/plan/02-api-and-data.md` →
  "To verify while implementing".

**Next**

- Confirm the open decisions.
- M0 — Foundation (`docs/plan/01-foundation.md`).
