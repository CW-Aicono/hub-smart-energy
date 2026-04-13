import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sun, AlertTriangle, Save, Gauge, Info, ExternalLink, Zap, PlugZap, BatteryCharging } from "lucide-react";
import { useSolarChargingConfig, useSolarChargingLog } from "@/hooks/useSolarChargingConfig";
import { useMeters } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import { useChargePointConnectors, connectorDisplayName } from "@/hooks/useChargePointConnectors";
import { useChargePoints } from "@/hooks/useChargePoints";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CHARGING_MODES = [
  { value: "immediate", label: "🔌 Sofortladen", desc: "Volle Leistung, unabhängig von PV" },
  { value: "pv_surplus_only", label: "☀️ Nur PV-Überschuss", desc: "Laden nur bei ausreichend Überschuss" },
  { value: "pv_priority", label: "⚡ PV-Vorrang + Netz-Minimum", desc: "PV bevorzugt, Mindestladung aus Netz" },
];

export default function SolarChargingConfig() {
  const { locations } = useLocations();
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const { config, isLoading, upsert } = useSolarChargingConfig(selectedLocationId);
  const { meters } = useMeters(selectedLocationId);
  const { chargePoints } = useChargePoints();
  const navigate = useNavigate();

  // Form state
  const [referenceMeter, setReferenceMeter] = useState<string>("");
  const [minPower, setMinPower] = useState(1400);
  const [buffer, setBuffer] = useState(200);
  const [priorityMode, setPriorityMode] = useState("equal_split");
  const [isActive, setIsActive] = useState(true);

  // Auto-select first location
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  // Sync form from config
  useEffect(() => {
    if (config) {
      setReferenceMeter(config.reference_meter_id || "");
      setMinPower(config.min_charge_power_w);
      setBuffer(config.safety_buffer_w);
      setPriorityMode(config.priority_mode);
      setIsActive(config.is_active);
    } else {
      setReferenceMeter("");
      setMinPower(1400);
      setBuffer(200);
      setPriorityMode("equal_split");
      setIsActive(true);
    }
  }, [config]);

  // Find bidirectional meters at this location
  const bidirectionalMeters = useMemo(
    () => meters.filter((m) => m.meter_function === "bidirectional"),
    [meters]
  );

  // Auto-suggest first bidirectional meter
  useEffect(() => {
    if (!referenceMeter && bidirectionalMeters.length > 0) {
      setReferenceMeter(bidirectionalMeters[0].id);
    }
  }, [bidirectionalMeters, referenceMeter]);

  // Charge points at this location
  const locationChargePoints = useMemo(
    () => chargePoints.filter((cp) => cp.location_id === selectedLocationId),
    [chargePoints, selectedLocationId]
  );

  const handleSave = () => {
    upsert.mutate({
      location_id: selectedLocationId,
      reference_meter_id: referenceMeter || null,
      min_charge_power_w: minPower,
      safety_buffer_w: buffer,
      priority_mode: priorityMode,
      is_active: isActive,
    });
  };

  return (
    <div className="space-y-6">
      {/* Location selector */}
      <div className="flex items-center gap-4">
        <Label>Standort</Label>
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Standort wählen" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedLocationId && (
        <>
          {/* Main config card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-yellow-500" />
                PV-Überschussladen
                <div className="ml-auto flex items-center gap-2">
                  <Label htmlFor="solar-active" className="text-sm font-normal">Aktiv</Label>
                  <Switch id="solar-active" checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Reference meter selection */}
              <div className="space-y-2">
                <Label>Referenzzähler (Einspeisezähler)</Label>
                {bidirectionalMeters.length > 0 ? (
                  <Select value={referenceMeter} onValueChange={setReferenceMeter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Einspeisezähler wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {bidirectionalMeters.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.meter_number || "—"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/5">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-sm">
                      <strong>Kein Einspeisezähler gefunden.</strong> Erstellen Sie einen virtuellen Zähler mit der Formel:
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded mx-1">Erzeugung − Gesamtverbrauch = PV-Überschuss</span>
                      und weisen Sie diesem die Funktion „Einspeisung" (bidirektional) zu.
                      <Button
                        variant="link"
                        size="sm"
                        className="gap-1 px-0 ml-1"
                        onClick={() => navigate("/meters")}
                      >
                        <ExternalLink className="h-3 w-3" /> Zur Zählerverwaltung
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Der negative Leistungswert dieses Zählers wird als verfügbarer PV-Überschuss interpretiert.
                </p>
              </div>

              {/* Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Mindestladeleistung (W)</Label>
                  <Input
                    type="number"
                    value={minPower}
                    onChange={(e) => setMinPower(Number(e.target.value))}
                    min={0}
                    step={100}
                  />
                  <p className="text-xs text-muted-foreground">6A ≈ 1.400 W (technisches Minimum)</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Sicherheitspuffer (W)</Label>
                  <Input
                    type="number"
                    value={buffer}
                    onChange={(e) => setBuffer(Number(e.target.value))}
                    min={0}
                    step={50}
                  />
                  <p className="text-xs text-muted-foreground">Reserve für Gebäudeverbrauch</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Priorisierung</Label>
                  <Select value={priorityMode} onValueChange={setPriorityMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_come">First come, first served</SelectItem>
                      <SelectItem value="equal_split">Gleichmäßig verteilen</SelectItem>
                      <SelectItem value="manual">Manuelle Reihenfolge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleSave} disabled={upsert.isPending} className="gap-1.5">
                <Save className="h-4 w-4" />
                {upsert.isPending ? "Speichern…" : "Konfiguration speichern"}
              </Button>
            </CardContent>
          </Card>

          {/* Connector charging modes */}
          {locationChargePoints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlugZap className="h-5 w-5" />
                  Lademodus pro Anschluss
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {locationChargePoints.map((cp) => (
                    <ConnectorModeList key={cp.id} chargePointId={cp.id} chargePointName={cp.name} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Log */}
          <SolarChargingLogCard locationId={selectedLocationId} />
        </>
      )}
    </div>
  );
}

function ConnectorModeList({ chargePointId, chargePointName }: { chargePointId: string; chargePointName: string }) {
  const { connectors } = useChargePointConnectors(chargePointId);

  const updateMode = async (connectorId: string, mode: string) => {
    const { error } = await supabase
      .from("charge_point_connectors")
      .update({ charging_mode: mode } as any)
      .eq("id", connectorId);
    if (error) {
      toast.error("Fehler: " + error.message);
    } else {
      toast.success("Lademodus aktualisiert");
    }
  };

  if (connectors.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <p className="font-medium text-sm flex items-center gap-1.5">
        <BatteryCharging className="h-4 w-4 text-primary" />
        {chargePointName}
      </p>
      {connectors.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 pl-6">
          <span className="text-sm">{connectorDisplayName(c)}</span>
          <Select
            value={(c as any).charging_mode || "immediate"}
            onValueChange={(v) => updateMode(c.id, v)}
          >
            <SelectTrigger className="w-56 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARGING_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <div>
                    <span>{m.label}</span>
                    <span className="text-muted-foreground ml-1 text-xs">– {m.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function SolarChargingLogCard({ locationId }: { locationId: string }) {
  const { data: logs = [], isLoading } = useSolarChargingLog(locationId);

  if (isLoading || logs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          Ausführungsprotokoll
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zeitpunkt</TableHead>
              <TableHead>Überschuss</TableHead>
              <TableHead>Zugewiesen</TableHead>
              <TableHead>Anschlüsse</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.slice(0, 20).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs">{format(new Date(log.executed_at), "dd.MM. HH:mm:ss", { locale: de })}</TableCell>
                <TableCell className="text-xs">{log.surplus_w != null ? `${Math.round(log.surplus_w)} W` : "—"}</TableCell>
                <TableCell className="text-xs">{log.allocated_w != null ? `${Math.round(log.allocated_w)} W` : "—"}</TableCell>
                <TableCell className="text-xs">{log.active_connectors ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={log.status === "success" ? "secondary" : "destructive"} className="text-xs">
                    {log.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
