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
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (cancelled) return;

      const roles = (data ?? []).map((r) => r.role as string);
      const isSuperAdmin = roles.includes("super_admin");
      const isSalesPartner = roles.includes("sales_partner");
      setState({
        isSalesPartner,
        isSuperAdmin,
        hasAccess: isSuperAdmin || isSalesPartner,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}
