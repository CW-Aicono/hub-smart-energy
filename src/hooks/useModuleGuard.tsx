import { useMemo } from "react";
import { useTenantModules } from "./useTenantModules";
import { useDemoMode } from "@/contexts/DemoMode";
import { useTenant } from "./useTenant";

/**
 * Maps route paths to module codes.
 * Routes not listed here are always accessible.
 */
const ROUTE_MODULE_MAP: Record<string, string> = {
  "/integrations": "integrations",
  "/energy-data": "energy_monitoring",
  "/meters": "energy_monitoring",
  "/live-values": "live_values",
  "/charging/points": "ev_charging",
  "/charging/billing": "ev_charging",
  "/automation": "automation_multi",
  "/network": "network_infra",
  "/tasks": "task_management",
  "/settings/branding": "integrations",
  "/arbitrage": "arbitrage_trading",
  "/tenant-electricity": "tenant_electricity",
  "/energy-report": "energy_report",
  "/energy-sharing": "energy_sharing",
  "/ppa": "ppa_onsite|ppa_offsite",
  "/ppa/onsite": "ppa_onsite",
  "/ppa/offsite": "ppa_offsite",
};

/**
 * Maps sidebar nav item paths to module codes for visibility filtering.
 */
const NAV_MODULE_MAP: Record<string, string> = {
  "/integrations": "integrations",
  "/energy-data": "energy_monitoring",
  "/meters": "energy_monitoring",
  "/live-values": "live_values",
  "/charging/points": "ev_charging",
  "/charging/billing": "ev_charging",
  "/automation": "automation_multi",
  "/network": "network_infra",
  "/tasks": "task_management",
  "/arbitrage": "arbitrage_trading",
  "/tenant-electricity": "tenant_electricity",
  "/energy-report": "energy_report",
  "/energy-sharing": "energy_sharing",
  "/ppa/onsite": "ppa_onsite",
  "/ppa/offsite": "ppa_offsite",
};

export function useModuleGuard() {
  const isDemo = useDemoMode();
  const { tenant } = useTenant();
  const { modules, isLoading, isModuleEnabled } = useTenantModules(isDemo ? null : (tenant?.id ?? null));

  // Strict mode: if the tenant has any module records, treat absence as "disabled" (opt-in).
  // Permissive mode: if no records exist at all, default to enabled (legacy/unconfigured tenants).
  const strictMode = modules.length > 0;

  const checkModule = (code: string): boolean => {
    if (isDemo) return true;
    if (isLoading || !tenant) return true;
    const mod = modules.find((m) => m.module_code === code);
    if (mod) return mod.is_enabled;
    return !strictMode;
  };

  const isRouteAllowed = (path: string): boolean => {
    if (isDemo) return true;
    if (isLoading || !tenant) return true;

    const moduleCode = ROUTE_MODULE_MAP[path];
    if (!moduleCode) {
      const matchedRoute = Object.keys(ROUTE_MODULE_MAP).find(
        (route) => path.startsWith(route + "/")
      );
      if (!matchedRoute) return true;
      return checkModule(ROUTE_MODULE_MAP[matchedRoute]);
    }

    return checkModule(moduleCode);
  };

  const isNavItemVisible = (path: string): boolean => {
    if (isDemo) return true;
    if (isLoading || !tenant) return true;
    const moduleCode = NAV_MODULE_MAP[path];
    if (!moduleCode) return true;
    return checkModule(moduleCode);
  };

  /** Whether the full locations module (multiple locations) is enabled */
  const locationsFullEnabled = useMemo(() => {
    if (isLoading || !tenant) return true;
    const mod = modules.find((m) => m.module_code === "locations");
    if (mod) return mod.is_enabled;
    return !strictMode;
  }, [modules, isLoading, tenant, strictMode]);

  return { isRouteAllowed, isNavItemVisible, isLoading, isModuleEnabled: checkModule, locationsFullEnabled };
}

