export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";
export const APP_COMMIT = import.meta.env.VITE_APP_COMMIT ?? "dev";
export const APP_BUILT_AT = import.meta.env.VITE_APP_BUILT_AT ?? "";

export function formatAppVersion(): string {
  const date = APP_BUILT_AT
    ? new Date(APP_BUILT_AT).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
  return [APP_VERSION, APP_COMMIT, date].filter(Boolean).join(" · ");
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
