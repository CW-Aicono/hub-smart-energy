import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type PartnerRole = "partner_admin" | "partner_user";

export interface PartnerPermissions {
  manageSalesCatalog: boolean;
  createTenant: boolean;
  viewBilling: boolean;
  useSalesScout: boolean;
  manageMembers: boolean;
  manageBranding: boolean;
  viewReporting: boolean;
  manageTenants: boolean;
}

interface PartnerAccessState {
  loading: boolean;
  isPartnerMember: boolean;
  isPartnerAdmin: boolean;
  partnerId: string | null;
  partnerName: string | null;
  partnerLogoUrl: string | null;
  role: PartnerRole | null;
  permissions: PartnerPermissions;
}

const NO_PERMS: PartnerPermissions = {
  manageSalesCatalog: false,
  createTenant: false,
  viewBilling: false,
  useSalesScout: false,
  manageMembers: false,
  manageBranding: false,
  viewReporting: false,
  manageTenants: false,
};

const ALL_PERMS: PartnerPermissions = {
  manageSalesCatalog: true,
  createTenant: true,
  viewBilling: true,
  useSalesScout: true,
  manageMembers: true,
  manageBranding: true,
  viewReporting: true,
  manageTenants: true,
};

const INITIAL: PartnerAccessState = {
  loading: true,
  isPartnerMember: false,
  isPartnerAdmin: false,
  partnerId: null,
  partnerName: null,
  partnerLogoUrl: null,
  role: null,
  permissions: NO_PERMS,
};

export function usePartnerAccess(): PartnerAccessState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PartnerAccessState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("partner_members")
        .select(
          "partner_role, partner_id, can_manage_sales_catalog, can_create_tenant, can_view_billing, can_use_sales_scout, can_manage_members, can_manage_branding, can_view_reporting, can_manage_tenants, partners:partner_id(name, logo_url, is_active)",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      const partner = (data as any)?.partners as
        | { name: string; logo_url: string | null; is_active: boolean }
        | null;

      if (error || !data || !partner || partner.is_active === false) {
        setState({ ...INITIAL, loading: false });
        return;
      }

      const row = data as any;
      const role = row.partner_role as PartnerRole;
      const isAdmin = role === "partner_admin";
      const permissions: PartnerPermissions = isAdmin
        ? ALL_PERMS
        : {
            manageSalesCatalog: !!row.can_manage_sales_catalog,
            createTenant: !!row.can_create_tenant,
            viewBilling: !!row.can_view_billing,
            useSalesScout: row.can_use_sales_scout !== false,
            manageMembers: !!row.can_manage_members,
            manageBranding: !!row.can_manage_branding,
            viewReporting: !!row.can_view_reporting,
            manageTenants: !!row.can_manage_tenants,
          };

      setState({
        loading: false,
        isPartnerMember: true,
        isPartnerAdmin: isAdmin,
        partnerId: row.partner_id,
        partnerName: partner.name,
        partnerLogoUrl: partner.logo_url,
        role,
        permissions,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return state;
}
