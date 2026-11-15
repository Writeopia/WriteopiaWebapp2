import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the build is static files (build/client) that a bucket can serve.
  ssr: false,
} satisfies Config;
