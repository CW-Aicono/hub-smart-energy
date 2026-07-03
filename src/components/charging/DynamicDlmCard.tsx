import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Zap, Trash2, ChevronDown, ChevronRight, Plus, Info } from "lucide-react";
import { useLocationDlmConfig } from "@/hooks/useLocationDlmConfig";
import { useLocationChargePoints } from "@/hooks/useLocationChargePoints";
import { useLocationDlmDevices, type DlmDeviceKind } from "@/hooks/useLocationDlmDevices";
import { useMeters } from "@/hooks/useMeters";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  locationId: string;
}

type LivePowerSource = "live" | "5min";

type BridgePowerSample = {
  uuid: string;
  value: number;
  received_at: string;
};

function getLoxoneUuidFamilyPrefix(uuid: string | null | undefined): string | null {
  if (!uuid) return null;
  const parts = uuid.toLowerCase().split("-");
  return parts.length >= 3 ? `${parts[0]}-${parts[1]}-` : null;
}

function isPlausiblePowerKw(value: number, gridLimitKw: number): boolean {
  const maxExpected = Math.max(Math.abs(gridLimitKw) * 3, 500);
  return Number.isFinite(value) && Math.abs(value) <= maxExpected;
}

function pickBridgePowerSample(
  rows: BridgePowerSample[],
  exactUuid: string | null | undefined,
  gridLimitKw: number,
): BridgePowerSample | null {
  const normalizedExact = exactUuid?.toLowerCase() ?? null;
  const sorted = [...rows].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  const exact = sorted.find(
    (row) => row.uuid.toLowerCase() === normalizedExact && isPlausiblePowerKw(Number(row.value), gridLimitKw),
  );
  if (exact) return exact;
  return sorted.find((row) => isPlausiblePowerKw(Number(row.value), gridLimitKw)) ?? null;
}

export function DynamicDlmCard({ locationId }: Props) {
  const { config, log, isLoading, save, saving, remove } = useLocationDlmConfig(locationId);
  const { data: cps = [] } = useLocationChargePoints(locationId);
  const { devices: dlmDevices, add: addDevice, remove: removeDevice, reorder: reorderDevices } =
    useLocationDlmDevices(locationId);
  const { meters } = useMeters(locationId);
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const [addKind, setAddKind] = useState<DlmDeviceKind>("charge_point");
  const [addRefId, setAddRefId] = useState<string>("");

  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [referenceMeterId, setReferenceMeterId] = useState<string>("");
  const [gridLimitKw, setGridLimitKw] = useState<number>(50);
  const [safetyBufferKw, setSafetyBufferKw] = useState<number>(2);
  const [fallbackKwPerCp, setFallbackKwPerCp] = useState<number>(4.2);
  const [minChargeKw, setMinChargeKw] = useState<number>(1.4);

  // Initial / Re-Sync from server config
  useEffect(() => {
    if (config) {
      setIsActive(config.is_active);
      setReferenceMeterId(config.reference_meter_id ?? "");
      setGridLimitKw(Number(config.grid_limit_kw));
      setSafetyBufferKw(Number(config.safety_buffer_kw));
      setFallbackKwPerCp(Number(config.fallback_kw_per_cp));
      setMinChargeKw(Number(config.min_charge_kw));
    }
  }, [config?.id]);

  // Wallboxen, die noch nicht als DLM-Gerät hinterlegt sind → einmalig
  // automatisch als charge_point-Einträge aufnehmen (Bestandsdaten-Ergänzung).
  useEffect(() => {
    if (!config || cps.length === 0) return;
    const knownRefs = new Set(dlmDevices.map((d) => d.device_ref_id));
    const missing = cps.filter((c) => !knownRefs.has(c.id));
    if (missing.length === 0) return;
    for (const cp of missing) {
      addDevice({
        device_kind: "charge_point",
        device_ref_id: cp.id,
        display_name: cp.name,
        min_power_kw: 1.4,
        max_power_kw: Number(cp.max_power_kw ?? 11),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id, cps.length, dlmDevices.length]);

  const referenceMeter = meters.find((m) => m.id === referenceMeterId) ?? null;

  // Live-Messwert vom Referenz-Zähler.
  // 1) Bevorzugt: Gateway-Rohwert aus bridge_raw_samples (< 2 min alt → "Live").
  //    Wichtig bei Loxone: Live-Power-States können zur gespeicherten Zähler-UUID
  //    versetzte State-UUIDs haben; deshalb erst exakte UUID, dann plausible UUID
  //    derselben Loxone-Familie.
  // 2) Danach: aktuellster Rohwert aus meter_power_readings (< 2 min alt → "Live").
  // 3) Fallback: letzter 5-Minuten-Bucket ("5-Min").
  const livePowerQuery = useQuery({
    queryKey: ["dlm-live-power", referenceMeterId, referenceMeter?.sensor_uuid, gridLimitKw],
    enabled: !!referenceMeterId && !!tenant?.id,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
      const referenceUuid = referenceMeter?.sensor_uuid?.toLowerCase() ?? null;
      const uuidFamilyPrefix = getLoxoneUuidFamilyPrefix(referenceUuid);

      if (referenceUuid) {
        let bridgeRows: BridgePowerSample[] = [];
        if (uuidFamilyPrefix) {
          const { data } = await (supabase as any)
            .from("bridge_raw_samples")
            .select("uuid, value, received_at")
            .eq("tenant_id", tenant?.id)
            .ilike("uuid", `${uuidFamilyPrefix}%`)
            .gte("received_at", twoMinAgo)
            .order("received_at", { ascending: false })
            .limit(120);
          bridgeRows = (data ?? []) as BridgePowerSample[];
        }

        if (bridgeRows.length === 0) {
          const { data } = await (supabase as any)
            .from("bridge_raw_samples")
            .select("uuid, value, received_at")
            .eq("tenant_id", tenant?.id)
            .eq("uuid", referenceUuid)
            .gte("received_at", twoMinAgo)
            .order("received_at", { ascending: false })
            .limit(20);
          bridgeRows = (data ?? []) as BridgePowerSample[];
        }

        const bridge = pickBridgePowerSample(bridgeRows, referenceUuid, gridLimitKw);
        if (bridge) {
          return { power_kw: Number(bridge.value), source: "live" as const satisfies LivePowerSource };
        }
      }

      const { data: raw } = await supabase
        .from("meter_power_readings")
        .select("power_value, recorded_at")
        .eq("meter_id", referenceMeterId)
        .gte("recorded_at", twoMinAgo)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (raw && (raw as any).power_value != null) {
        return { power_kw: Number((raw as any).power_value), source: "live" as const satisfies LivePowerSource };
      }
      const { data: bucket } = await supabase
        .from("meter_power_readings_5min")
        .select("power_avg, bucket")
        .eq("meter_id", referenceMeterId)
        .order("bucket", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bucket && (bucket as any).power_avg != null) {
        return { power_kw: Number((bucket as any).power_avg), source: "5min" as const satisfies LivePowerSource };
      }
      return null;
    },
  });

  // Zusätzlich den Realtime-Broadcast direkt abonnieren: dadurch aktualisiert sich
  // die Hausanschluss-Last ohne auf DB-Polling oder 5-Min-Aggregation zu warten.
  useEffect(() => {
    if (!tenant?.id || !referenceMeterId || !referenceMeter?.sensor_uuid) return;
    const referenceUuid = referenceMeter.sensor_uuid.toLowerCase();
    const uuidFamilyPrefix = getLoxoneUuidFamilyPrefix(referenceUuid);
    const channel = supabase
      .channel(`dlm-live-${locationId}-${referenceMeterId}`, { config: { broadcast: { self: false } } })
      .on(
        "broadcast",
        { event: "readings" },
        (msg: { payload: { events?: Array<{ uuid: string; value: number; at: string; role?: string }> } }) => {
          const events = msg.payload?.events ?? [];
          const powerEvents = events
            .filter((ev) => (ev.role ?? "pwr") === "pwr")
            .filter((ev) => {
              const uuid = ev.uuid.toLowerCase();
              return uuid === referenceUuid || (!!uuidFamilyPrefix && uuid.startsWith(uuidFamilyPrefix));
            })
            .map((ev) => ({ uuid: ev.uuid, value: Number(ev.value), received_at: ev.at }));
          const sample = pickBridgePowerSample(powerEvents, referenceUuid, gridLimitKw);
          if (!sample) return;
          qc.setQueryData(["dlm-live-power", referenceMeterId, referenceMeter.sensor_uuid, gridLimitKw], {
            power_kw: Number(sample.value),
            source: "live" as const satisfies LivePowerSource,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, locationId, referenceMeterId, referenceMeter?.sensor_uuid, gridLimitKw, qc]);

  // Realtime: Log refresh
  useEffect(() => {
    if (!tenant?.id) return;
    const ch = supabase
      .channel(`dlm-log-${locationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dlm_control_log", filter: `location_id=eq.${locationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["location-dlm-log", tenant.id, locationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenant?.id, locationId, qc]);

  const electricityMeters = meters.filter(
    (m) =>
      m.energy_type === "strom" ||
      m.energy_type === "electricity" ||
      (m.medium ?? "").toLowerCase() === "strom" ||
      (m.medium ?? "").toLowerCase() === "electricity",
  );

  // Aktor-Entitäten des Standorts (für Wärmepumpe/Batterie/Aktor-Auswahl)
  const actuatorsQuery = useQuery({
    queryKey: ["dlm-actuator-candidates", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: gateways } = await supabase
        .from("gateway_devices")
        .select("id")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId);
      const gwIds = (gateways ?? []).map((g: any) => g.id);
      if (gwIds.length === 0) return [] as Array<{ id: string; entity_label: string }>;
      const { data: entities } = await (supabase as any)
        .from("gateway_device_entities")
        .select("id, entity_label, entity_kind, actuator_uuid")
        .in("gateway_device_id", gwIds)
        .not("actuator_uuid", "is", null);
      return (entities ?? []) as Array<{ id: string; entity_label: string }>;
    },
  });
  const actuatorCandidates = actuatorsQuery.data ?? [];

  const usedRefIds = useMemo(() => new Set(dlmDevices.map((d) => d.device_ref_id)), [dlmDevices]);
  const availableChargePoints = cps.filter((c) => !usedRefIds.has(c.id));
  const availableActuators = actuatorCandidates.filter((a) => !usedRefIds.has(a.id));

  const lastLog = log[0];
  const logMeasuredKw = lastLog?.measured_kw != null ? Number(lastLog.measured_kw) : null;
  const logAvailableKw = lastLog?.available_kw != null ? Number(lastLog.available_kw) : null;
  const sensorStale = lastLog?.reason === "fallback_stale_sensor";

  // Live-Fallback: wenn kein aktueller Steuerzyklus vorliegt (z. B. DLM gerade eingerichtet
  // oder inaktiv), Werte direkt aus dem Referenzzähler ableiten (Gateway-Broadcast/Rohwert/5-Min-Bucket).
  const liveMeasuredKw = livePowerQuery.data?.power_kw ?? null;
  const liveSource: "live" | "5min" | null = livePowerQuery.data?.source ?? null;
  const measuredKw = logMeasuredKw ?? liveMeasuredKw;
  // Quelle für Badge: dlm_control_log wird alle 60 s aktualisiert → "Live".
  const measuredSource: "live" | "5min" =
    logMeasuredKw != null ? "live" : liveSource === "5min" ? "5min" : "live";
  const availableKw =
    logAvailableKw ??
    (measuredKw != null
      ? Math.max(0, gridLimitKw - measuredKw - safetyBufferKw)
      : null);

  if (isLoading) return <Skeleton className="h-64" />;
  if (cps.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button className="group flex w-full items-start justify-between gap-2 text-left hover:opacity-90">
              <div className="flex items-start gap-2">
                {isOpen ? (
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                )}
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Hausanschluss-Lastmanagement
                  </CardTitle>
                  <CardDescription>
                    Schützt den gesamten Hausanschluss, indem angeschlossene steuerbare Verbraucher (z. B. Wallboxen, Wärmepumpen, Batteriespeicher) automatisch gedrosselt oder pausiert werden, sobald der Messwert sich der Grenzleistung nähert. Reaktion ≤ 60 s. Für Unterkreise (einzelne Ladepunkt-Gruppe) siehe „Gruppen-Lastbegrenzung" im Ladepunkt-Gruppen-Dialog.
                  </CardDescription>
                </div>
              </div>
              {config && (
                <Badge variant={config.is_active ? "default" : "secondary"}>
                  {config.is_active ? "Aktiv" : "Inaktiv"}
                </Badge>
              )}
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="space-y-6">
        {/* Live-Panel */}
        {config && (
          <div className="grid gap-4 sm:grid-cols-3 rounded-md border bg-muted/30 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Hausanschluss-Last</p>
                {measuredKw != null && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] leading-none">
                    {measuredSource === "live" ? "Live" : "5-Min"}
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-semibold">
                {measuredKw != null ? `${measuredKw.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW` : "—"}
              </p>
              {sensorStale && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> Sensor veraltet · Fallback aktiv
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verfügbares EV-Budget</p>
              <p className="text-2xl font-semibold">
                {availableKw != null ? `${availableKw.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Letzter Steuer-Zyklus</p>
              <p className="text-sm font-medium">
                {lastLog
                  ? new Date(lastLog.executed_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                <Activity className="inline h-3 w-3" /> {lastLog?.applied_profiles?.length ?? 0} CPs gesteuert
              </p>
            </div>
          </div>
        )}

        {/* Konfiguration */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Referenz-Zähler (Hausanschluss)</Label>
            <Select value={referenceMeterId} onValueChange={setReferenceMeterId}>
              <SelectTrigger>
                <SelectValue placeholder="Bitte wählen…" />
              </SelectTrigger>
              <SelectContent>
                {electricityMeters.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    Keine Strom-Zähler verfügbar
                  </SelectItem>
                )}
                {electricityMeters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.meter_number ? `(${m.meter_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Netz-Grenzleistung (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={gridLimitKw}
              onChange={(e) => setGridLimitKw(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label>Sicherheits-Puffer (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={safetyBufferKw}
              onChange={(e) => setSafetyBufferKw(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label>Fallback je Wallbox (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={fallbackKwPerCp}
              onChange={(e) => setFallbackKwPerCp(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Greift, wenn Hausanschluss-Sensor &gt; 60 s ohne Messwert.</p>
          </div>

          <div className="space-y-2">
            <Label>Mindest-Ladeleistung (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={minChargeKw}
              onChange={(e) => setMinChargeKw(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Unterhalb wird die Wallbox pausiert statt gedrosselt.</p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="dlm-active">DLM aktivieren</Label>
              <p className="text-xs text-muted-foreground">Steuerung läuft alle 60 Sekunden.</p>
            </div>
            <Switch id="dlm-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        {/* Priorisierung der steuerbaren Verbraucher */}
        <div className="space-y-2">
          <Label>Priorisierung der steuerbaren Verbraucher</Label>
          <p className="text-xs text-muted-foreground">
            Bei Engpass werden Geräte weiter unten zuerst gedrosselt oder pausiert. Wallboxen werden bereits heute automatisch gesteuert; Wärmepumpen, Batteriespeicher und generische Aktoren erscheinen hier als Vorschau — die tatsächliche Ansteuerung dieser Geräte folgt in einem der nächsten Releases (Phase 2).
          </p>

          <div className="space-y-1 rounded-md border">
            {dlmDevices.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Noch keine Geräte hinterlegt.</div>
            )}
            {dlmDevices.map((d, idx) => {
              const kindLabel =
                d.device_kind === "charge_point" ? "Wallbox" :
                d.device_kind === "heat_pump" ? "Wärmepumpe" :
                d.device_kind === "battery" ? "Batterie" : "Aktor";
              const name = d.display_name
                ?? cps.find((c) => c.id === d.device_ref_id)?.name
                ?? actuatorCandidates.find((a) => a.id === d.device_ref_id)?.entity_label
                ?? "—";
              const moveTo = (dir: -1 | 1) => {
                const next = [...dlmDevices];
                const tgt = idx + dir;
                if (tgt < 0 || tgt >= next.length) return;
                [next[idx], next[tgt]] = [next[tgt], next[idx]];
                reorderDevices(next.map((x) => x.id));
              };
              return (
                <div key={d.id} className="flex items-center justify-between gap-2 border-b p-2 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 text-center text-sm font-mono text-muted-foreground">{idx + 1}.</span>
                    <Badge
                      variant={d.device_kind === "charge_point" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {kindLabel}
                    </Badge>
                    <span className="text-sm font-medium truncate">{name}</span>
                    <Badge variant="outline" className="text-xs">
                      {Number(d.max_power_kw).toLocaleString("de-DE")} kW
                    </Badge>
                    {d.device_kind !== "charge_point" && (
                      <Badge variant="outline" className="text-[10px] text-amber-600">
                        Vorschau
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moveTo(-1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={idx === dlmDevices.length - 1}
                      onClick={() => moveTo(1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeDevice(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gerät hinzufügen */}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Gerätetyp</Label>
              <Select
                value={addKind}
                onValueChange={(v) => {
                  setAddKind(v as DlmDeviceKind);
                  setAddRefId("");
                }}
              >
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge_point">Wallbox</SelectItem>
                  <SelectItem value="heat_pump">Wärmepumpe</SelectItem>
                  <SelectItem value="battery">Batteriespeicher</SelectItem>
                  <SelectItem value="generic_actuator">Sonstiger Aktor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Gerät</Label>
              <Select value={addRefId} onValueChange={setAddRefId}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  {addKind === "charge_point"
                    ? (availableChargePoints.length === 0
                        ? <SelectItem value="__none__" disabled>Keine Wallbox verfügbar</SelectItem>
                        : availableChargePoints.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          )))
                    : (availableActuators.length === 0
                        ? <SelectItem value="__none__" disabled>Keine Aktoren verfügbar</SelectItem>
                        : availableActuators.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.entity_label}</SelectItem>
                          )))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!addRefId}
              onClick={() => {
                const name =
                  addKind === "charge_point"
                    ? cps.find((c) => c.id === addRefId)?.name
                    : actuatorCandidates.find((a) => a.id === addRefId)?.entity_label;
                const maxKw =
                  addKind === "charge_point"
                    ? Number(cps.find((c) => c.id === addRefId)?.max_power_kw ?? 11)
                    : 3;
                addDevice({
                  device_kind: addKind,
                  device_ref_id: addRefId,
                  display_name: name ?? null,
                  min_power_kw: addKind === "charge_point" ? 1.4 : 0,
                  max_power_kw: maxKw,
                });
                setAddRefId("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Hinzufügen
            </Button>
          </div>

          <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Netzdienliche Steuerung nach §14a EnWG ist ein separater, externer Eingriff und wird unterhalb konfiguriert.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {config && (
            <Button variant="ghost" size="sm" onClick={() => remove()}>
              <Trash2 className="mr-2 h-4 w-4" /> Konfiguration entfernen
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={saving || !referenceMeterId || gridLimitKw <= 0}
            onClick={() =>
              save({
                reference_meter_id: referenceMeterId || null,
                grid_limit_kw: gridLimitKw,
                safety_buffer_kw: safetyBufferKw,
                fallback_kw_per_cp: fallbackKwPerCp,
                min_charge_kw: minChargeKw,
                is_active: isActive,
                // priority_order wird nur noch für Backward-Compat mitgeschrieben —
                // führend ist die Tabelle location_dlm_devices.
                priority_order: dlmDevices
                  .filter((d) => d.device_kind === "charge_point")
                  .map((d) => d.device_ref_id),
              })
            }
          >
            {saving ? "Speichern…" : config ? "Änderungen speichern" : "Lastmanagement einrichten"}
          </Button>
        </div>
      </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
