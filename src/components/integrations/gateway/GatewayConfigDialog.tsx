import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

interface Props {
  deviceId: string;
  deviceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ConfigPayload {
  device_name?: string;
  poll_interval_seconds?: number;
  flush_interval_seconds?: number;
  heartbeat_interval_seconds?: number;
  automation_eval_seconds?: number;
  entity_filter?: string;
  offline_buffer_max_mb?: number;
  auto_backup_hours?: number;
  cloud_url?: string | null;
  log_level?: string;
}

const DEFAULTS: Required<Omit<ConfigPayload, "cloud_url" | "log_level">> & {
  cloud_url: string | null;
  log_level: string;
} = {
  device_name: "aicono-ems",
  poll_interval_seconds: 30,
  flush_interval_seconds: 5,
  heartbeat_interval_seconds: 60,
  automation_eval_seconds: 30,
  entity_filter: "sensor.*_energy,sensor.*_power,sensor.*_consumption",
  offline_buffer_max_mb: 100,
  auto_backup_hours: 24,
  cloud_url: null,
  log_level: "info",
};

export function GatewayConfigDialog({ deviceId, deviceName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ConfigPayload>(DEFAULTS);

  const { data, isLoading } = useQuery({
    queryKey: ["gateway-device-config", deviceId],
    enabled: open && !!deviceId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gateway-device-config", {
        body: { action: "get", device_id: deviceId },
      });
      if (error) throw error;
      return data as { config: ConfigPayload; version: number; updated_at: string | null };
    },
  });

  useEffect(() => {
    if (data?.config) setForm({ ...DEFAULTS, ...data.config });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gateway-device-config", {
        body: { action: "update", device_id: deviceId, config: form },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Konfiguration an Gateway gesendet", {
        description: "Das Gateway übernimmt die neuen Werte ohne Neustart.",
      });
      qc.invalidateQueries({ queryKey: ["gateway-device-config", deviceId] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error("Konnte Konfiguration nicht speichern", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const num = (key: keyof ConfigPayload) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value === "" ? undefined : Number(e.target.value);
    setForm((f) => ({ ...f, [key]: v }));
  };
  const str = (key: keyof ConfigPayload) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Gateway-Konfiguration · {deviceName}</DialogTitle>
          <DialogDescription>
            Werte werden zentral verwaltet und in Echtzeit an das Gateway gepusht.
            {data?.version != null && (
              <span className="ml-2 text-xs">Version {data.version}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="sync">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sync">Polling & Sync</TabsTrigger>
              <TabsTrigger value="buffer">Buffer & Backup</TabsTrigger>
              <TabsTrigger value="advanced">Erweitert</TabsTrigger>
            </TabsList>

            <TabsContent value="sync" className="space-y-3 pt-3">
              <Field label="Polling-Intervall (Sek.)" hint="Wie oft das Gateway HA-Entitäten abfragt.">
                <Input type="number" min={5} max={3600} value={form.poll_interval_seconds ?? ""} onChange={num("poll_interval_seconds")} />
              </Field>
              <Field label="Flush-Intervall (Sek.)" hint="Sendepuffer-Leerung Richtung Cloud.">
                <Input type="number" min={1} max={600} value={form.flush_interval_seconds ?? ""} onChange={num("flush_interval_seconds")} />
              </Field>
              <Field label="Heartbeat-Intervall (Sek.)" hint="Cloud erkennt Offline > 3 × Heartbeat.">
                <Input type="number" min={10} max={600} value={form.heartbeat_interval_seconds ?? ""} onChange={num("heartbeat_interval_seconds")} />
              </Field>
              <Field label="Automations-Auswertung (Sek.)" hint="Lokale Automation-Engine Tickrate.">
                <Input type="number" min={5} max={3600} value={form.automation_eval_seconds ?? ""} onChange={num("automation_eval_seconds")} />
              </Field>
            </TabsContent>

            <TabsContent value="buffer" className="space-y-3 pt-3">
              <Field label="Offline-Buffer (MB)" hint="Lokale SQLite-Buffer-Grenze bei Cloud-Ausfall.">
                <Input type="number" min={10} max={5000} value={form.offline_buffer_max_mb ?? ""} onChange={num("offline_buffer_max_mb")} />
              </Field>
              <Field label="Auto-Backup-Intervall (Std., 0 = aus)" hint="Automatisches Snapshot der Gateway-DB.">
                <Input type="number" min={0} max={168} value={form.auto_backup_hours ?? ""} onChange={num("auto_backup_hours")} />
              </Field>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-3 pt-3">
              <Field label="Device-Name (mDNS-Hostname-Suffix)">
                <Input value={form.device_name ?? ""} onChange={str("device_name")} />
              </Field>
              <Field label="Entity-Filter (Regex, kommagetrennt)" hint="Welche HA-Entities übernommen werden.">
                <Input value={form.entity_filter ?? ""} onChange={str("entity_filter")} />
              </Field>
              <Field label="Cloud-URL Override (optional)" hint="Nur für Self-Hosted-Setups.">
                <Input
                  value={form.cloud_url ?? ""}
                  placeholder="https://hub.example.com"
                  onChange={(e) => setForm((f) => ({ ...f, cloud_url: e.target.value || null }))}
                />
              </Field>
              <Field label="Log-Level" hint="debug | info | warn | error">
                <Input value={form.log_level ?? "info"} onChange={str("log_level")} />
              </Field>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            An Gateway senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
