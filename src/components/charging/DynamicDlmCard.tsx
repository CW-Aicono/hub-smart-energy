import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Zap, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useLocationDlmConfig } from "@/hooks/useLocationDlmConfig";
import { useLocationChargePoints } from "@/hooks/useLocationChargePoints";
import { useMeters } from "@/hooks/useMeters";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  locationId: string;
}

export function DynamicDlmCard({ locationId }: Props) {
  const { config, log, isLoading, save, saving, remove } = useLocationDlmConfig(locationId);
  const { data: cps = [] } = useLocationChargePoints(locationId);
  const { meters } = useMeters(locationId);
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [referenceMeterId, setReferenceMeterId] = useState<string>("");
  const [gridLimitKw, setGridLimitKw] = useState<number>(50);
  const [safetyBufferKw, setSafetyBufferKw] = useState<number>(2);
  const [fallbackKwPerCp, setFallbackKwPerCp] = useState<number>(4.2);
  const [minChargeKw, setMinChargeKw] = useState<number>(1.4);
  const [priority, setPriority] = useState<string[]>([]);

  // Initial / Re-Sync from server config
  useEffect(() => {
    if (config) {
      setIsActive(config.is_active);
      setReferenceMeterId(config.reference_meter_id ?? "");
      setGridLimitKw(Number(config.grid_limit_kw));
      setSafetyBufferKw(Number(config.safety_buffer_kw));
      setFallbackKwPerCp(Number(config.fallback_kw_per_cp));
      setMinChargeKw(Number(config.min_charge_kw));
      setPriority(Array.isArray(config.priority_order) ? config.priority_order : []);
    }
  }, [config?.id]);

  // CP-Liste mit aktueller Priorität synchron halten
  useEffect(() => {
    if (cps.length === 0) return;
    const known = new Set(priority);
    const missing = cps.map((c) => c.id).filter((id) => !known.has(id));
    if (missing.length > 0) {
      setPriority((prev) => [...prev, ...missing]);
    }
    setPriority((prev) => prev.filter((id) => cps.some((c) => c.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cps.length]);

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

  const move = (id: string, dir: -1 | 1) => {
    setPriority((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const tgt = idx + dir;
      if (tgt < 0 || tgt >= next.length) return prev;
      [next[idx], next[tgt]] = [next[tgt], next[idx]];
      return next;
    });
  };

  const lastLog = log[0];
  const measuredKw = lastLog?.measured_kw != null ? Number(lastLog.measured_kw) : null;
  const availableKw = lastLog?.available_kw != null ? Number(lastLog.available_kw) : null;
  const sensorStale = lastLog?.reason === "fallback_stale_sensor";

  if (isLoading) return <Skeleton className="h-64" />;
  if (cps.length === 0) return null;

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
                    <Zap className="h-5 w-5" />
                    Dynamisches Lastmanagement (DLM)
                  </CardTitle>
                  <CardDescription>
                    Drosselt Wallboxen automatisch, wenn der Hausanschluss-Messwert sich der Grenzleistung nähert.
                    Reaktion ≤ 60 s.
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
              <p className="text-xs text-muted-foreground">Hausanschluss-Last</p>
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

        {/* Priorisierung */}
        <div className="space-y-2">
          <Label>Priorisierung der Wallboxen</Label>
          <p className="text-xs text-muted-foreground">
            Bei Engpass werden Wallboxen weiter unten zuerst gedrosselt oder pausiert.
          </p>
          <div className="space-y-1 rounded-md border">
            {priority.map((id, idx) => {
              const cp = cps.find((c) => c.id === id);
              if (!cp) return null;
              return (
                <div key={id} className="flex items-center justify-between gap-2 border-b p-2 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-sm font-mono text-muted-foreground">{idx + 1}.</span>
                    <span className="text-sm font-medium">{cp.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {cp.max_power_kw.toLocaleString("de-DE")} kW
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => move(id, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={idx === priority.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
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
                priority_order: priority,
              })
            }
          >
            {saving ? "Speichern…" : config ? "Änderungen speichern" : "DLM einrichten"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
