import { useMemo } from "react";
import { useTenantModules } from "./useTenantModules";
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
  "/settings/branding": "integrations",
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
};

export function useModuleGuard() {
  const { tenant } = useTenant();
  const { modules, isLoading, isModuleEnabled } = useTenantModules(tenant?.id ?? null);

  const checkModule = (code: string): boolean => {
    if (isLoading || !tenant) return true;
    const mod = modules.find((m) => m.module_code === code);
    return mod ? mod.is_enabled : true;
  };

  const isRouteAllowed = (path: string): boolean => {
    if (isLoading || !tenant) return true;
    
    const moduleCode = ROUTE_MODULE_MAP[path];
    if (!moduleCode) {
      // Check prefix match (e.g. /locations/:id)
      const matchedRoute = Object.keys(ROUTE_MODULE_MAP).find(
        (route) => path.startsWith(route + "/")
      );
      if (!matchedRoute) return true;
      return checkModule(ROUTE_MODULE_MAP[matchedRoute]);
    }

    return checkModule(moduleCode);
  };

  const isNavItemVisible = (path: string): boolean => {
    if (isLoading || !tenant) return true;
    const moduleCode = NAV_MODULE_MAP[path];
    if (!moduleCode) return true;
    return checkModule(moduleCode);
  };

  /** Whether the full locations module (multiple locations) is enabled */
  const locationsFullEnabled = useMemo(() => {
    if (isLoading || !tenant) return true;
    const mod = modules.find((m) => m.module_code === "locations");
    return mod ? mod.is_enabled : true;
  }, [modules, isLoading, tenant]);

  return { isRouteAllowed, isNavItemVisible, isLoading, isModuleEnabled: checkModule, locationsFullEnabled };
}
