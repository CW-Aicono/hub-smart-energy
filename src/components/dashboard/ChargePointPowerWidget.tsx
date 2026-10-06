import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlugZap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { normalizeConnectorStatus } from "@/lib/formatCharging";

const STATUS_LABEL: Record<string, string> = {
  available: "Frei",
  charging: "Lädt",
  offline: "Offline",
  faulted: "Störung",
  unavailable: "Nicht verfügbar",
};

/** Aktuelle Ladeleistung je Ladepunkt (letzter OCPP-Messwert Power.Active.Import). */
export default function ChargePointPowerWidget() {
  const { tenant } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-cp-power", tenant?.id],
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: cps, error } = await supabase
        .from("charge_points")
        .select("id, name, status, ws_connected, max_power_kw")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data: samples } = await supabase
        .from("ocpp_meter_samples")
        .select("charge_point_id, value, unit, phase, sampled_at")
        .eq("tenant_id", tenant!.id)
        .eq("measurand", "Power.Active.Import")
        .gte("sampled_at", since)
        .order("sampled_at", { ascending: false })
        .limit(2000);
      const latest = new Map<string, number>();
      for (const s of samples ?? []) {
        if (s.phase || !s.charge_point_id || latest.has(s.charge_point_id)) continue;
        const v = Number(s.value);
        latest.set(s.charge_point_id, String(s.unit ?? "W").toLowerCase() === "kw" ? v : v / 1000);
      }
      return (cps ?? []).map((cp) => {
        const status = normalizeConnectorStatus(cp.status, cp.ws_connected !== false);
        const kw = status === "charging" ? latest.get(cp.id) ?? null : status === "offline" ? null : 0;
        return { ...cp, status, kw };
      });
    },
  });

  const total = (data ?? []).reduce((s, c) => s + (c.kw ?? 0), 0);
  const fmt = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-primary" /> Ladeleistung je Ladepunkt
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">Gesamt {fmt(total)} kW</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Keine Ladepunkte vorhanden.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((cp) => (
              <div key={cp.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{cp.name}</p>
                  <Badge variant={cp.status === "charging" ? "default" : "secondary"} className="mt-1">
                    {STATUS_LABEL[cp.status] ?? cp.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums">{cp.kw == null ? "–" : fmt(cp.kw)}</p>
                  <p className="text-xs text-muted-foreground">
                    kW{cp.max_power_kw ? ` / ${fmt(Number(cp.max_power_kw))}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
