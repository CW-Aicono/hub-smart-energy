import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface SalesPartnerState {
  isSalesPartner: boolean;
  isSuperAdmin: boolean;
  hasAccess: boolean;
  loading: boolean;
}

export function useSalesPartner(): SalesPartnerState {
  const { user } = useAuth();
  const [state, setState] = useState<SalesPartnerState>({
    isSalesPartner: false,
    isSuperAdmin: false,
    hasAccess: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setState({ isSalesPartner: false, isSuperAdmin: false, hasAccess: false, loading: false });
      return;
    }

    (async () => {
      const [{ data: roles }, { data: pm }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("partner_members").select("partner_id").eq("user_id", user.id).limit(1),
      ]);

      if (cancelled) return;

      const roleList = (roles ?? []).map((r) => r.role as string);
      const isSuperAdmin = roleList.includes("super_admin");
      const isSalesPartner = roleList.includes("sales_partner");
      const isPartnerMember = (pm ?? []).length > 0;
      setState({
        isSalesPartner: isSalesPartner || isPartnerMember,
        isSuperAdmin,
        hasAccess: isSuperAdmin || isSalesPartner || isPartnerMember,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}
