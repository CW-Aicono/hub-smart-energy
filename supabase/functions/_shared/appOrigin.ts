/** Erlaubte Adressen für Links in Auth-Mails – niemals Vorschau-Hosts. */
export const ALLOWED_APP_ORIGINS = ["https://staging.aicono.org", "https://ems-pro.aicono.org"];
export const ALLOWED_AUTH_PATHS = ["/set-password", "/mein-sharing/set-password"];

function isAllowedOrigin(o: string | null | undefined): o is string {
  return !!o && ALLOWED_APP_ORIGINS.includes(o.replace(/\/$/, ""));
}

/** Liefert eine sichere Redirect-URL für Passwort-Mails. */
export function safeAuthRedirect(
  requested: string | null | undefined,
  originHeader: string | null | undefined,
  envOrigin: string | null | undefined,
): string {
  let path = "/set-password";
  if (requested) {
    try {
      const u = new URL(requested);
      if (ALLOWED_AUTH_PATHS.includes(u.pathname)) path = u.pathname;
      if (isAllowedOrigin(u.origin)) return `${u.origin}${path}`;
    } catch { /* ignore */ }
  }
  const base = isAllowedOrigin(envOrigin)
    ? envOrigin!.replace(/\/$/, "")
    : isAllowedOrigin(originHeader)
      ? originHeader!
      : "https://ems-pro.aicono.org";
  return `${base}${path}`;
}
