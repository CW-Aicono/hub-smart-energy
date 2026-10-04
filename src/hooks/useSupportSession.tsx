import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/hooks/useTenant";

interface SupportSession {
  id: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  reason: string | null;
}

/**
 * Aktive Remote-Support-Sitzung des Tenants.
 * Kein Zeitlimit: aktiv, bis die Sitzung beendet wird (ended_at gesetzt).
 */
export function useSupportSession() {
  const tenant = useTenantOptional()?.tenant ?? null;
  const queryClient = useQueryClient();

  const { data: session } = useQuery<SupportSession | null>({
    queryKey: ["active-support-session", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from("support_sessions")
        .select("id, started_at, expires_at, ended_at, reason")
        .eq("tenant_id", tenant.id)
        .is("ended_at", null)
        .eq("is_manual", false)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as SupportSession | null;
    },
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("support-session-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_sessions", filter: `tenant_id=eq.${tenant.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["active-support-session", tenant.id] });
          queryClient.invalidateQueries({ queryKey: ["support-session-history", tenant.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, queryClient]);

  return { isActive: !!session, session };
}
