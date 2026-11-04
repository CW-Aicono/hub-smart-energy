import { useMemo } from "react";
import { useTenantModules } from "./useTenantModules";
import { useDemoMode } from "@/contexts/DemoMode";
import { useTenant } from "./useTenant";
import { useMyPermissions } from "./useMyPermissions";
import { resolveRouteModule } from "@/lib/routeModules";


export function useModuleGuard() {
  const isDemo = useDemoMode();
  const { tenant } = useTenant();
  const { modules, isLoading, isModuleEnabled } = useTenantModules(isDemo ? null : (tenant?.id ?? null));

  // Strict mode: if the tenant has any module records, treat absence as "disabled" (opt-in).
  // Permissive mode: if no records exist at all, default to enabled (legacy/unconfigured tenants).
  const strictMode = modules.length > 0;
  // Custom-role permissions narrow access within the booked modules.
  const perms = useMyPermissions();

  const checkModule = (code: string): boolean => {
    if (isDemo) return true;
    if (isLoading || !tenant) return true;
    // Support OR-combined codes separated by "|" (route visible if ANY is enabled)
    if (code.includes("|")) {
      return code.split("|").some((c) => checkModule(c));
    }
    const mod = modules.find((m) => m.module_code === code);
    if (mod) return mod.is_enabled;
    return !strictMode;
  };

  // Route guard and sidebar share one resolver; unknown paths are fail-closed.
  const isPathAllowed = (path: string): boolean => {
    if (isDemo) return true;
    if (!perms.isPathPermitted(path)) return false;
    if (isLoading || !tenant) return true;
    const res = resolveRouteModule(path);
    if (res.kind === "public") return true;
    if (res.kind === "unknown") return false;
    return checkModule(res.code);
  };

  const isRouteAllowed = isPathAllowed;
  const isNavItemVisible = isPathAllowed;

  /** Whether the full locations module (multiple locations) is enabled */
  const locationsFullEnabled = useMemo(() => {
    if (isLoading || !tenant) return true;
    const mod = modules.find((m) => m.module_code === "locations");
    if (mod) return mod.is_enabled;
    return !strictMode;
  }, [modules, isLoading, tenant, strictMode]);

  return { isRouteAllowed, isNavItemVisible, isLoading: isLoading || perms.loading, isModuleEnabled: checkModule, locationsFullEnabled };
}

