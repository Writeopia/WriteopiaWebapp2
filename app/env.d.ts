/// <reference types="vite/client" />

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- merges with Vite's own
interface ImportMetaEnv {
  /** The version in package.json; see buildInfo.ts. */
  readonly VITE_APP_VERSION: string;
  /** The short SHA of the commit the app is built from, or "dev". */
  readonly VITE_COMMIT_SHA: string;
  /** The Web OAuth client of Google sign-in; without it the Google button is not shown. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
}
