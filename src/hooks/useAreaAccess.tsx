import { usePartnerAccess } from "./usePartnerAccess";
import { useTenantOptional } from "./useTenant";
import { usePortalMember as useSuperAdmin } from "./usePortalAccess";
import { isImpersonating } from "@/lib/supportView";
import type { AppArea } from "@/lib/areaPreference";

/**
 * Ermittelt, welche Bereiche ein Nutzer nutzen darf (Portal-Admin, Partner, EMS).
 * Reine Navigationshilfe – die Rechte prüfen Datenbank und Guards.
 */
export function useAreaAccess() {
  const { isPartnerMember, loading: partnerLoading } = usePartnerAccess();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const tenantCtx = useTenantOptional();
  const tenant = tenantCtx?.tenant ?? null;
  const tenantLoading = tenantCtx?.loading ?? false;

  const loading = partnerLoading || tenantLoading || saLoading;
  const impersonating = isImpersonating();

  const availableAreas: AppArea[] = [];
  if (!loading && !impersonating) {
    if (isSuperAdmin) availableAreas.push("super_admin");
    if (isPartnerMember) availableAreas.push("partner");
    if (tenant) availableAreas.push("ems");
  }

  return {
    loading,
    isPartnerMember,
    isSuperAdmin,
    hasOwnTenant: !!tenant,
    availableAreas,
    canSwitch: availableAreas.length >= 2,
  };
}
