import { useTenantModules } from "./useTenantModules";
import { useTenant } from "./useTenant";

/**
 * Maps route paths to module codes.
 * Routes not listed here are always accessible.
 */
const ROUTE_MODULE_MAP: Record<string, string> = {
  "/locations": "locations",
  "/integrations": "integrations",
  "/energy-data": "energy_monitoring",
  "/meters": "energy_monitoring",
  "/live-values": "live_values",
  "/charging/points": "ev_charging",
  "/charging/billing": "ev_charging",
  "/automation": "automation",
  "/settings/branding": "integrations",
};

/**
 * Maps sidebar nav item paths to module codes for visibility filtering.
 */
const NAV_MODULE_MAP: Record<string, string> = {
  "/locations": "locations",
  "/integrations": "integrations",
  "/energy-data": "energy_monitoring",
  "/meters": "energy_monitoring",
  "/live-values": "live_values",
  "/charging/points": "ev_charging",
  "/charging/billing": "ev_charging",
  "/automation": "automation",
};

export function useModuleGuard() {
  const { tenant } = useTenant();
  const { modules, isLoading, isModuleEnabled } = useTenantModules(tenant?.id ?? null);

  const isRouteAllowed = (path: string): boolean => {
    // If modules haven't loaded yet, allow (will re-check after load)
    if (isLoading || !tenant) return true;
    
    // Check exact match first
    const moduleCode = ROUTE_MODULE_MAP[path];
    if (!moduleCode) {
      // Check if path starts with any mapped route (e.g. /locations/:id)
      const matchedRoute = Object.keys(ROUTE_MODULE_MAP).find(
        (route) => path.startsWith(route + "/")
      );
      if (!matchedRoute) return true; // Not a module-protected route
      const code = ROUTE_MODULE_MAP[matchedRoute];
      // If no module rows exist for this code, default to allowed
      const mod = modules.find((m) => m.module_code === code);
      return mod ? mod.is_enabled : true;
    }

    const mod = modules.find((m) => m.module_code === moduleCode);
    return mod ? mod.is_enabled : true; // default: allowed if not configured
  };

  const isNavItemVisible = (path: string): boolean => {
    if (isLoading || !tenant) return true;
    const moduleCode = NAV_MODULE_MAP[path];
    if (!moduleCode) return true;
    const mod = modules.find((m) => m.module_code === moduleCode);
    return mod ? mod.is_enabled : true;
  };

  return { isRouteAllowed, isNavItemVisible, isLoading };
}
