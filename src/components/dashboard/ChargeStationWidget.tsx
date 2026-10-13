import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BatteryCharging, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { normalizeConnectorStatus } from "@/lib/formatCharging";

const STATUS_LABEL: Record<string, string> = {
  available: "Verfügbar",
  charging: "Lädt",
  offline: "Offline",
  faulted: "Fehler",
  unavailable: "Nicht verfügbar",
};

const nf = (v: number, d = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPower = (w: number | null) => (w == null ? "–" : w >= 1000 ? `${nf(w / 1000, 2)} kW` : `${nf(w, 0)} W`);
const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
};

type Sample = { charge_point_id: string | null; measurand: string | null; value: number | string | null; unit: string | null; phase: string | null; sampled_at: string };

/**
 * Ladestation-Kachel: je Ladepunkt alle wichtigen Leistungen und Zustände
 * (Leistung, Status, Verbindung, Zählerstand, laufender Ladevorgang).
 */
export default function ChargeStationWidget() {
  const { tenant } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-charge-station", tenant?.id],
    enabled: !!tenant?.id,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: cps, error } = await supabase
        .from("charge_points")
        .select("id, name, status, ws_connected, max_power_kw, last_heartbeat")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const [{ data: samples }, { data: sessions }] = await Promise.all([
        supabase
          .from("ocpp_meter_samples")
          .select("charge_point_id, measurand, value, unit, phase, sampled_at")
          .eq("tenant_id", tenant!.id)
          .in("measurand", ["Power.Active.Import", "Energy.Active.Import.Register", "Current.Import", "Voltage", "SoC"])
          .gte("sampled_at", since)
          .order("sampled_at", { ascending: false })
          .limit(3000),
        supabase
          .from("charging_sessions")
          .select("charge_point_id, id_tag, start_time, meter_start, energy_kwh, status")
          .eq("tenant_id", tenant!.id)
          .is("stop_time", null)
          .order("start_time", { ascending: false })
          .limit(200),
      ]);
      const latest = new Map<string, Sample>();
      for (const s of (samples ?? []) as Sample[]) {
        if (!s.charge_point_id || s.phase) continue;
        const k = `${s.charge_point_id}|${s.measurand}`;
        if (!latest.has(k)) latest.set(k, s);
      }
      const val = (cp: string, m: string) => {
        const s = latest.get(`${cp}|${m}`);
        if (!s) return null;
        const v = Number(s.value);
        const u = String(s.unit ?? "").toLowerCase();
        if (m === "Power.Active.Import") return u === "kw" ? v * 1000 : v; // W
        if (m === "Energy.Active.Import.Register") return u === "wh" || u === "" ? v / 1000 : v; // kWh
        return v;
      };
      const sessByCp = new Map<string, any>();
      for (const s of sessions ?? []) if (s.charge_point_id && !sessByCp.has(s.charge_point_id)) sessByCp.set(s.charge_point_id, s);
      return (cps ?? []).map((cp: any) => {
        const online = cp.ws_connected !== false;
        const status = normalizeConnectorStatus(cp.status, online);
        const powerW = status === "charging" ? val(cp.id, "Power.Active.Import") : status === "offline" ? null : 0;
        const registerKwh = val(cp.id, "Energy.Active.Import.Register");
        const sess = sessByCp.get(cp.id);
        let sessKwh: number | null = null;
        if (sess) {
          if (registerKwh != null && sess.meter_start != null) sessKwh = Math.max(0, registerKwh - Number(sess.meter_start) / 1000);
          else if (sess.energy_kwh != null) sessKwh = Number(sess.energy_kwh);
        }
        return {
          id: cp.id as string, name: cp.name as string, status, online,
          maxKw: cp.max_power_kw ? Number(cp.max_power_kw) : null,
          powerW, registerKwh,
          current: val(cp.id, "Current.Import"), voltage: val(cp.id, "Voltage"), soc: val(cp.id, "SoC"),
          heartbeat: cp.last_heartbeat as string | null,
          session: sess ? { idTag: sess.id_tag as string | null, start: sess.start_time as string, kwh: sessKwh } : null,
        };
      });
    },
  });

  const totalW = (data ?? []).reduce((s, c) => s + (c.powerW ?? 0), 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <BatteryCharging className="h-4 w-4 text-primary" /> Ladestationen
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">Gesamt {fmtPower(totalW)}</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Keine Ladepunkte vorhanden.</p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {data.map((cp) => (
              <div key={cp.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium truncate" title={cp.name}>{cp.name}</p>
                  {cp.online ? <Wifi className="h-4 w-4 text-primary shrink-0" /> : <WifiOff className="h-4 w-4 text-destructive shrink-0" />}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <Badge variant={cp.status === "charging" ? "default" : cp.status === "faulted" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[cp.status] ?? cp.status}
                  </Badge>
                  <div className="text-right">
                    <p className="text-xl font-bold tabular-nums leading-none">{fmtPower(cp.powerW)}</p>
                    {cp.maxKw != null && <p className="text-xs text-muted-foreground">max. {nf(cp.maxKw)} kW</p>}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Zählerstand</dt>
                  <dd className="text-right tabular-nums">{cp.registerKwh == null ? "–" : `${nf(cp.registerKwh, 2)} kWh`}</dd>
                  {cp.current != null && (<><dt className="text-muted-foreground">Strom</dt><dd className="text-right tabular-nums">{nf(cp.current)} A</dd></>)}
                  {cp.voltage != null && (<><dt className="text-muted-foreground">Spannung</dt><dd className="text-right tabular-nums">{nf(cp.voltage, 0)} V</dd></>)}
                  {cp.soc != null && (<><dt className="text-muted-foreground">Ladestand</dt><dd className="text-right tabular-nums">{nf(cp.soc, 0)} %</dd></>)}
                  {cp.session && (
                    <>
                      <dt className="text-muted-foreground">Ladevorgang</dt>
                      <dd className="text-right tabular-nums">{fmtDur(Date.now() - new Date(cp.session.start).getTime())}</dd>
                      <dt className="text-muted-foreground">Geladen</dt>
                      <dd className="text-right tabular-nums">{cp.session.kwh == null ? "–" : `${nf(cp.session.kwh, 2)} kWh`}</dd>
                      {cp.session.idTag && (<><dt className="text-muted-foreground">ID-Tag</dt><dd className="text-right truncate" title={cp.session.idTag}>{cp.session.idTag}</dd></>)}
                    </>
                  )}
                  {cp.heartbeat && (
                    <>
                      <dt className="text-muted-foreground">Letztes Signal</dt>
                      <dd className="text-right tabular-nums">{new Date(cp.heartbeat).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
