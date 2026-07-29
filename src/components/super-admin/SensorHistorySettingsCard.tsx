import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export function SensorHistorySettingsCard() {
  const queryClient = useQueryClient();
  const parseEnabled = (value: unknown, fallback: boolean) => {
    const raw = String(value ?? (fallback ? "true" : "false")).toLowerCase();
    return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ["system_settings", "backend-stability-switches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value, updated_at")
        .in("key", ["sensor_history_enabled", "backend_emergency_mode", "ocpp_message_logging_enabled"]);
      if (error) throw error;
      const byKey = new Map((data ?? []).map((row: any) => [String(row.key), row]));
      const changedAtValues = (data ?? [])
        .map((row: any) => row.updated_at as string | null)
        .filter(Boolean)
        .sort();
      return {
        sensorHistoryEnabled: parseEnabled(byKey.get("sensor_history_enabled")?.value, true),
        backendEmergencyMode: parseEnabled(byKey.get("backend_emergency_mode")?.value, false),
        ocppMessageLoggingEnabled: parseEnabled(byKey.get("ocpp_message_logging_enabled")?.value, false),
        lastChangedAt: changedAtValues.length > 0 ? changedAtValues[changedAtValues.length - 1] : null,
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key, value: enabled ? "true" : "false" }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings", "backend-stability-switches"] });
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
          Schutzschalter bei Backend- und IO-Druck.
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
            checked={!!settings?.sensorHistoryEnabled}
            disabled={isLoading || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate({ key: "sensor_history_enabled", enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
          <div>
            <div className="font-medium">OCPP-Rohtelegramme protokollieren</div>
            <div className="text-xs text-muted-foreground">
              Standardmäßig aus. Bei Aktivierung werden Wallbox-Request/Response-Logs zusätzlich gespeichert.
            </div>
          </div>
          <Switch
            checked={!!settings?.ocppMessageLoggingEnabled}
            disabled={isLoading || toggle.isPending || !!settings?.backendEmergencyMode}
            onCheckedChange={(v) => toggle.mutate({ key: "ocpp_message_logging_enabled", enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <div className="font-medium">Backend-Notfallmodus</div>
              <div className="text-xs text-muted-foreground">
                Stoppt Sensor-Historie-Aggregation und OCPP-Rohtelegramm-Logging sofort. Live-Werte und Kernfunktionen bleiben aktiv.
              </div>
            </div>
          </div>
          <Switch
            checked={!!settings?.backendEmergencyMode}
            disabled={isLoading || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate({ key: "backend_emergency_mode", enabled: v })}
          />
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div><b>Lastschutz:</b> Keine Live-Counts auf großen Historientabellen; Aggregation läuft datenbanknah und kann per Notfallmodus gestoppt werden.</div>
          <div><b>Retention:</b> Rohdaten 48 h · 5-Min 400 Tage · Stunden 2 Jahre · Tage 5 Jahre · Monate unbegrenzt.</div>
          <div><b>Aggregation:</b> Mittelwert + Min + Max + Letzter Wert.</div>
          <div><b>Ingest-Pfade:</b> AICONO Gateway (device-snapshot), Shelly Cloud, Loxone.</div>
          {settings?.lastChangedAt ? <div><b>Zuletzt geändert:</b> {new Date(settings.lastChangedAt).toLocaleString("de-DE")}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}