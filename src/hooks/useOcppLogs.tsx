import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OcppLogEntry {
  id: string;
  charge_point_id: string;
  direction: "incoming" | "outgoing";
  message_type: string | null;
  raw_message: unknown;
  created_at: string;
}

// The ocpp_message_log table exists in the DB but is not yet in the generated types.
// A single `as any` on the table name is the minimal workaround.
const OCPP_TABLE = "ocpp_message_log";

export function useOcppLogs(chargePointId?: string, messageTypeFilter?: string) {
  const [logs, setLogs] = useState<OcppLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const activeType = messageTypeFilter && messageTypeFilter !== "all" ? messageTypeFilter : undefined;

  const fetchLogs = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from as any)(OCPP_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (chargePointId) {
      query = query.eq("charge_point_id", chargePointId);
    }
    if (activeType) {
      query = query.eq("message_type", activeType);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as unknown as OcppLogEntry[]);
    }
    setLoading(false);
  }, [chargePointId, activeType]);

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel(`ocpp-logs-${chargePointId || "all"}-${activeType || "all"}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_message_log",
          ...(chargePointId ? { filter: `charge_point_id=eq.${chargePointId}` } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        (payload: { new: Record<string, unknown> }) => {
          if (pausedRef.current) return;
          const entry = payload.new as unknown as OcppLogEntry;
          if (activeType && entry.message_type !== activeType) return;
          setLogs((prev) => [entry, ...prev].slice(0, 500));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chargePointId, activeType, fetchLogs]);

  return { logs, loading, paused, setPaused, refetch: fetchLogs };
}
