import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "WRITEOPIA_");

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      alias: { "~": new URL("./app", import.meta.url).pathname },
    },
    server: {
      // The session cookies are scoped to Path=/api and SameSite=Strict, so the API has to
      // look same-origin to the browser.
      proxy: {
        "/api": {
          target: env.WRITEOPIA_API ?? "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
