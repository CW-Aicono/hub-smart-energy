/**
 * useSimulationMeter
 *
 * Liest und schreibt den aktuellen Wert eines Testzählers (capture_type='simulation')
 * aus der Tabelle `simulation_meter_state`. Subscribet via Realtime, so dass
 * mehrere Tabs / Dashboards live mitlaufen.
 *
 * Werte werden NICHT historisiert. Es gibt genau eine Zeile pro Zähler,
 * die bei jedem Slider-Schritt überschrieben wird.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";

export function useSimulationMeterValue(meterId: string | null | undefined) {
  const [value, setValue] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!meterId) return;
    let active = true;

    (async () => {
      const { data } = await (supabase as any)
        .from("simulation_meter_state")
        .select("current_value")
        .eq("meter_id", meterId)
        .maybeSingle();
      if (!active) return;
      setValue(data ? Number(data.current_value) : null);
      setLoaded(true);
    })();

    const channel = supabase
      .channel(`sim-meter-${meterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "simulation_meter_state", filter: `meter_id=eq.${meterId}` },
        (payload: any) => {
          const next = payload.new?.current_value;
          if (next != null) setValue(Number(next));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [meterId]);

  return { value, loaded };
}

/**
 * useSimulationMeterControl
 *
 * Wie useSimulationMeterValue, aber zusätzlich mit einer throttled `setValue`
 * Funktion, die in `simulation_meter_state` upserted (max ~5 Writes/Sek).
 */
export function useSimulationMeterControl(meterId: string | null | undefined) {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { value, loaded } = useSimulationMeterValue(meterId);
  const lastWrite = useRef<number>(0);
  const pending = useRef<{ value: number; timer: any } | null>(null);

  const flush = async (v: number) => {
    if (!meterId || !tenant?.id) return;
    lastWrite.current = Date.now();
    await (supabase as any)
      .from("simulation_meter_state")
      .upsert(
        {
          meter_id: meterId,
          tenant_id: tenant.id,
          current_value: v,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: "meter_id" },
      );
  };

  const setValue = (v: number) => {
    if (!meterId) return;
    const now = Date.now();
    const since = now - lastWrite.current;
    if (since >= 200) {
      // direct write
      flush(v);
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      pending.current = null;
    } else {
      // schedule trailing write
      if (pending.current?.timer) clearTimeout(pending.current.timer);
      const wait = 200 - since;
      pending.current = {
        value: v,
        timer: setTimeout(() => {
          if (pending.current) flush(pending.current.value);
          pending.current = null;
        }, wait),
      };
    }
  };

  return { value, loaded, setValue };
}
