import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerHostBranding {
  id: string;
  name: string;
  brand_display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  custom_domain: string | null;
  subdomain: string | null;
  support_email: string | null;
  white_label_enabled: boolean;
  is_active: boolean;
}

/**
 * Resolves white-label branding for the current hostname.
 * Used on public/unauth pages (e.g. /auth) so a partner's
 * custom domain shows the partner's branding instead of AICONO.
 *
 * Returns null if no white-label partner matches the current host
 * (then the app falls back to default AICONO branding).
 */
export function usePartnerHostBranding() {
  const [branding, setBranding] = useState<PartnerHostBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = typeof window !== "undefined" ? window.location.hostname : "";

    // Skip lookup for local/preview hosts to save a roundtrip.
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com")
    ) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase.rpc("resolve_partner_branding_by_host", {
        _host: host,
      });
      if (cancelled) return;
      if (!error && data) setBranding(data as unknown as PartnerHostBranding);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { branding, loading };
}
