import { useQuery } from "@tanstack/react-query";
import { Radio, Activity, RefreshCw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface LoxoneWsStatusProps {
  locationIntegrationId: string;
  enabled: boolean;
}

interface WsSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  events_received: number | null;
  reconnect_count: number | null;
  worker_host: string | null;
  disconnect_reason: string | null;
}

export function LoxoneWsStatus({ locationIntegrationId, enabled }: LoxoneWsStatusProps) {
  const { data: session } = useQuery({
    queryKey: ["loxone-ws-session", locationIntegrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loxone_ws_session_log")
        .select("id, started_at, ended_at, updated_at, events_received, reconnect_count, worker_host, disconnect_reason")
        .eq("location_integration_id", locationIntegrationId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WsSession | null;
    },
    enabled,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  if (!enabled) return null;

  // Status-Logik:
  // - Aktiv = ended_at IS NULL UND updated_at < 60s alt
  // - Stale = ended_at IS NULL aber kein Heartbeat seit >60s
  // - Getrennt = ended_at IS NOT NULL
  let statusColor = "text-muted-foreground";
  let statusLabel = "Keine WS-Verbindung";
  let StatusIcon: typeof Radio = AlertCircle;

  if (session) {
    const updatedMs = Date.now() - new Date(session.updated_at).getTime();
    if (!session.ended_at && updatedMs < 60_000) {
      statusColor = "text-green-600 dark:text-green-400";
      statusLabel = "WebSocket aktiv";
      StatusIcon = Radio;
    } else if (!session.ended_at) {
      statusColor = "text-amber-600 dark:text-amber-400";
      statusLabel = `WebSocket stale (kein Heartbeat seit ${Math.round(updatedMs / 1000)}s)`;
      StatusIcon = AlertCircle;
    } else {
      statusColor = "text-muted-foreground";
      statusLabel = `Getrennt: ${session.disconnect_reason ?? "unbekannt"}`;
      StatusIcon = AlertCircle;
    }
  }

  const events = (session?.events_received ?? 0).toLocaleString("de-DE");
  const reconnects = session?.reconnect_count ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
      <span className={`flex items-center gap-1 text-xs font-medium ${statusColor}`}>
        <StatusIcon className="h-3 w-3" />
        <span>BETA · {statusLabel}</span>
      </span>
      {session && (
        <>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span className="font-medium">Events:</span>
            <span>{events}</span>
          </span>
          {reconnects > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              <span className="font-medium">Reconnects:</span>
              <span>{reconnects.toLocaleString("de-DE")}</span>
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            seit {formatDistanceToNow(new Date(session.started_at), { addSuffix: true, locale: de })}
            {session.worker_host && ` · ${session.worker_host}`}
          </span>
        </>
      )}
    </div>
  );
}
