import { usePartnerAccess } from "./usePartnerAccess";
import { useTenantOptional } from "./useTenant";

/**
 * Ermittelt, ob ein Nutzer sowohl das Partner-Portal (kaufmännisch) als auch
 * das EMS eines eigenen Mandanten (technisch) nutzen darf.
 */
export function useAreaAccess() {
  const { isPartnerMember, loading: partnerLoading } = usePartnerAccess();
  const tenantCtx = useTenantOptional();
  const tenant = tenantCtx?.tenant ?? null;
  const tenantLoading = tenantCtx?.loading ?? false;

  const loading = partnerLoading || tenantLoading;

  return {
    loading,
    isPartnerMember,
    hasOwnTenant: !!tenant,
    canSwitch: !loading && isPartnerMember && !!tenant,
  };
}
