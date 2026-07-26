import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export function SensorHistorySettingsCard() {
  const queryClient = useQueryClient();

  const { data: setting, isLoading } = useQuery({
    queryKey: ["system_settings", "sensor_history_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "sensor_history_enabled")
        .maybeSingle();
      const raw = String((data as any)?.value ?? "true").toLowerCase();
      return raw !== "false" && raw !== "0" && raw !== "off";
    },
  });

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const since1h = new Date(Date.now() - 3600_000).toISOString();

  const { data: counts } = useQuery({
    queryKey: ["sensor-history-counts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [raw24, raw1, agg24] = await Promise.all([
        supabase.from("sensor_readings_raw").select("id", { count: "exact", head: true }).gte("recorded_at", since24h),
        supabase.from("sensor_readings_raw").select("id", { count: "exact", head: true }).gte("recorded_at", since1h),
        supabase.from("sensor_readings_5min").select("id", { count: "exact", head: true }).gte("bucket", since24h),
      ]);
      return {
        raw24: raw24.count ?? 0,
        raw1: raw1.count ?? 0,
        agg24: agg24.count ?? 0,
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key: "sensor_history_enabled", value: enabled ? "true" : "false" }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings", "sensor_history_enabled"] });
      queryClient.invalidateQueries({ queryKey: ["sensor-history-counts"] });
      toast.success("Einstellung gespeichert");
    },
    onError: (e: any) => toast.error(`Fehler: ${e.message}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" /> Sensor-Historie
        </CardTitle>
        <CardDescription>
          Historisierung von Momentanwerten (Temperatur, Feuchte, Spannung, Batterien …).
          Notfall-Kill-Switch bei IO-Druck.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
          <div>
            <div className="font-medium">Aufzeichnung aktiv</div>
            <div className="text-xs text-muted-foreground">
              Wenn deaktiviert, werden keine neuen Rohwerte mehr geschrieben und der 5-Minuten-Aggregator läuft leer.
            </div>
          </div>
          <Switch
            checked={!!setting}
            disabled={isLoading || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 border rounded-lg">
            <div className="text-xs text-muted-foreground">Rohwerte (letzte Stunde)</div>
            <div className="text-2xl font-bold tabular-nums">{(counts?.raw1 ?? 0).toLocaleString("de-DE")}</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-xs text-muted-foreground">Rohwerte (24 h)</div>
            <div className="text-2xl font-bold tabular-nums">{(counts?.raw24 ?? 0).toLocaleString("de-DE")}</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-xs text-muted-foreground">5-Min-Buckets (24 h)</div>
            <div className="text-2xl font-bold tabular-nums">{(counts?.agg24 ?? 0).toLocaleString("de-DE")}</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div><b>Retention:</b> Rohdaten 7 Tage · 5-Min 400 Tage · Stunden 2 Jahre · Tage 5 Jahre · Monate unbegrenzt.</div>
          <div><b>Aggregation:</b> zeit-gewichteter Mittelwert + Min + Max + Letzter Wert.</div>
          <div><b>Ingest-Pfade:</b> AICONO Gateway (device-snapshot), Shelly Cloud, Loxone.</div>
        </div>
      </CardContent>
    </Card>
  );
}