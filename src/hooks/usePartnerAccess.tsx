import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type PartnerRole = "partner_admin" | "partner_user";

interface PartnerAccessState {
  loading: boolean;
  isPartnerMember: boolean;
  isPartnerAdmin: boolean;
  partnerId: string | null;
  partnerName: string | null;
  partnerLogoUrl: string | null;
  role: PartnerRole | null;
}

const INITIAL: PartnerAccessState = {
  loading: true,
  isPartnerMember: false,
  isPartnerAdmin: false,
  partnerId: null,
  partnerName: null,
  partnerLogoUrl: null,
  role: null,
};

/**
 * Stufe 2 (Partner-Portal): liest die Mitgliedschaft des aktuellen
 * Users in einer Partner-Organisation. Liefert Partner-Stammdaten
 * (Name, Logo) für Header/Sidebar mit.
 */
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
        .select("role, partner_id, partners:partner_id(name, logo_url, is_active)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data || !data.partners || (data.partners as any).is_active === false) {
        setState({ ...INITIAL, loading: false });
        return;
      }

      const role = data.role as PartnerRole;
      const p = data.partners as { name: string; logo_url: string | null };
      setState({
        loading: false,
        isPartnerMember: true,
        isPartnerAdmin: role === "partner_admin",
        partnerId: data.partner_id,
        partnerName: p.name,
        partnerLogoUrl: p.logo_url,
        role,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return state;
}
