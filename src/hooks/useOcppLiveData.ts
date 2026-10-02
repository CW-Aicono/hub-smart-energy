import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LiveSample {
  measurand: string;
  phase: string | null;
  unit: string | null;
  value: number;
  sampled_at: string;
}

export interface OcppLiveData {
  /** Letzter Sample je Kombination measurand|phase. */
  samplesByKey: Record<string, LiveSample>;
  /** Spät­ester sampled_at über alle Werte. */
  latestAt: string | null;
  loading: boolean;
  /** Schnellzugriff: aktuelle Gesamtleistung in W. */
  powerW: number | null;
  /** Aktuelle Energie kWh (Energy.Active.Import.Register umgerechnet). */
  energyKwh: number | null;
  /** Voltage je Phase (L1/L2/L3) in V. */
  voltageByPhase: Record<string, number>;
  /** Strom je Phase in A. */
  currentByPhase: Record<string, number>;
}

const EMPTY: OcppLiveData = {
  samplesByKey: {},
  latestAt: null,
  loading: true,
  powerW: null,
  energyKwh: null,
  voltageByPhase: {},
  currentByPhase: {},
};

function aggregate(samples: LiveSample[]): OcppLiveData {
  const byKey: Record<string, LiveSample> = {};
  let latest: string | null = null;
  for (const s of samples) {
    const key = `${s.measurand}|${s.phase ?? ""}`;
    const prev = byKey[key];
    if (!prev || prev.sampled_at < s.sampled_at) byKey[key] = s;
    if (!latest || latest < s.sampled_at) latest = s.sampled_at;
  }

  const voltageByPhase: Record<string, number> = {};
  const currentByPhase: Record<string, number> = {};
  let powerW: number | null = null;
  let energyKwh: number | null = null;

  for (const s of Object.values(byKey)) {
    if (s.measurand === "Voltage") {
      voltageByPhase[s.phase || "L1"] = s.value;
    } else if (s.measurand === "Current.Import") {
      currentByPhase[s.phase || "L1"] = s.value;
    } else if (s.measurand === "Power.Active.Import") {
      // OCPP-Einheiten W oder kW
      const factor = (s.unit || "").toLowerCase() === "kw" ? 1000 : 1;
      powerW = s.value * factor;
    } else if (s.measurand === "Energy.Active.Import.Register") {
      const u = (s.unit || "").toLowerCase();
      energyKwh = u === "kwh" ? s.value : s.value / 1000; // Wh → kWh
    }
  }

  return {
    samplesByKey: byKey,
    latestAt: latest,
    loading: false,
    powerW,
    energyKwh,
    voltageByPhase,
    currentByPhase,
  };
}

/**
 * Lädt die jüngsten OCPP-MeterValues für einen Ladepunkt (chargePointPk = UUID)
 * und abonniert Realtime-Updates.
 */
export function useOcppLiveData(chargePointPk: string | undefined): OcppLiveData {
  const [data, setData] = useState<OcppLiveData>(EMPTY);

  useEffect(() => {
    if (!chargePointPk) {
      setData({ ...EMPTY, loading: false });
      return;
    }
    let cancelled = false;
    setData((d) => ({ ...d, loading: true }));

    // letzte 30 Samples reichen, um pro Measurand/Phase den aktuellsten zu finden
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("ocpp_meter_samples" as any)
      .select("measurand, phase, unit, value, sampled_at")
      .eq("charge_point_id", chargePointPk)
      .order("sampled_at", { ascending: false })
      .limit(60)
      .then(({ data: rows }) => {
        if (cancelled) return;
        const arr = (rows ?? []) as unknown as LiveSample[];
        setData(aggregate(arr));
      });

    const channel = supabase
      .channel(`ocpp-live-${chargePointPk}`)
      .on(
        "postgres_changes" as const,
        {
          event: "INSERT",
          schema: "public",
          table: "ocpp_meter_samples",
          filter: `charge_point_id=eq.${chargePointPk}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        (payload: { new: LiveSample }) => {
          setData((prev) => {
            const merged = [...Object.values(prev.samplesByKey), payload.new];
            return aggregate(merged);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [chargePointPk]);

  return data;
}

export interface OcppCapabilities {
  supported_measurands: string[];
  last_probed_at: string;
  raw_config: Record<string, unknown>;
}

export function useOcppCapabilities(chargePointPk: string | undefined) {
  const [caps, setCaps] = useState<OcppCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chargePointPk) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("charge_point_capabilities" as any)
      .select("supported_measurands, last_probed_at, raw_config")
      .eq("charge_point_id", chargePointPk)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCaps((data ?? null) as unknown as OcppCapabilities | null);
        setLoading(false);
      });

    const channel = supabase
      .channel(`ocpp-caps-${chargePointPk}`)
      .on(
        "postgres_changes" as const,
        {
          event: "*",
          schema: "public",
          table: "charge_point_capabilities",
          filter: `charge_point_id=eq.${chargePointPk}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        (payload: { new: OcppCapabilities }) => setCaps(payload.new),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [chargePointPk]);

  return { capabilities: caps, loading };
}
