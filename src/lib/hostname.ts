/**
 * Stufe 2 (Partner-Portal): Hostname-Erkennung.
 * partner.aicono.org → Partner-Portal
 * Optional: ?partner=1 als Dev-Override für lokale Tests / Preview-URLs.
 */
export function isPartnerHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("partner.")) return true;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("partner") === "1") {
      sessionStorage.setItem("aicono_partner_preview", "1");
      return true;
    }
    if (sessionStorage.getItem("aicono_partner_preview") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}
