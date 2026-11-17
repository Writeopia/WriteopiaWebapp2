import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * The version of the app and the commit it is built from, handed to the code as
 * import.meta.env.VITE_APP_VERSION and import.meta.env.VITE_COMMIT_SHA (see app/env.d.ts).
 * CI gives the commit in GITHUB_SHA; a local build asks git; without either it is "dev".
 */
export function buildInfoDefines(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  };

  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commitSha()),
  };
}

function commitSha(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);

  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}
