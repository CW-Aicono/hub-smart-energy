import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OcppLogEntry {
  id: string;
  charge_point_id: string;
  direction: "incoming" | "outgoing";
  message_type: string | null;
  raw_message: unknown;
  created_at: string;
}

export function useOcppLogs(chargePointId?: string) {
  const [logs, setLogs] = useState<OcppLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("ocpp_message_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (chargePointId) {
      query = query.eq("charge_point_id", chargePointId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as unknown as OcppLogEntry[]);
    }
    setLoading(false);
  }, [chargePointId]);

  useEffect(() => {
    fetchLogs();

    // Realtime subscription
    const channel = supabase
      .channel(`ocpp-logs-${chargePointId || "all"}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_message_log",
          ...(chargePointId ? { filter: `charge_point_id=eq.${chargePointId}` } : {}),
        },
        (payload: any) => {
          setLogs((prev) => [payload.new as OcppLogEntry, ...prev].slice(0, 500));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chargePointId, fetchLogs]);

  return { logs, loading, refetch: fetchLogs };
}
