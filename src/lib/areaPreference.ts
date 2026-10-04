/**
 * Bereichs-Präferenz für Nutzer mit mehreren Bereichen.
 *  - "super_admin" = Plattform-Verwaltung
 *  - "partner"     = kaufmännischer Bereich (Partner-Portal)
 *  - "ems"         = technischer Bereich (EMS-Dashboard)
 * Nur Navigationshilfe – vergibt keine Rechte.
 */
export type AppArea = "super_admin" | "partner" | "ems";

const KEY = "aicono_area_preference";

export const AREA_PATHS: Record<AppArea, string> = {
  super_admin: "/super-admin",
  partner: "/partner",
  ems: "/",
};

export function getAreaPreference(): AppArea | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "partner" || v === "ems" || v === "super_admin" ? v : null;
  } catch {
    return null;
  }
}

export function setAreaPreference(area: AppArea) {
  try {
    localStorage.setItem(KEY, area);
  } catch {
    /* ignore */
  }
}

export function clearAreaPreference() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
