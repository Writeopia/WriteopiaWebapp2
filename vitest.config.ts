import { defineConfig } from "vitest/config";

import { buildInfoDefines } from "./buildInfo";

// Separate from vite.config.ts: the React Router plugin is for the app build, not for tests.
export default defineConfig({
  define: buildInfoDefines(),
  resolve: {
    alias: { "~": new URL("./app", import.meta.url).pathname },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
    setupFiles: ["./test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
