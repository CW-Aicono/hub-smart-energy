/** Erlaubte Adressen für Links in Auth-Mails – niemals Vorschau-Hosts. */
export const ALLOWED_APP_ORIGINS = ["https://staging.aicono.org", "https://ems-pro.aicono.org"];
export const ALLOWED_AUTH_PATHS = ["/set-password", "/mein-sharing/set-password"];
/** App-Startseiten, auf die Bestätigungs-/Magic-Links zeigen dürfen. */
export const ALLOWED_APP_PATHS = ["/", "/ev", "/te", "/mein-sharing"];

function isAllowedOrigin(o: string | null | undefined): o is string {
  return !!o && ALLOWED_APP_ORIGINS.includes(o.replace(/\/$/, ""));
}

function pickBase(originHeader: string | null | undefined, envOrigin: string | null | undefined): string {
  return isAllowedOrigin(envOrigin)
    ? envOrigin!.replace(/\/$/, "")
    : isAllowedOrigin(originHeader)
      ? originHeader!
      : "https://ems-pro.aicono.org";
}

/** Liefert eine sichere Redirect-URL für Passwort-Mails. */
export function safeAuthRedirect(
  requested: string | null | undefined,
  originHeader: string | null | undefined,
  envOrigin: string | null | undefined,
): string {
  let path = "/set-password";
  let next = "";
  if (requested) {
    try {
      const u = new URL(requested);
      if (ALLOWED_AUTH_PATHS.includes(u.pathname)) path = u.pathname;
      // Herkunfts-App merken, damit der Nutzer nach dem Passwort-Setzen dorthin zurückkehrt
      const requestedNext = u.searchParams.get("next");
      if (requestedNext && ALLOWED_APP_PATHS.includes(requestedNext) && requestedNext !== "/") {
        next = `?next=${encodeURIComponent(requestedNext)}`;
      }
      if (isAllowedOrigin(u.origin)) return `${u.origin}${path}${next}`;
    } catch { /* ignore */ }
  }
  return `${pickBase(originHeader, envOrigin)}${path}${next}`;
}

/** Liefert eine sichere Redirect-URL für Bestätigungs- und Magic-Links (kehrt zur anfragenden App zurück). */
export function safeAppRedirect(
  requested: string | null | undefined,
  originHeader: string | null | undefined,
  envOrigin: string | null | undefined,
): string {
  let path = "/";
  if (requested) {
    try {
      const u = new URL(requested);
      if (ALLOWED_APP_PATHS.includes(u.pathname)) path = u.pathname;
      if (isAllowedOrigin(u.origin)) return `${u.origin}${path}`;
    } catch { /* ignore */ }
  }
  return `${pickBase(originHeader, envOrigin)}${path}`;
}
