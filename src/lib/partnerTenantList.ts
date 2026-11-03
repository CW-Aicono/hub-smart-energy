import { supabase } from "@/integrations/supabase/client";

export async function loadPartnerTenants(partnerId: string) {
  // Additive schema rollout must not hide tenants. Missing setup state never grants access.
  const { data, error } = await supabase.from("tenants").select("*")
    .eq("partner_id", partnerId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}