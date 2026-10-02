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

/**
 * Sales-Scout PWA: sales.aicono.org → /sales
 * Optional: ?sales=1 als Dev-Override (z. B. Lovable Preview).
 */
export function isSalesHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("sales.")) return true;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("sales") === "1") {
      sessionStorage.setItem("aicono_sales_preview", "1");
      return true;
    }
    if (sessionStorage.getItem("aicono_sales_preview") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * C-Level Dashboard PWA: board.aicono.org → /board
 * Optional: ?board=1 als Dev-Override (z. B. Lovable Preview).
 */
export function isBoardHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("board.")) return true;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("board") === "1") {
      sessionStorage.setItem("aicono_board_preview", "1");
      return true;
    }
    if (sessionStorage.getItem("aicono_board_preview") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}
