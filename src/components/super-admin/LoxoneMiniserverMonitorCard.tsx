import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Activity, AlertCircle, RefreshCw, Server } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface SessionRow {
  id: string;
  tenant_id: string;
  location_integration_id: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  events_received: number | null;
  reconnect_count: number | null;
  worker_host: string | null;
  disconnect_reason: string | null;
}

interface IntegrationInfo {
  id: string;
  tenant_name: string;
  location_name: string;
}

interface MiniserverRow {
  integrationId: string;
  tenantName: string;
  locationName: string;
  current: SessionRow | null;
  sessionsLast24h: number;
  reconnectsLast24h: number;
  eventsLast24h: number;
  uptimeRatio24h: number; // 0..1
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const FRESH_HEARTBEAT_MS = 45_000;

async function fetchData(): Promise<MiniserverRow[]> {
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // 1. All sessions from the last 24h (and currently open sessions, even if older)
  const { data: sessions, error: sErr } = await supabase
    .from("loxone_ws_session_log")
    .select(
      "id, tenant_id, location_integration_id, started_at, ended_at, updated_at, events_received, reconnect_count, worker_host, disconnect_reason"
    )
    .or(`started_at.gte.${sinceIso},ended_at.is.null`)
    .order("started_at", { ascending: false });

  if (sErr) throw sErr;
  const rows = (sessions ?? []) as SessionRow[];

  const integrationIds = Array.from(new Set(rows.map((r) => r.location_integration_id)));
  if (integrationIds.length === 0) return [];

  // 2. Resolve location + tenant names
  const { data: integrations, error: iErr } = await supabase
    .from("location_integrations")
    .select("id, locations!inner(name, tenants!inner(name))")
    .in("id", integrationIds);
  if (iErr) throw iErr;

  const infoMap = new Map<string, IntegrationInfo>();
  (integrations ?? []).forEach((it: any) => {
    infoMap.set(it.id, {
      id: it.id,
      tenant_name: it.locations?.tenants?.name ?? "—",
      location_name: it.locations?.name ?? "—",
    });
  });

  const now = Date.now();
  const result: MiniserverRow[] = [];

  for (const intId of integrationIds) {
    const integrationSessions = rows.filter((r) => r.location_integration_id === intId);
    if (integrationSessions.length === 0) continue;
    const current = integrationSessions[0]; // newest first

    // Aggregate over the last 24h window (clip session boundaries to [windowStart, now])
    const windowStart = now - LOOKBACK_MS;
    let onlineMs = 0;
    let sessionsLast24h = 0;
    let reconnectsLast24h = 0;
    let eventsLast24h = 0;
    for (const s of integrationSessions) {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
      const clippedStart = Math.max(start, windowStart);
      const clippedEnd = Math.max(clippedStart, Math.min(end, now));
      if (clippedEnd > clippedStart) {
        onlineMs += clippedEnd - clippedStart;
        sessionsLast24h++;
        reconnectsLast24h += s.reconnect_count ?? 0;
        eventsLast24h += s.events_received ?? 0;
      }
    }

    const info = infoMap.get(intId);
    result.push({
      integrationId: intId,
      tenantName: info?.tenant_name ?? "—",
      locationName: info?.location_name ?? "—",
      current,
      sessionsLast24h,
      reconnectsLast24h,
      eventsLast24h,
      uptimeRatio24h: Math.min(1, onlineMs / LOOKBACK_MS),
    });
  }

  // Sort: active first, then by location name
  result.sort((a, b) => {
    const aActive = a.current && !a.current.ended_at ? 0 : 1;
    const bActive = b.current && !b.current.ended_at ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.locationName.localeCompare(b.locationName);
  });
  return result;
}

function statusBadge(s: SessionRow | null) {
  if (!s) {
    return (
      <Badge variant="secondary">
        <AlertCircle className="h-3 w-3 mr-1" />
        Keine Sitzung
      </Badge>
    );
  }
  const heartbeatAge = Date.now() - new Date(s.updated_at).getTime();
  if (!s.ended_at && heartbeatAge < FRESH_HEARTBEAT_MS) {
    return (
      <Badge className="bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400 hover:bg-green-500/15">
        <Radio className="h-3 w-3 mr-1" />
        Aktiv
      </Badge>
    );
  }
  if (!s.ended_at) {
    return (
      <Badge variant="secondary" className="text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3 w-3 mr-1" />
        Stale ({Math.round(heartbeatAge / 1000)}s)
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertCircle className="h-3 w-3 mr-1" />
      Getrennt
    </Badge>
  );
}

export default function LoxoneMiniserverMonitorCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["loxone-miniserver-monitor"],
    queryFn: fetchData,
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4" />
          Loxone Miniserver – WebSocket-Monitor
          <Badge variant="outline" className="ml-2">BETA</Badge>
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            Aktuelle Sitzung + Statistik der letzten 24 h
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <div className="text-sm text-destructive">Fehler beim Laden: {(error as Error).message}</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Keine WebSocket-Sitzungen in den letzten 24 Stunden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Tenant</th>
                  <th className="text-left py-2 pr-3 font-medium">Liegenschaft</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-left py-2 pr-3 font-medium">Verbunden seit</th>
                  <th className="text-left py-2 pr-3 font-medium">Letzter Heartbeat</th>
                  <th className="text-right py-2 pr-3 font-medium">Events (Sitzung)</th>
                  <th className="text-right py-2 pr-3 font-medium">Reconnects 24 h</th>
                  <th className="text-right py-2 pr-3 font-medium">Uptime 24 h</th>
                  <th className="text-right py-2 pr-3 font-medium">Sitzungen 24 h</th>
                  <th className="text-left py-2 pr-3 font-medium">Worker</th>
                  <th className="text-left py-2 font-medium">Letzter Disconnect</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const s = row.current;
                  const heartbeatAge = s ? Date.now() - new Date(s.updated_at).getTime() : null;
                  const startedSince = s
                    ? formatDistanceToNow(new Date(s.started_at), { addSuffix: false, locale: de })
                    : "—";
                  return (
                    <tr key={row.integrationId} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="py-2 pr-3 font-medium">{row.tenantName}</td>
                      <td className="py-2 pr-3">{row.locationName}</td>
                      <td className="py-2 pr-3">{statusBadge(s)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {s && !s.ended_at ? startedSince : "—"}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {heartbeatAge != null ? `vor ${Math.round(heartbeatAge / 1000)} s` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Activity className="h-3 w-3 text-muted-foreground" />
                          {(s?.events_received ?? 0).toLocaleString("de-DE")}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 text-muted-foreground" />
                          {row.reconnectsLast24h.toLocaleString("de-DE")}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {(row.uptimeRatio24h * 100).toLocaleString("de-DE", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        {" %"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.sessionsLast24h.toLocaleString("de-DE")}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs">
                        {s?.worker_host ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {s?.disconnect_reason ?? (s && !s.ended_at ? "—" : "unbekannt")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
