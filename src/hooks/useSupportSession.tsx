import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

interface SupportSession {
  id: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  reason: string | null;
}

export function useSupportSession() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const { data: session } = useQuery<SupportSession | null>({
    queryKey: ["active-support-session", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from("support_sessions")
        .select("id, started_at, expires_at, ended_at, reason")
        .eq("tenant_id", tenant.id)
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as SupportSession | null;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("support-session-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_sessions", filter: `tenant_id=eq.${tenant.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["active-support-session", tenant.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, queryClient]);

  // Countdown timer
  useEffect(() => {
    if (!session) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        queryClient.invalidateQueries({ queryKey: ["active-support-session"] });
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [session, queryClient]);

  const extendSession = useCallback(async () => {
    if (!session) return;
    const newExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabase
      .from("support_sessions")
      .update({ expires_at: newExpiry } as any)
      .eq("id", session.id);
    queryClient.invalidateQueries({ queryKey: ["active-support-session"] });
  }, [session, queryClient]);

  const isActive = !!session && (secondsLeft ?? 0) > 0;
  const showCountdown = isActive && (secondsLeft ?? 0) <= 60;

  return { isActive, session, secondsLeft, showCountdown, extendSession };
}
