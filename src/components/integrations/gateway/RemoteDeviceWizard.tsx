import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Search, Trash2, Plus, AlertCircle, CheckCircle2, Cable, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ModbusWallboxWizard from "@/components/charging/ModbusWallboxWizard";

interface Props {
  deviceId: string;
  deviceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Discovery {
  id: string;
  discovery_method: string;
  discovered_payload: Record<string, unknown>;
  is_provisioned: boolean;
  created_at: string;
}

interface Entity {
  id: string;
  integration_type: string;
  entity_kind: string;
  entity_label: string;
  ha_entity_id: string | null;
  provision_status: string;
  last_error: string | null;
  config_json: Record<string, unknown>;
  version: number;
}

const INTEGRATION_OPTIONS = [
  { value: "shelly", label: "Shelly (mDNS / Cloud)" },
  { value: "mqtt", label: "MQTT-Gerät" },
  { value: "modbus_tcp", label: "Modbus TCP" },
  { value: "tasmota", label: "Tasmota" },
  { value: "esphome", label: "ESPHome" },
  { value: "ha_native", label: "Home Assistant Entity" },
  { value: "manual", label: "Manuell" },
];

const ENTITY_KIND_OPTIONS = [
  { value: "meter", label: "Zähler" },
  { value: "sensor", label: "Sensor" },
  { value: "actuator", label: "Aktor" },
];

export function RemoteDeviceWizard({ deviceId, deviceName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("discover");

  const discoveries = useQuery({
    queryKey: ["gateway-discoveries", deviceId],
    enabled: open && !!deviceId,
    refetchInterval: open ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gateway-device-discover", {
        body: { action: "list", device_id: deviceId, only_unprovisioned: true },
      });
      if (error) throw error;
      return ((data as any)?.discoveries ?? []) as Discovery[];
    },
  });

  const entities = useQuery({
    queryKey: ["gateway-entities", deviceId],
    enabled: open && !!deviceId,
    refetchInterval: open ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gateway-device-provision", {
        body: { action: "list", device_id: deviceId },
      });
      if (error) throw error;
      return ((data as any)?.entities ?? []) as Entity[];
    },
  });

  const scan = useMutation({
    mutationFn: async (methods: string[]) => {
      const { data, error } = await supabase.functions.invoke("gateway-device-discover", {
        body: { action: "scan", device_id: deviceId, methods },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Discovery-Lauf gestartet", {
        description: "Ergebnisse erscheinen automatisch (alle 5 s).",
      });
    },
    onError: (e) => toast.error("Scan fehlgeschlagen", { description: (e as Error).message }),
  });

  const provision = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke("gateway-device-provision", {
        body: { action: "create", device_id: deviceId, ...payload },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Gerät wird provisioniert");
      qc.invalidateQueries({ queryKey: ["gateway-entities", deviceId] });
      qc.invalidateQueries({ queryKey: ["gateway-discoveries", deviceId] });
    },
    onError: (e) => toast.error("Provisionierung fehlgeschlagen", { description: (e as Error).message }),
  });

  const remove = useMutation({
    mutationFn: async (entity_id: string) => {
      const { error } = await supabase.functions.invoke("gateway-device-provision", {
        body: { action: "delete", entity_id },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateway-entities", deviceId] }),
  });

  const retry = useMutation({
    mutationFn: async (entity_id: string) => {
      const { error } = await supabase.functions.invoke("gateway-device-provision", {
        body: { action: "retry", entity_id },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateway-entities", deviceId] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Geräte einbinden · {deviceName}</DialogTitle>
          <DialogDescription>
            Sensoren, Aktoren und Zähler werden remote über das Gateway eingerichtet.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="discover">Discovery</TabsTrigger>
            <TabsTrigger value="manual">Manuell anlegen</TabsTrigger>
            <TabsTrigger value="wallbox">Wallbox</TabsTrigger>
            <TabsTrigger value="installed">
              Installiert {entities.data ? `(${entities.data.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="space-y-3 pt-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Discovery zeigt <strong>nur Geräte, die Home Assistant bereits kennt</strong>{" "}
                (Plattform <code>shelly</code>, <code>mqtt</code>, <code>tasmota</code> oder{" "}
                <code>esphome</code>) und die in AICONO noch <strong>nicht zugeordnet</strong>{" "}
                sind. Modbus-TCP-Scan benötigt Host/Port/Unit-IDs und wird hier als reine
                Erreichbarkeitsprüfung ausgeführt.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => scan.mutate(["mdns"])} disabled={scan.isPending}>
                {scan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                mDNS scan
              </Button>
              <Button size="sm" variant="outline" onClick={() => scan.mutate(["mqtt"])} disabled={scan.isPending}>
                {scan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                MQTT scan
              </Button>
              <Button size="sm" variant="outline" onClick={() => scan.mutate(["modbus_scan"])} disabled={scan.isPending}>
                {scan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Modbus TCP scan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => discoveries.refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-md border max-h-80 overflow-auto">
              {discoveries.isLoading ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Lade …
                </div>
              ) : (discoveries.data ?? []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground space-y-1">
                  <p>Keine neuen Funde.</p>
                  <p className="text-xs">
                    Tipp: Wenn HA keine passenden Plattform-Entitäten kennt oder bereits alle
                    in AICONO eingebunden sind, bleibt die Liste leer. Nutze in diesem Fall
                    den Tab <strong>„Manuell anlegen"</strong>.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {discoveries.data!.map((d) => (
                    <DiscoveryRow key={d.id} d={d} onProvision={provision.mutate} pending={provision.isPending} />
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="pt-3 space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Hinweis: Für <strong>Wallboxen via Modbus TCP</strong> bitte den Tab{" "}
                <strong>„Wallbox"</strong> nutzen. Dort wird automatisch ein Ladepunkt mit
                OCPP-Bridge angelegt. „Manuell anlegen" erstellt nur generische
                Sensor-/Aktor-Einträge ohne Lade-Logik.
              </AlertDescription>
            </Alert>
            <ManualForm onCreate={(p) => provision.mutate(p)} pending={provision.isPending} />
          </TabsContent>

          <TabsContent value="wallbox" className="pt-3 space-y-3">
            <Alert>
              <Cable className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Bindet eine Wallbox per <strong>Modbus TCP</strong> über dieses Gateway an.
                Das Gateway baut für jede Wallbox eine eigene OCPP-1.6J-Bridge zum Backend
                auf. Hersteller/Modell stammen aus den vom Super-Admin gepflegten
                Wallbox-Templates.
              </AlertDescription>
            </Alert>
            <div className="flex justify-center py-4">
              <ModbusWallboxWizard
                presetGatewayId={deviceId}
                triggerLabel="Wallbox einrichten"
              />
            </div>
          </TabsContent>

          <TabsContent value="installed" className="pt-3">
            <div className="rounded-md border max-h-80 overflow-auto">
              {entities.isLoading ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Lade …
                </div>
              ) : (entities.data ?? []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Noch keine Geräte am Gateway eingerichtet.
                </div>
              ) : (
                <ul className="divide-y">
                  {entities.data!.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{e.entity_label}</span>
                          <Badge variant="outline">{e.integration_type}</Badge>
                          <Badge variant="outline">{e.entity_kind}</Badge>
                          <StatusPill status={e.provision_status} />
                        </div>
                        {e.ha_entity_id && (
                          <p className="text-xs text-muted-foreground truncate">{e.ha_entity_id}</p>
                        )}
                        {e.last_error && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {e.last_error}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {e.provision_status === "error" && (
                          <Button size="icon" variant="ghost" onClick={() => retry.mutate(e.id)} title="Erneut versuchen">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(e.id)} title="Entfernen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Schliessen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon?: any }> = {
    pending: { label: "Wartend", className: "bg-muted text-muted-foreground" },
    provisioning: { label: "Wird eingerichtet", className: "bg-primary/10 text-primary" },
    active: { label: "Aktiv", className: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 },
    error: { label: "Fehler", className: "bg-destructive/10 text-destructive", icon: AlertCircle },
    archived: { label: "Archiviert", className: "bg-muted text-muted-foreground" },
  };
  const cfg = map[status] ?? map.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cfg.className}>
      {Icon && <Icon className="h-3 w-3 mr-1" />}
      {cfg.label}
    </Badge>
  );
}

function DiscoveryRow({
  d,
  onProvision,
  pending,
}: {
  d: Discovery;
  onProvision: (p: any) => void;
  pending: boolean;
}) {
  const p = d.discovered_payload as any;
  const label = String(p?.name || p?.host || p?.id || p?.ha_entity_id || "Unbenanntes Gerät");
  const integration = String(p?.integration_type || guessIntegration(d.discovery_method));
  const haEntityId = p?.ha_entity_id ?? null;
  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{label}</span>
          <Badge variant="outline">{d.discovery_method}</Badge>
          <Badge variant="outline">{integration}</Badge>
        </div>
        {haEntityId && <p className="text-xs text-muted-foreground truncate">{haEntityId}</p>}
        <p className="text-xs text-muted-foreground truncate">
          {Object.entries(p ?? {})
            .filter(([k]) => !["name", "host", "id", "ha_entity_id", "integration_type"].includes(k))
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
            .join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        onClick={() =>
          onProvision({
            integration_type: integration,
            entity_kind: p?.entity_kind || "sensor",
            entity_label: label,
            ha_entity_id: haEntityId,
            config_json: p ?? {},
            discovery_method: d.discovery_method,
            discovery_id: d.id,
          })
        }
        disabled={pending}
      >
        <Plus className="h-4 w-4 mr-1" />
        Übernehmen
      </Button>
    </li>
  );
}

function guessIntegration(method: string) {
  if (method === "mdns") return "shelly";
  if (method === "mqtt") return "mqtt";
  if (method === "modbus_scan") return "modbus_tcp";
  return "manual";
}

function ManualForm({ onCreate, pending }: { onCreate: (p: any) => void; pending: boolean }) {
  const [integration, setIntegration] = useState("modbus_tcp");
  const [kind, setKind] = useState("meter");
  const [label, setLabel] = useState("");
  const [haEntityId, setHaEntityId] = useState("");
  const [configText, setConfigText] = useState('{\n  "host": "192.168.1.50",\n  "port": 502,\n  "unit_id": 1\n}');

  const cfg = useMemo(() => {
    try { return JSON.parse(configText); } catch { return null; }
  }, [configText]);

  const submit = () => {
    if (!label.trim()) {
      toast.error("Bezeichnung erforderlich");
      return;
    }
    if (cfg === null) {
      toast.error("Konfig ist kein gültiges JSON");
      return;
    }
    onCreate({
      integration_type: integration,
      entity_kind: kind,
      entity_label: label.trim(),
      ha_entity_id: haEntityId.trim() || null,
      config_json: cfg,
      discovery_method: "manual",
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-sm">Integration</Label>
          <Select value={integration} onValueChange={setIntegration}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INTEGRATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Geräteart</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Bezeichnung</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Stromzähler Heizungsraum" />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">HA Entity-ID (optional)</Label>
        <Input value={haEntityId} onChange={(e) => setHaEntityId(e.target.value)} placeholder="sensor.modbus_meter_power" />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Konfiguration (JSON)</Label>
        <textarea
          className="font-mono text-xs w-full min-h-[140px] rounded-md border bg-background p-2"
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
        />
        {cfg === null && <p className="text-xs text-destructive">JSON ist ungültig.</p>}
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending || cfg === null}>
          {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Provisionieren
        </Button>
      </div>
    </div>
  );
}
