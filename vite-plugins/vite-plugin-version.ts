import { execSync } from "child_process";
import type { Plugin } from "vite";

/** Erzeugt dist/version.json und stellt Build-Infos als import.meta.env.VITE_APP_* bereit. */
function resolveCommit(): string {
  const env = process.env.APP_COMMIT || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

export function versionPlugin(): Plugin {
  const builtAt = new Date().toISOString();
  const commit = resolveCommit();
  const d = builtAt.slice(0, 10).replace(/-/g, ".");
  const version = `v${d}`;
  return {
    name: "aicono-version",
    config() {
      return {
        define: {
          "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
          "import.meta.env.VITE_APP_COMMIT": JSON.stringify(commit),
          "import.meta.env.VITE_APP_BUILT_AT": JSON.stringify(builtAt),
        },
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version, commit, builtAt }),
      });
    },
  };
}
