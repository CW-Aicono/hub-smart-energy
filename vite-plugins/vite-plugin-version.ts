import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Plugin } from "vite";

/**
 * Erzeugt dist/version.json und stellt Build-Infos als import.meta.env.VITE_APP_* bereit.
 * Sichtbare Version = semantische Version (MAJOR.MINOR.PATCH) aus package.json.
 * Commit-Hash bleibt technisch im Hintergrund (Update-Erkennung, Support-Kopie).
 */
function resolveCommit(): string {
  const env = process.env.APP_COMMIT || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

function resolveVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function versionPlugin(): Plugin {
  const builtAt = new Date().toISOString();
  const commit = resolveCommit();
  const version = resolveVersion();
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
