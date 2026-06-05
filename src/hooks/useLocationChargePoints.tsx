import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export interface LocationChargePoint {
  id: string;
  name: string;
  ocpp_id: string | null;
  status: string;
  ws_connected: boolean;
  last_heartbeat: string | null;
  max_power_kw: number;
  connector_count: number;
  vendor: string | null;
  model: string | null;
  direct_location_id: string | null;
  group_id: string | null;
  group_name: string | null;
  group_location_id: string | null;
  /** "direct" wenn dem Standort direkt zugeordnet, "group" wenn über Gruppe. */
  assignment_source: "direct" | "group";
  /** Summe kWh aus allen abgeschlossenen Ladevorgängen. */
  total_kwh: number;
  /** Summe kWh in den letzten 30 Tagen. */
  kwh_last_30d: number;
  /** Zeitpunkt des letzten Ladevorgangs (Start). */
  last_session_at: string | null;
}

/**
 * Liefert alle Ladepunkte, die effektiv dieser Liegenschaft zugeordnet sind –
 * entweder direkt (`charge_points.location_id`) oder via Gruppe
 * (`charge_point_groups.location_id`). Inklusive aggregierter Messdaten
 * aus `charging_sessions`.
 */
export function useLocationChargePoints(locationId?: string) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["location-charge-points", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    staleTime: 30_000,
    queryFn: async (): Promise<LocationChargePoint[]> => {
      // 1) Gruppen dieser Liegenschaft holen
      const { data: groups, error: gErr } = await (supabase
        .from("charge_point_groups") as any)
        .select("id, name, location_id")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId!);
      if (gErr) throw gErr;
      const groupIds = (groups ?? []).map((g: any) => g.id as string);
      const groupMap = new Map<string, { name: string; location_id: string }>();
      (groups ?? []).forEach((g: any) =>
        groupMap.set(g.id, { name: g.name, location_id: g.location_id }),
      );

      // 2) Ladepunkte: direkt zugeordnet ODER Mitglied einer der Gruppen
      let q = supabase
        .from("charge_points")
        .select(
          "id, name, ocpp_id, status, ws_connected, last_heartbeat, max_power_kw, connector_count, vendor, model, location_id, group_id",
        )
        .eq("tenant_id", tenant!.id);

      if (groupIds.length > 0) {
        q = q.or(
          `location_id.eq.${locationId},group_id.in.(${groupIds.join(",")})`,
        );
      } else {
        q = q.eq("location_id", locationId!);
      }

      const { data: cps, error: cpErr } = await q.order("name");
      if (cpErr) throw cpErr;
      const cpRows = (cps ?? []) as any[];
      if (cpRows.length === 0) return [];

      // 3) Aggregierte Sessions je Ladepunkt
      const cpIds = cpRows.map((r) => r.id as string);
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions, error: sErr } = await supabase
        .from("charging_sessions")
        .select("charge_point_id, energy_kwh, start_time")
        .eq("tenant_id", tenant!.id)
        .in("charge_point_id", cpIds);
      if (sErr) throw sErr;

      const aggMap = new Map<string, { total: number; last30: number; last: string | null }>();
      (sessions ?? []).forEach((s: any) => {
        const agg = aggMap.get(s.charge_point_id) ?? { total: 0, last30: 0, last: null };
        const kwh = Number(s.energy_kwh ?? 0);
        agg.total += kwh;
        if (s.start_time && s.start_time >= since30d) agg.last30 += kwh;
        if (!agg.last || (s.start_time && s.start_time > agg.last)) agg.last = s.start_time;
        aggMap.set(s.charge_point_id, agg);
      });

      return cpRows.map((cp): LocationChargePoint => {
        const isDirect = cp.location_id === locationId;
        const grp = cp.group_id ? groupMap.get(cp.group_id) : undefined;
        const agg = aggMap.get(cp.id);
        return {
          id: cp.id,
          name: cp.name,
          ocpp_id: cp.ocpp_id,
          status: cp.status,
          ws_connected: !!cp.ws_connected,
          last_heartbeat: cp.last_heartbeat,
          max_power_kw: Number(cp.max_power_kw ?? 0),
          connector_count: Number(cp.connector_count ?? 1),
          vendor: cp.vendor,
          model: cp.model,
          direct_location_id: cp.location_id,
          group_id: cp.group_id,
          group_name: grp?.name ?? null,
          group_location_id: grp?.location_id ?? null,
          assignment_source: isDirect ? "direct" : "group",
          total_kwh: agg?.total ?? 0,
          kwh_last_30d: agg?.last30 ?? 0,
          last_session_at: agg?.last ?? null,
        };
      });
    },
  });
}
