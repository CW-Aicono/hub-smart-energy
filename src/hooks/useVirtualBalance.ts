/**
 * useVirtualBalance
 *
 * Liest die Live-Bilanz eines virtuellen Zählers (capture_type='virtual') und
 * liefert eine Aufschlüsselung pro Quelle plus die Summe. Aktualisiert sich
 * über Realtime, sobald:
 *   • ein Simulationszähler in simulation_meter_state geändert wird, oder
 *   • ein Ladepunkt eine neue Leistungsmessung in ocpp_meter_samples meldet.
 *
 * Wallbox-Quellen (charge_point / group / all-cps) werden direkt aus den
 * letzten 5 Min ocpp_meter_samples (Power.Active.Import − Export) berechnet,
 * Sim-Quellen aus simulation_meter_state, alle anderen Zähler aus
 * meter_power_readings_5min / meter_power_readings.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Meter } from "@/hooks/useMeters";

export type BalanceSourceKind = "meter" | "sim" | "charge_point" | "charge_point_group" | "all_charge_points";

export interface BalanceSourceRow {
  key: string;
  sign: "+" | "-";
  kind: BalanceSourceKind;
  label: string;
  /** kW. Positive = consumption, negative = feed-in. null = unbekannt. */
  valueKw: number | null;
  /** für Sim-Quellen: zugehörige Meter-Id (für Slider-Steuerung) */
  simMeterId?: string;
}

interface VirtualSourceRaw {
  operator: "+" | "-";
  source_meter_id: string | null;
  source_charge_point_id: string | null;
  source_charge_point_group_id: string | null;
  source_all_charge_points: boolean;
  sort_order: number;
}

interface ChargePointRow {
  id: string;
  name: string;
  group_id: string | null;
  location_id: string | null;
}
interface ChargePointGroupRow {
  id: string;
  name: string;
}

const RECENT_WINDOW_MIN = 5;

async function fetchCpLivePowerKw(cpIds: string[]): Promise<Record<string, number>> {
  if (cpIds.length === 0) return {};
  const since = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data } = await supabase
    .from("ocpp_meter_samples" as any)
    .select("charge_point_id, measurand, unit, value, sampled_at")
    .in("charge_point_id", cpIds)
    .in("measurand", ["Power.Active.Import", "Power.Active.Export"])
    .gte("sampled_at", since)
    .order("sampled_at", { ascending: false });
  const seen = new Map<string, { imp?: number; exp?: number }>();
  ((data ?? []) as any[]).forEach((row) => {
    const e = seen.get(row.charge_point_id) ?? {};
    const kw = row.unit === "kW" ? Number(row.value) : Number(row.value) / 1000;
    if (row.measurand === "Power.Active.Import" && e.imp === undefined) e.imp = kw;
    if (row.measurand === "Power.Active.Export" && e.exp === undefined) e.exp = kw;
    seen.set(row.charge_point_id, e);
  });
  const out: Record<string, number> = {};
  cpIds.forEach((id) => {
    const v = seen.get(id);
    out[id] = (v?.imp ?? 0) - (v?.exp ?? 0);
  });
  return out;
}

async function fetchPlainMeterKw(meterId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data: agg } = await (supabase as any)
    .from("meter_power_readings_5min")
    .select("power_avg")
    .eq("meter_id", meterId)
    .gte("bucket", cutoff)
    .order("bucket", { ascending: false })
    .limit(1);
  if (agg && agg.length > 0) return Number(agg[0].power_avg);
  const { data: raw } = await (supabase as any)
    .from("meter_power_readings")
    .select("power_value")
    .eq("meter_id", meterId)
    .gte("recorded_at", cutoff)
    .order("recorded_at", { ascending: false })
    .limit(1);
  return raw && raw.length > 0 ? Number(raw[0].power_value) : null;
}

async function fetchSimKw(meterId: string, simUnit: string | null | undefined): Promise<number> {
  const { data } = await (supabase as any)
    .from("simulation_meter_state")
    .select("current_value")
    .eq("meter_id", meterId)
    .maybeSingle();
  if (!data) return 0;
  const raw = Number(data.current_value);
  return String(simUnit ?? "kW").toLowerCase() === "w" ? raw / 1000 : raw;
}

interface UseVirtualBalanceOpts {
  meter: Meter;
  allMeters: Meter[];
}

export function useVirtualBalance({ meter, allMeters }: UseVirtualBalanceOpts) {
  const enabled = meter.capture_type === "virtual";

  // Sources for this virtual meter
  const sourcesQuery = useQuery({
    queryKey: ["virtual-balance-sources", meter.id],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<VirtualSourceRaw[]> => {
      const { data, error } = await supabase
        .from("virtual_meter_sources" as any)
        .select(
          "operator, source_meter_id, source_charge_point_id, source_charge_point_group_id, source_all_charge_points, sort_order",
        )
        .eq("virtual_meter_id", meter.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const sources = sourcesQuery.data ?? [];
  const needsCpContext = useMemo(
    () =>
      sources.some(
        (s) => s.source_charge_point_id || s.source_charge_point_group_id || s.source_all_charge_points,
      ),
    [sources],
  );

  // Charge points + groups (for labels and "all-CP" expansion)
  const cpContextQuery = useQuery({
    queryKey: ["virtual-balance-cp-context", meter.tenant_id, meter.location_id],
    enabled: enabled && needsCpContext,
    staleTime: 60_000,
    queryFn: async (): Promise<{ cps: ChargePointRow[]; groups: ChargePointGroupRow[] }> => {
      const [{ data: cps }, { data: groups }] = await Promise.all([
        supabase.from("charge_points").select("id, name, group_id, location_id").eq("tenant_id", meter.tenant_id),
        supabase.from("charge_point_groups").select("id, name").eq("tenant_id", meter.tenant_id),
      ]);
      return {
        cps: ((cps ?? []) as any) as ChargePointRow[],
        groups: ((groups ?? []) as any) as ChargePointGroupRow[],
      };
    },
  });
  const cps = cpContextQuery.data?.cps ?? [];
  const cpGroups = cpContextQuery.data?.groups ?? [];

  // Concrete CP ids that contribute to this virtual meter
  const involvedCpIds = useMemo(() => {
    const ids = new Set<string>();
    sources.forEach((s) => {
      if (s.source_charge_point_id) ids.add(s.source_charge_point_id);
      else if (s.source_charge_point_group_id) {
        cps.filter((c) => c.group_id === s.source_charge_point_group_id).forEach((c) => ids.add(c.id));
      } else if (s.source_all_charge_points) {
        cps.filter((c) => c.location_id === meter.location_id).forEach((c) => ids.add(c.id));
      }
    });
    return Array.from(ids);
  }, [sources, cps, meter.location_id]);

  // Initial live values for all sources
  const [tick, setTick] = useState(0);
  const valuesQuery = useQuery({
    queryKey: ["virtual-balance-values", meter.id, sources.length, involvedCpIds.join(","), tick],
    enabled: enabled && (sources.length > 0),
    staleTime: 5_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const cpLive = await fetchCpLivePowerKw(involvedCpIds);

      const rows: BalanceSourceRow[] = [];
      for (const s of sources) {
        if (s.source_meter_id) {
          const src = allMeters.find((m) => m.id === s.source_meter_id);
          const isSim = src?.capture_type === "simulation";
          const v = isSim
            ? await fetchSimKw(s.source_meter_id, src?.sim_unit ?? null)
            : await fetchPlainMeterKw(s.source_meter_id);
          rows.push({
            key: `meter:${s.source_meter_id}`,
            sign: s.operator,
            kind: isSim ? "sim" : "meter",
            label: src?.name ?? "Unbekannter Zähler",
            valueKw: v,
            simMeterId: isSim ? s.source_meter_id : undefined,
          });
        } else if (s.source_charge_point_id) {
          const cp = cps.find((c) => c.id === s.source_charge_point_id);
          rows.push({
            key: `cp:${s.source_charge_point_id}`,
            sign: s.operator,
            kind: "charge_point",
            label: cp?.name ?? "Unbekannter Ladepunkt",
            valueKw: cpLive[s.source_charge_point_id] ?? 0,
          });
        } else if (s.source_charge_point_group_id) {
          const g = cpGroups.find((x) => x.id === s.source_charge_point_group_id);
          const sum = cps
            .filter((c) => c.group_id === s.source_charge_point_group_id)
            .reduce((acc, c) => acc + (cpLive[c.id] ?? 0), 0);
          rows.push({
            key: `cpg:${s.source_charge_point_group_id}`,
            sign: s.operator,
            kind: "charge_point_group",
            label: g?.name ?? "Ladepunkt-Gruppe",
            valueKw: sum,
          });
        } else if (s.source_all_charge_points) {
          const sum = cps
            .filter((c) => c.location_id === meter.location_id)
            .reduce((acc, c) => acc + (cpLive[c.id] ?? 0), 0);
          rows.push({
            key: "all-cps",
            sign: s.operator,
            kind: "all_charge_points",
            label: "Alle Ladepunkte der Liegenschaft",
            valueKw: sum,
          });
        }
      }

      let total: number | null = 0;
      let anyResolved = false;
      for (const r of rows) {
        if (r.valueKw === null) continue;
        anyResolved = true;
        total += r.sign === "-" ? -r.valueKw : r.valueKw;
      }
      return { rows, total: anyResolved ? total : null };
    },
  });

  // Realtime: re-fetch on sim_state change for any involved sim source
  const simSourceIds = useMemo(
    () =>
      sources
        .map((s) => s.source_meter_id)
        .filter((id): id is string => !!id)
        .filter((id) => allMeters.find((m) => m.id === id)?.capture_type === "simulation"),
    [sources, allMeters],
  );
  const simKey = simSourceIds.sort().join(",");
  useEffect(() => {
    if (!enabled || simSourceIds.length === 0) return;
    const channel = supabase
      .channel(`virtual-balance-sim-${meter.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "simulation_meter_state" },
        (payload: any) => {
          const id = payload.new?.meter_id ?? payload.old?.meter_id;
          if (id && simSourceIds.includes(id)) setTick((t) => t + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, simKey, meter.id]);

  // Realtime: re-fetch on new ocpp samples for involved CPs (lightweight: just bump tick)
  const cpKey = involvedCpIds.sort().join(",");
  useEffect(() => {
    if (!enabled || involvedCpIds.length === 0) return;
    const channel = supabase
      .channel(`virtual-balance-cp-${meter.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ocpp_meter_samples" },
        (payload: any) => {
          const id = payload.new?.charge_point_id;
          if (id && involvedCpIds.includes(id)) setTick((t) => t + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cpKey, meter.id]);

  return {
    rows: valuesQuery.data?.rows ?? [],
    total: valuesQuery.data?.total ?? null,
    loading: sourcesQuery.isLoading || valuesQuery.isLoading,
    /** true wenn mindestens eine Quelle ein Simulationszähler ist */
    hasSimSources: simSourceIds.length > 0,
    refresh: () => setTick((t) => t + 1),
  };
}
