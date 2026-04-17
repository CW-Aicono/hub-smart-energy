import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Activity, AlertTriangle, CheckCircle2, ServerCrash } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface WorkerStatus {
  success: boolean;
  worker_active_flag: boolean;
  last_heartbeat: string | null;
  heartbeat_fresh: boolean;
  heartbeat_age_seconds: number | null;
  inserts_last_5min: number;
  active_devices: number;
  worker_meta: { worker_id?: string; version?: string; last_seen?: string } | null;
  checked_at: string;
}

async function fetchStatus(): Promise<WorkerStatus> {
  const { data, error } = await supabase.functions.invoke("gateway-worker-status");
  if (error) throw error;
  return data;
}

async function setWorkerActive(value: boolean) {
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key: "worker_active", value: value ? "true" : "false" }, { onConflict: "key" });
  if (error) throw error;
}

export default function GatewayWorkerStatusCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["gateway-worker-status"],
    queryFn: fetchStatus,
    refetchInterval: 15_000,
  });

  const toggle = useMutation({
    mutationFn: setWorkerActive,
    onSuccess: () => {
      toast.success("Worker-Flag aktualisiert");
      qc.invalidateQueries({ queryKey: ["gateway-worker-status"] });
    },
    onError: (e: any) => toast.error(`Fehler: ${e.message || e}`),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Gateway-Worker</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const fresh = data?.heartbeat_fresh ?? false;
  const flagOn = data?.worker_active_flag ?? false;
  // Status colors: worker primary writer = green, flag off but heartbeat = yellow, no heartbeat = red
  let statusBadge: React.ReactNode;
  if (flagOn && fresh) {
    statusBadge = <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Aktiv (primär)</Badge>;
  } else if (fresh) {
    statusBadge = <Badge variant="secondary"><Activity className="h-3 w-3 mr-1" />Heartbeat OK – Flag aus</Badge>;
  } else if (data?.last_heartbeat) {
    statusBadge = <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Heartbeat veraltet</Badge>;
  } else {
    statusBadge = <Badge variant="destructive"><ServerCrash className="h-3 w-3 mr-1" />Kein Worker</Badge>;
  }

  const heartbeatLabel = data?.last_heartbeat
    ? formatDistanceToNow(new Date(data.last_heartbeat), { addSuffix: true, locale: de })
    : "noch nie";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Gateway-Worker (Hetzner)
          <span className="ml-auto">{statusBadge}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Letzter Heartbeat</p>
            <p className="font-semibold">{heartbeatLabel}</p>
            {data?.heartbeat_age_seconds !== null && data?.heartbeat_age_seconds !== undefined && (
              <p className="text-xs text-muted-foreground">{data.heartbeat_age_seconds}s</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Inserts (5 Min)</p>
            <p className="font-semibold">{data?.inserts_last_5min ?? 0}</p>
            <p className="text-xs text-muted-foreground">meter_power_readings</p>
          </div>
          <div>
            <p className="text-muted-foreground">Aktive Geräte-HUBs</p>
            <p className="font-semibold">{data?.active_devices ?? 0}</p>
            <p className="text-xs text-muted-foreground">HA-Add-ons (5 Min)</p>
          </div>
          <div>
            <p className="text-muted-foreground">Worker-Version</p>
            <p className="font-semibold">{data?.worker_meta?.version || "—"}</p>
            {data?.worker_meta?.worker_id && (
              <p className="text-xs text-muted-foreground truncate">{data.worker_meta.worker_id}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
          <div className="space-y-0.5">
            <Label htmlFor="worker-active-toggle" className="text-sm font-medium">
              Worker als primäre Datenquelle
            </Label>
            <p className="text-xs text-muted-foreground">
              Wenn aktiv und Heartbeat &lt; 5 Min: Edge Functions (loxone-api) überspringen den Schreibpfad.
              Bei stillem Worker schreiben sie automatisch wieder (Sicherheits-Fallback).
            </p>
          </div>
          <Switch
            id="worker-active-toggle"
            checked={flagOn}
            onCheckedChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending}
          />
        </div>

        {flagOn && !fresh && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Achtung:</strong> Flag ist aktiv, aber kein frischer Heartbeat. Edge Functions schreiben weiterhin als Fallback.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
