import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

/**
 * `chargePointId` darf entweder eine einzelne ID oder ein Array sein.
 * Hintergrund: Der persistente OCPP-Server loggt manche Frames (z. B. ausgehende
 * Reset-Kommandos und die nachfolgende BootNotification) mit der OCPP-ID statt
 * der internen UUID. Damit diese Nachrichten im Log sichtbar sind, müssen wir
 * beide IDs gleichzeitig abfragen.
 */
export function useOcppLogs(
  chargePointId?: string | string[],
  messageTypeFilter?: string,
) {
  const [logs, setLogs] = useState<OcppLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const activeType = messageTypeFilter && messageTypeFilter !== "all" ? messageTypeFilter : undefined;

  const ids = useMemo(() => {
    if (!chargePointId) return [] as string[];
    const arr = Array.isArray(chargePointId) ? chargePointId : [chargePointId];
    return Array.from(new Set(arr.filter((v): v is string => !!v)));
  }, [chargePointId]);
  const idsKey = ids.join("|");
  const idsSet = useMemo(() => new Set(ids), [idsKey]);

  const fetchLogs = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from as any)(OCPP_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (ids.length === 1) {
      query = query.eq("charge_point_id", ids[0]);
    } else if (ids.length > 1) {
      query = query.in("charge_point_id", ids);
    }
    if (activeType) {
      query = query.eq("message_type", activeType);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as unknown as OcppLogEntry[]);
    }
    setLoading(false);
  }, [idsKey, activeType]);

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel(`ocpp-logs-${idsKey || "all"}-${activeType || "all"}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_message_log",
          // Bei mehreren IDs kein Server-Filter — wir filtern unten client-seitig.
          ...(ids.length === 1 ? { filter: `charge_point_id=eq.${ids[0]}` } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        (payload: { new: Record<string, unknown> }) => {
          if (pausedRef.current) return;
          const entry = payload.new as unknown as OcppLogEntry;
          if (ids.length > 1 && !idsSet.has(entry.charge_point_id)) return;
          if (activeType && entry.message_type !== activeType) return;
          setLogs((prev) => [entry, ...prev].slice(0, 500));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idsKey, activeType, fetchLogs, idsSet, ids.length]);

  return { logs, loading, paused, setPaused, refetch: fetchLogs };
}
