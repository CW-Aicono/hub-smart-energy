export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";
export const APP_COMMIT = import.meta.env.VITE_APP_COMMIT ?? "dev";
export const APP_BUILT_AT = import.meta.env.VITE_APP_BUILT_AT ?? "";

function formatBuildDate(): string {
  return APP_BUILT_AT
    ? new Date(APP_BUILT_AT).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
}

/** Sichtbare Version, z. B. "v1.1.0" (Major.Minor.Patch). */
export function formatAppVersion(): string {
  return APP_VERSION === "dev" ? "dev" : `v${APP_VERSION}`;
}

/** Technische Details für Tooltip/Support (inkl. Build-Kennung im Hintergrund). */
export function formatAppVersionDetails(): string {
  return [formatAppVersion(), `Build ${APP_COMMIT}`, formatBuildDate()].filter(Boolean).join(" · ");
}

/** Versionsprüfung nur im echten Produktions-Build außerhalb der Lovable-Vorschau. */
export function isVersionCheckEnabled(): boolean {
  if (!import.meta.env.PROD || APP_COMMIT === "dev") return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const h = window.location.hostname;
  return !(h.startsWith("id-preview--") || h.startsWith("preview--") || h.endsWith("lovableproject.com"));
}
