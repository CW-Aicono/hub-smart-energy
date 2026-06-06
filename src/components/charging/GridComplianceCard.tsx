import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
import { useGridConnection } from "@/hooks/useGridConnection";
import { useLocationChargePoints } from "@/hooks/useLocationChargePoints";
import { toast } from "@/hooks/use-toast";

interface Props {
  locationId: string;
}

const MODULE_LABEL: Record<string, string> = {
  modul1: "Modul 1 – Direktsteuerung",
  modul2: "Modul 2 – Pauschale Reduzierung",
  modul3: "Modul 3 – Zeitvariables Netzentgelt",
};

export function GridComplianceCard({ locationId }: Props) {
  const {
    connection,
    events,
    devices,
    activeEvent,
    isLoading,
    saveConnection,
    removeConnection,
    upsertDevice,
    deleteDevice,
    triggerManualEvent,
  } = useGridConnection(locationId);
  const { data: cps = [] } = useLocationChargePoints(locationId);

  const [isOpen, setIsOpen] = useState(false);
  const [dsoName, setDsoName] = useState("");
  const [moduleKind, setModuleKind] = useState<"modul1" | "modul2" | "modul3">("modul1");
  const [connId, setConnId] = useState("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [testPercent, setTestPercent] = useState(40);
  const [testMinutes, setTestMinutes] = useState(15);

  useEffect(() => {
    if (connection) {
      setDsoName(connection.dso_name);
      setModuleKind(connection.module);
      setConnId(connection.connection_id ?? "");
      setActive(connection.active);
      setNotes(connection.notes ?? "");
    }
  }, [connection?.id]);

  if (isLoading) return <Skeleton className="h-32" />;

  const webhookUrl = connection
    ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/grid-curtailment-webhook`
    : null;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} kopiert` });
  };

  const deviceForCp = (cpId: string) => devices.find((d) => d.device_ref_id === cpId);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-start justify-between gap-2 text-left">
              <div className="flex items-start gap-2">
                {isOpen ? (
                  <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    Netzdienliche Steuerung (§14a EnWG)
                  </CardTitle>
                  <CardDescription>
                    Empfängt Dimm-Signale vom Verteilnetzbetreiber (VNB) und drosselt Wallboxen
                    automatisch – Mindestleistung 4,2 kW pro Gerät bleibt gesetzlich garantiert.
                  </CardDescription>
                </div>
              </div>
              {activeEvent ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />§14a aktiv · {activeEvent.curtailment_percent}%
                </Badge>
              ) : connection ? (
                <Badge variant={connection.active ? "default" : "secondary"}>
                  {connection.active ? "Bereit" : "Inaktiv"}
                </Badge>
              ) : null}
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Aktive Drosselung Banner */}
            {activeEvent && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
                <p className="font-semibold text-destructive">
                  §14a EnWG-Steuersignal aktiv – Leistung begrenzt auf {activeEvent.curtailment_percent}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Gültig bis {new Date(activeEvent.valid_until).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                  {" · "}Quelle: {activeEvent.source}
                </p>
              </div>
            )}

            {/* Connection Config */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Netzbetreiber (VNB)</Label>
                <Input
                  value={dsoName}
                  onChange={(e) => setDsoName(e.target.value)}
                  placeholder="z. B. Netze BW, Stromnetz Berlin"
                />
              </div>
              <div className="space-y-2">
                <Label>Steuerungs-Modul</Label>
                <Select value={moduleKind} onValueChange={(v: any) => setModuleKind(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modul1">{MODULE_LABEL.modul1}</SelectItem>
                    <SelectItem value="modul2">{MODULE_LABEL.modul2}</SelectItem>
                    <SelectItem value="modul3">{MODULE_LABEL.modul3}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Marktlokations-ID / Anschluss-ID</Label>
                <Input
                  value={connId}
                  onChange={(e) => setConnId(e.target.value)}
                  placeholder="11-stellige MaLo-ID oder VNB-Referenz"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="grid-active">Anbindung aktiv</Label>
                  <p className="text-xs text-muted-foreground">
                    Bei Deaktivierung werden eingehende Signale nur protokolliert.
                  </p>
                </div>
                <Switch id="grid-active" checked={active} onCheckedChange={setActive} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notizen</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Webhook info */}
            {connection && webhookUrl && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                <p className="text-sm font-medium">Webhook-Zugang für VNB / Aggregator</p>
                <p className="text-xs text-muted-foreground">
                  An den VNB weitergeben. Signaturen werden als HMAC-SHA256 über den Raw-Body im Header
                  <code className="mx-1 rounded bg-background px-1">x-dso-signature</code>
                  erwartet. Connection-ID gehört in den Header
                  <code className="mx-1 rounded bg-background px-1">x-connection-id</code>.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copy(webhookUrl, "URL")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={connection.id} className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copy(connection.id, "Connection-ID")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      type="password"
                      value={connection.webhook_secret}
                      className="font-mono text-xs"
                    />
                    <Button size="icon" variant="outline" onClick={() => copy(connection.webhook_secret, "Secret")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* SteuVE-Geräte */}
            {connection && (
              <div className="space-y-2">
                <Label>Steuerbare Verbrauchseinrichtungen (SteuVE)</Label>
                <p className="text-xs text-muted-foreground">
                  Wählen Sie, welche Wallboxen am Netzanschluss als SteuVE im Sinne §14a EnWG registriert sind.
                  Mindestleistung darf 4,2 kW nicht unterschreiten.
                </p>
                {cps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Ladepunkte am Standort.</p>
                ) : (
                  <div className="space-y-1 rounded-md border">
                    {cps.map((cp) => {
                      const dev = deviceForCp(cp.id);
                      return (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between gap-2 border-b p-2 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!dev?.active}
                              onCheckedChange={(v) => {
                                if (dev) {
                                  if (v) upsertDevice.mutate({ ...dev });
                                  else deleteDevice.mutate(dev.id);
                                } else if (v) {
                                  upsertDevice.mutate({
                                    device_type: "charge_point",
                                    device_ref_id: cp.id,
                                    min_power_kw: 4.2,
                                    priority: 100,
                                    active: true,
                                  });
                                }
                              }}
                            />
                            <span className="text-sm font-medium">{cp.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {cp.max_power_kw.toLocaleString("de-DE")} kW
                            </Badge>
                          </div>
                          {dev && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Min. kW</Label>
                              <Input
                                type="number"
                                step="0.1"
                                min="4.2"
                                className="h-8 w-20"
                                value={dev.min_power_kw}
                                onChange={(e) =>
                                  upsertDevice.mutate({
                                    ...dev,
                                    min_power_kw: Math.max(4.2, Number(e.target.value)),
                                  })
                                }
                              />
                              <Label className="text-xs text-muted-foreground">Prio</Label>
                              <Input
                                type="number"
                                step="1"
                                className="h-8 w-16"
                                value={dev.priority}
                                onChange={(e) =>
                                  upsertDevice.mutate({ ...dev, priority: Number(e.target.value) })
                                }
                              />
                              <Button size="icon" variant="ghost" onClick={() => deleteDevice.mutate(dev.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Test-Auslöser */}
            {connection && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                <p className="text-sm font-medium">Manueller Test (Trockenlauf)</p>
                <p className="text-xs text-muted-foreground">
                  Simuliert ein DSO-Signal. Alle registrierten SteuVE-Geräte werden für die angegebene Dauer
                  gedrosselt.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Drosselung (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-9 w-24"
                      value={testPercent}
                      onChange={(e) => setTestPercent(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dauer (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      className="h-9 w-24"
                      value={testMinutes}
                      onChange={(e) => setTestMinutes(Number(e.target.value))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => triggerManualEvent.mutate({ curtailment_percent: testPercent, duration_min: testMinutes })}
                    disabled={triggerManualEvent.isPending || devices.length === 0}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" /> Drosselung auslösen
                  </Button>
                </div>
              </div>
            )}

            {/* Historie */}
            {events.length > 0 && (
              <div className="space-y-2">
                <Label>Letzte Steuersignale</Label>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Empfangen</th>
                        <th className="p-2 text-left">Gültig bis</th>
                        <th className="p-2 text-right">Drosselung</th>
                        <th className="p-2 text-left">Quelle</th>
                        <th className="p-2 text-right">Geräte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.slice(0, 10).map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="p-2">
                            {new Date(e.received_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                          </td>
                          <td className="p-2">
                            {new Date(e.valid_until).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                          </td>
                          <td className="p-2 text-right font-medium">{e.curtailment_percent}%</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">
                              {e.source}
                            </Badge>
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {Array.isArray(e.applied_result?.devices) ? e.applied_result.devices.length : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {connection && (
                <Button variant="ghost" size="sm" onClick={() => removeConnection.mutate()}>
                  <Trash2 className="mr-2 h-4 w-4" /> Anbindung entfernen
                </Button>
              )}
              <Button
                className="ml-auto"
                disabled={saveConnection.isPending || !dsoName.trim()}
                onClick={() =>
                  saveConnection.mutate({
                    id: connection?.id,
                    dso_name: dsoName.trim(),
                    module: moduleKind,
                    connection_id: connId.trim() || null,
                    active,
                    notes: notes.trim() || null,
                  })
                }
              >
                {saveConnection.isPending
                  ? "Speichern…"
                  : connection
                    ? "Änderungen speichern"
                    : "Anbindung einrichten"}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
