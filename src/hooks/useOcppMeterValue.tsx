import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OcppMeterValueResult {
  value: number | null;
  unit: string;
  timestamp: string | null;
  loading: boolean;
}

// The ocpp_message_log table exists in the DB but is not yet in the generated types.
const OCPP_TABLE = "ocpp_message_log";

interface OcppRawRow {
  raw_message: unknown;
  created_at: string;
}

/**
 * Extracts the latest MeterValues reading from the OCPP message log
 * for a given charge point (by ocpp_id).
 */
export function useOcppMeterValue(ocppId?: string): OcppMeterValueResult {
  const [value, setValue] = useState<number | null>(null);
  const [unit, setUnit] = useState("kWh");
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchValue = useCallback(async () => {
    if (!ocppId) { setLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)(OCPP_TABLE)
      .select("raw_message, created_at")
      .eq("charge_point_id", ocppId)
      .eq("message_type", "MeterValues")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      try {
        const row = data[0] as unknown as OcppRawRow;
        const raw = row.raw_message;
        // OCPP 1.6 JSON: [2, messageId, "MeterValues", { meterValue: [...] }]
        const payload = Array.isArray(raw) ? raw[3] : raw;
        const meterValues = (payload as Record<string, unknown>)?.meterValue || (payload as Record<string, unknown>)?.metervalue;
        if (Array.isArray(meterValues) && meterValues.length > 0) {
          const sampledValues = meterValues[0]?.sampledValue;
          if (Array.isArray(sampledValues) && sampledValues.length > 0) {
            const sv = sampledValues[0];
            const parsed = typeof sv.value === "string"
              ? parseFloat(sv.value.replace(",", "."))
              : Number(sv.value);
            if (!isNaN(parsed)) {
              setValue(parsed);
              setUnit(sv.unit || "kWh");
              setTimestamp(row.created_at);
            }
          }
        }
      } catch {
        // parse error – ignore
      }
    }
    setLoading(false);
  }, [ocppId]);

  useEffect(() => {
    fetchValue();

    // Also listen for new MeterValues in realtime
    if (!ocppId) return;
    const channel = supabase
      .channel(`meter-value-${ocppId}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_message_log",
          filter: `charge_point_id=eq.${ocppId}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          if (row?.message_type !== "MeterValues") return;
          try {
            const raw = row.raw_message;
            const p = Array.isArray(raw) ? raw[3] : raw;
            const mv = (p as Record<string, unknown>)?.meterValue || (p as Record<string, unknown>)?.metervalue;
            if (Array.isArray(mv) && mv.length > 0) {
              const sv = mv[0]?.sampledValue?.[0];
              if (sv) {
                const parsed = typeof sv.value === "string"
                  ? parseFloat(sv.value.replace(",", "."))
                  : Number(sv.value);
                if (!isNaN(parsed)) {
                  setValue(parsed);
                  setUnit(sv.unit || "kWh");
                  setTimestamp(row.created_at as string);
                }
              }
            }
          } catch { /* ignore */ }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ocppId, fetchValue]);

  return { value, unit, timestamp, loading };
}
