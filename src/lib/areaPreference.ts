/**
 * Bereichs-Präferenz für Nutzer, die sowohl Partner-Mitglied sind als auch
 * einen eigenen Mandanten (EMS) haben.
 *  - "partner" = kaufmännischer Bereich (Partner-Portal)
 *  - "ems"     = technischer Bereich (EMS-Dashboard)
 */
export type AppArea = "partner" | "ems";

const KEY = "aicono_area_preference";

export function getAreaPreference(): AppArea | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "partner" || v === "ems" ? v : null;
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
