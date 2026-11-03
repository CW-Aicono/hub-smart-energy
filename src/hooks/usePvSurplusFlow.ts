import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";
import type { SeriesPoint } from "@/lib/pvFlow";

export interface PvFlowConfig {
  id: string;
  group_id: string | null;
  charge_point_id: string | null;
  reference_meter_id: string | null;
  storage_id?: string | null;
  storage_coupled?: boolean | null;
  storage_priority?: string | null;
  min_charge_power_w: number;
  safety_buffer_w: number;
  is_active: boolean;
}

export interface MeterLive {
  id: string;
  name: string;
  meter_function: string | null;
  kw: number | null;
  at: string | null;
}

export interface PvFlowData {
  grid: MeterLive | null;
  pv: MeterLive[];
  ev: (MeterLive & { charge_point_id: string })[];
  storage: {
    id: string; name: string; device_template: string | null; control_mode: string | null;
    soc: number | null; socAt: string | null; setpointKw: number | null; setpointAt: string | null;
    setpointError: string | null; hasOutput: boolean; charge_point_id: string | null;
    meter: MeterLive | null;
  } | null;
  series: SeriesPoint[];
  pvConnectorCount: number;
  chargePointIds: string[];
}

function dayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function readSeries(meterId: string, since: string) {
  const { data } = await supabase
    .from("meter_power_readings_5min")
    .select("bucket, power_avg")
    .eq("meter_id", meterId)
    .gte("bucket", since)
    .order("bucket", { ascending: true })
    .limit(400);
  return (data ?? []) as { bucket: string; power_avg: number | null }[];
}

export function usePvSurplusFlow(config: PvFlowConfig | null | undefined, locationId: string | null | undefined) {
  const { tenantId } = useTenantQuery();
  return useQuery({
    queryKey: ["pv-surplus-flow", tenantId, config?.id, locationId],
    enabled: !!tenantId && !!config && !!locationId,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async (): Promise<PvFlowData> => {
      const since = dayStartIso();
      // Ladepunkte im Geltungsbereich
      let cpQuery = supabase.from("charge_points").select("id").eq("tenant_id", tenantId!);
      cpQuery = config!.group_id ? cpQuery.eq("group_id", config!.group_id) : cpQuery.eq("id", config!.charge_point_id!);
      const { data: cps } = await cpQuery;
      const chargePointIds = (cps ?? []).map((c: any) => c.id as string);

      const [{ data: meters }, storageRes, connRes] = await Promise.all([
        supabase.from("meters").select("id, name, meter_function, source_charge_point_id, is_archived")
          .eq("tenant_id", tenantId!).eq("location_id", locationId!).eq("is_archived", false),
        config!.storage_id
          ? supabase.from("energy_storages").select("id, name, device_template, control_mode, current_soc_pct, soc_updated_at, last_setpoint_kw, last_setpoint_at, last_setpoint_error, setpoint_integration_id, setpoint_control_uuid, power_meter_id, charge_point_id")
              .eq("tenant_id", tenantId!).eq("id", config!.storage_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        chargePointIds.length
          ? supabase.from("charge_point_connectors").select("id, charging_mode").in("charge_point_id", chargePointIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const all = (meters ?? []) as any[];
      const refMeter = all.find((m) => m.id === config!.reference_meter_id) ?? null;
      const pvMeters = all.filter((m) => m.meter_function === "generation");
      const evMeters = all.filter((m) => m.source_charge_point_id && chargePointIds.includes(m.source_charge_point_id));
      const st = (storageRes as any).data;
      const stMeter = st?.power_meter_id ? all.find((m) => m.id === st.power_meter_id) ?? null : null;

      const ids = [refMeter, ...pvMeters, ...evMeters, stMeter].filter(Boolean).map((m: any) => m.id as string);
      const unique = [...new Set(ids)];
      const seriesById: Record<string, { bucket: string; power_avg: number | null }[]> = {};
      await Promise.all(unique.map(async (id) => { seriesById[id] = await readSeries(id, since); }));

      const live = (m: any): MeterLive | null => {
        if (!m) return null;
        const rows = seriesById[m.id] ?? [];
        const last = rows[rows.length - 1];
        return { id: m.id, name: m.name, meter_function: m.meter_function, kw: last?.power_avg ?? null, at: last?.bucket ?? null };
      };

      // Gemeinsame Zeitachse für die Analyse
      const buckets = new Set<string>();
      Object.values(seriesById).forEach((rows) => rows.forEach((r) => buckets.add(r.bucket)));
      const val = (id: string | undefined, b: string) => {
        if (!id) return null;
        const r = (seriesById[id] ?? []).find((x) => x.bucket === b);
        return r?.power_avg ?? null;
      };
      const series: SeriesPoint[] = [...buckets].sort().map((b) => {
        const pvVals = pvMeters.map((m) => val(m.id, b)).filter((v): v is number => v !== null);
        const evVals = evMeters.map((m) => val(m.id, b)).filter((v): v is number => v !== null);
        return {
          t: b,
          gridKw: refMeter ? val(refMeter.id, b) : null,
          pvKw: pvVals.length ? pvVals.reduce((a, c) => a + Math.abs(c), 0) : null,
          evKw: evVals.length ? evVals.reduce((a, c) => a + Math.max(0, c), 0) : null,
          storageKw: stMeter ? val(stMeter.id, b) : null,
        };
      });

      const conns = ((connRes as any).data ?? []) as any[];
      return {
        grid: live(refMeter),
        pv: pvMeters.map(live).filter(Boolean) as MeterLive[],
        ev: evMeters.map((m) => ({ ...(live(m) as MeterLive), charge_point_id: m.source_charge_point_id })),
        storage: st ? {
          id: st.id, name: st.name, device_template: st.device_template, control_mode: st.control_mode,
          soc: st.current_soc_pct, socAt: st.soc_updated_at, setpointKw: st.last_setpoint_kw, setpointAt: st.last_setpoint_at,
          setpointError: st.last_setpoint_error, hasOutput: !!(st.setpoint_integration_id && st.setpoint_control_uuid),
          charge_point_id: st.charge_point_id, meter: live(stMeter),
        } : null,
        series,
        pvConnectorCount: conns.filter((c) => c.charging_mode === "pv_surplus_only" || c.charging_mode === "pv_priority").length,
        chargePointIds,
      };
    },
  });
}

export function usePvDecisionLog(config: PvFlowConfig | null | undefined) {
  const { tenantId } = useTenantQuery();
  return useQuery({
    queryKey: ["pv-decision-log", tenantId, config?.id],
    enabled: !!tenantId && !!config,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase.from("solar_charging_log").select("*").eq("tenant_id", tenantId!)
        .order("executed_at", { ascending: false }).limit(50);
      q = config!.group_id ? q.eq("group_id", config!.group_id) : q.eq("config_id", config!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
