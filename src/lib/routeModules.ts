/**
 * Single source of truth: which module unlocks which app path.
 * Used by both the route guard (ModuleGuard) and sidebar visibility, so a
 * menu item can never be shown for a page the guard would block.
 *
 * Sub-paths inherit the module of their nearest listed parent.
 * Paths not listed at all are "unknown" and treated fail-closed.
 */
export const ROUTE_MODULES: Record<string, string> = {
  "/integrations": "integrations",
  "/settings/branding": "integrations",
  "/energy-data": "energy_monitoring",
  "/meters": "energy_monitoring",
  "/live-values": "live_values",
  "/analytics-studio": "analytics_studio",
  "/energy-report": "energy_report",
  "/charging": "ev_charging",
  "/charging/transactions": "adhoc_payment",
  "/automation": "automation_multi",
  "/network": "network_infra",
  "/tasks": "task_management",
  "/arbitrage": "arbitrage_trading",
  "/peak-shaving": "peak_shaving",
  "/tenant-electricity": "tenant_electricity",
  "/savings-share": "gain_sharing",
  "/super-admin/savings-share": "gain_sharing",
  "/energy-sharing": "energy_sharing",
  "/ppa": "ppa_onsite|ppa_offsite",
  "/ppa/onsite": "ppa_onsite",
  "/ppa/offsite": "ppa_offsite",
  "/documents": "documentation",
};

/** Paths that are always reachable regardless of booked packages (base areas). */
export const ALWAYS_ALLOWED_PATHS: string[] = [
  "/",
  "/locations",
  "/copilot",
  "/admin",
  "/roles",
  "/settings",
  "/settings/email-templates",
  "/profile",
  "/help",
];

const BASE_MODULE_CODES = ["dashboard", "locations", "floor_plans", "documentation"];

/** True when a tenant has no enabled module beyond the free base package. */
export function hasOnlyBaseModules(modules: { module_code: string; is_enabled: boolean }[]): boolean {
  return !modules.some((m) => m.is_enabled && !BASE_MODULE_CODES.includes(m.module_code));
}

/** Without booked packages only dashboard and settings are shown (profile stays reachable directly). */
export function isAllowedWithoutPackages(rawPath: string, forMenu: boolean): boolean {
  const path = normalize(rawPath);
  const bases = forMenu ? ["/", "/settings"] : ["/", "/settings", "/profile"];
  return bases.some((b) => matchesPrefix(path, b));
}

export type RouteModuleResolution =
  | { kind: "public" }
  | { kind: "module"; code: string }
  | { kind: "unknown" };

function normalize(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

function matchesPrefix(path: string, base: string): boolean {
  if (base === "/") return path === "/";
  return path === base || path.startsWith(base + "/");
}

export function resolveRouteModule(rawPath: string): RouteModuleResolution {
  const path = normalize(rawPath);
  // Longest matching module prefix wins (e.g. /charging/transactions over /charging).
  const moduleMatch = Object.keys(ROUTE_MODULES)
    .filter((base) => matchesPrefix(path, base))
    .sort((a, b) => b.length - a.length)[0];
  const publicMatch = ALWAYS_ALLOWED_PATHS
    .filter((base) => matchesPrefix(path, base))
    .sort((a, b) => b.length - a.length)[0];
  if (moduleMatch && (!publicMatch || moduleMatch.length >= publicMatch.length)) {
    return { kind: "module", code: ROUTE_MODULES[moduleMatch] };
  }
  if (publicMatch) return { kind: "public" };
  return { kind: "unknown" };
}
