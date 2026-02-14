import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OcppMeterValueResult {
  value: number | null;
  unit: string;
  timestamp: string | null;
  loading: boolean;
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

  const fetch = useCallback(async () => {
    if (!ocppId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("ocpp_message_log" as any)
      .select("raw_message, created_at")
      .eq("charge_point_id", ocppId)
      .eq("message_type", "MeterValues")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      try {
        const raw = (data[0] as any).raw_message;
        // OCPP 1.6 JSON: [2, messageId, "MeterValues", { meterValue: [...] }]
        const payload = Array.isArray(raw) ? raw[3] : raw;
        const meterValues = payload?.meterValue || payload?.metervalue;
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
              setTimestamp((data[0] as any).created_at);
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
    fetch();

    // Also listen for new MeterValues in realtime
    if (!ocppId) return;
    const channel = supabase
      .channel(`meter-value-${ocppId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_message_log",
          filter: `charge_point_id=eq.${ocppId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.message_type !== "MeterValues") return;
          try {
            const raw = row.raw_message;
            const p = Array.isArray(raw) ? raw[3] : raw;
            const mv = p?.meterValue || p?.metervalue;
            if (Array.isArray(mv) && mv.length > 0) {
              const sv = mv[0]?.sampledValue?.[0];
              if (sv) {
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
          } catch { /* ignore */ }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ocppId, fetch]);

  return { value, unit, timestamp, loading };
}
