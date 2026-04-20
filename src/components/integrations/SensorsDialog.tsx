import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, RefreshCw, AlertCircle, Plus, CheckCircle2,
  Zap, Thermometer, Droplets, Wind, Gauge, Sun, BatteryCharging,
  ToggleLeft, Activity, Lightbulb, Waves, CloudRain, Eye, Radio,
} from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AssignMeterDialog } from "./AssignMeterDialog";
import { useMeters } from "@/hooks/useMeters";
import { getGatewayDefinition, getEdgeFunctionName } from "@/lib/gatewayRegistry";

interface Sensor {
  id: string;
  name: string;
  type: string;
  controlType?: string;
  room: string;
  category: string;
  value: string;
  unit: string;
  status: "online" | "offline" | "warning";
  stateName?: string;
  secondaryValue?: string;
  secondaryStateName?: string;
  secondaryUnit?: string;
}

interface SensorsDialogProps {
  locationIntegration: LocationIntegration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
}

const METER_CONTROL_TYPES = new Set(["Meter", "EFM", "EnergyManager2", "Fronius", "access_point", "switch", "gateway"]);

function getSensorIcon(sensor: Sensor) {
  const cls = "h-4 w-4";
  const unit = (sensor.unit || "").toLowerCase();
  const ct = (sensor.controlType || "").toLowerCase();
  const name = (sensor.name || "").toLowerCase();

  // Unit-based matching first
  if (unit === "°c" || unit === "°f" || unit === "k") return <Thermometer className={cls} />;
  if (unit === "%" && (name.includes("feuchte") || name.includes("humid"))) return <Droplets className={cls} />;
  if (unit === "l" || unit === "m³" || unit === "l/h" || unit === "m³/h") return <Droplets className={cls} />;
  if (unit === "lux" || unit === "lx") return <Sun className={cls} />;
  if (unit === "m/s" || unit === "km/h") return <Wind className={cls} />;
  if (unit === "mm" && name.includes("regen")) return <CloudRain className={cls} />;
  if (unit === "kwh" || unit === "kw" || unit === "w" || unit === "wh" || unit === "mwh") return <Zap className={cls} />;
  if (unit === "v" || unit === "a" || unit === "va" || unit === "var") return <Activity className={cls} />;
  if (unit === "hz") return <Waves className={cls} />;
  if (unit === "ppm" || unit === "µg/m³" || unit === "ppb") return <Wind className={cls} />;
  if (unit === "bar" || unit === "pa" || unit === "hpa" || unit === "mbar") return <Gauge className={cls} />;

  // ControlType-based matching
  if (ct.includes("switch") || ct.includes("pushbutton") || ct === "timedswitch") return <ToggleLeft className={cls} />;
  if (ct.includes("light") || ct.includes("dimmer")) return <Lightbulb className={cls} />;
  if (ct.includes("meter") || ct === "efm" || ct === "energymanager2" || ct === "fronius") return <Zap className={cls} />;
  if (ct.includes("temperature") || ct.includes("iroom")) return <Thermometer className={cls} />;
  if (ct.includes("battery") || name.includes("batterie") || name.includes("speicher")) return <BatteryCharging className={cls} />;
  if (ct === "gateway" || ct === "access_point") return <Radio className={cls} />;
  if (ct.includes("sensor") || ct.includes("analog")) return <Eye className={cls} />;

  return <Gauge className={cls} />;
}

const getStatusBadge = (status: Sensor["status"]) => {
  switch (status) {
    case "online":
      return <Badge variant="success">Online</Badge>;
    case "offline":
      return <Badge variant="secondary">Offline</Badge>;
    case "warning":
      return <Badge variant="destructive">Warnung</Badge>;
  }
};

export function SensorsDialog({ locationIntegration, open, onOpenChange, locationId }: SensorsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSensorIds, setSelectedSensorIds] = useState<Set<string>>(new Set());
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  const effectiveLocationId = locationId || locationIntegration?.location_id || "";
  // Fetch ALL meters (no location filter) so we can detect sensor assignments across locations
  const { meters } = useMeters();

  const integrationName = locationIntegration?.integration?.name || "Integration";
  const integrationType = locationIntegration?.integration?.type || "";
  const edgeFunctionName = getEdgeFunctionName(integrationType);

  // Push-based gateways don't support getSensors – they receive data, not poll it.
  // gateway-ingest (Schneider/Siemens) and gateway-ws (AICONO Gateway) are both push-based:
  // their sensors arrive via WebSocket / HTTPS push and are managed via gateway_devices.
  const isPushGateway = edgeFunctionName === "gateway-ingest" || edgeFunctionName === "gateway-ws";

  // For non-Loxone gateways, show all sensors; for Loxone filter to meter types
  const meterSensors = integrationType === "loxone_miniserver"
    ? sensors.filter((s) => METER_CONTROL_TYPES.has(s.controlType || ""))
    : sensors;

  // Set of sensor UUIDs already assigned to this location
  // Check ALL meters globally – a sensor_uuid must only be assigned once across the entire system
  const assignedSensorIds = useMemo(() => {
    const ids = new Set<string>();
    meters.forEach((m) => {
      if (m.sensor_uuid) {
        ids.add(m.sensor_uuid);
      }
    });
    return ids;
  }, [meters]);

  const fetchSensors = async () => {
    if (!locationIntegration || isPushGateway) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(edgeFunctionName, {
        body: {
          locationIntegrationId: locationIntegration.id,
          action: "getSensors",
        },
      });

      if (fnError) throw new Error(fnError.message || "Fehler beim Abrufen der Sensoren");
      if (!data?.success) throw new Error(data?.error || "Unbekannter Fehler");

      setSensors(data.sensors || []);
    } catch (err) {
      console.error("Failed to fetch sensors:", err);
      setError(err instanceof Error ? err.message : "Verbindung fehlgeschlagen");
      setSensors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && locationIntegration && !isPushGateway) {
      fetchSensors();
      setSelectedSensorIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locationIntegration?.id]);

  const toggleSensor = (sensorId: string) => {
    setSelectedSensorIds((prev) => {
      const next = new Set(prev);
      if (next.has(sensorId)) {
        next.delete(sensorId);
      } else {
        next.add(sensorId);
      }
      return next;
    });
  };

  const selectableSensors = meterSensors.filter((s) => !assignedSensorIds.has(s.id));

  const toggleAll = () => {
    if (selectedSensorIds.size === selectableSensors.length) {
      setSelectedSensorIds(new Set());
    } else {
      setSelectedSensorIds(new Set(selectableSensors.map((s) => s.id)));
    }
  };

  const selectedSensors = meterSensors.filter((s) => selectedSensorIds.has(s.id));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>
                  Gefundene Geräte – {integrationName}
                </DialogTitle>
                <DialogDescription>
                  Wählen Sie die Geräte aus, die Sie diesem Standort zuordnen möchten.
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSensors()}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Aktualisieren
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {isPushGateway ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <p className="font-medium">Push-basiertes Gateway</p>
                <p className="text-sm max-w-xl mx-auto">
                  {integrationType === "aicono_gateway"
                    ? "Das AICONO Gateway sendet Geräte und Messwerte automatisch an die Cloud. Die erkannten Geräte erscheinen unten direkt auf der Integrationskarte sowie unter Geräteverwaltung – sie werden nicht über diesen Dialog abgerufen."
                    : "Dieses Gateway sendet Daten aktiv an das System. Zähler können nicht automatisch abgerufen werden. Bitte ordnen Sie die Zähler manuell über das Device-Mapping in der Integrationskonfiguration zu."}
                </p>
              </div>
            ) : error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {!isPushGateway && loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  Lade Geräte von {integrationName}...
                </span>
              </div>
            ) : !isPushGateway && meterSensors.length === 0 && !error ? (
              <div className="text-center py-12 text-muted-foreground">
                Keine Zähler gefunden
              </div>
            ) : meterSensors.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectableSensors.length > 0 && selectedSensorIds.size === selectableSensors.length}
                        onCheckedChange={toggleAll}
                        disabled={selectableSensors.length === 0}
                        aria-label="Alle auswählen"
                      />
                    </TableHead>
                    <TableHead className="w-[50px]">Typ</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Raum</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Messwert</TableHead>
                    <TableHead className="text-right">Wert</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meterSensors.map((sensor) => {
                    const isAssigned = assignedSensorIds.has(sensor.id);
                    return (
                      <TableRow
                        key={sensor.id}
                        className={isAssigned ? "opacity-60" : selectedSensorIds.has(sensor.id) ? "bg-muted/50" : ""}
                      >
                        <TableCell>
                          {isAssigned ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <Checkbox
                              checked={selectedSensorIds.has(sensor.id)}
                              onCheckedChange={() => toggleSensor(sensor.id)}
                              aria-label={`${sensor.name} auswählen`}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="p-1.5 rounded bg-muted w-fit" title={sensor.controlType || sensor.unit}>
                            {getSensorIcon(sensor)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {sensor.name}
                          {isAssigned && (
                            <span className="ml-2 text-xs text-muted-foreground">(zugeordnet)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{sensor.room}</TableCell>
                        <TableCell className="text-muted-foreground">{sensor.category}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {sensor.stateName || "-"}
                          {sensor.secondaryStateName && (
                            <span className="block">{sensor.secondaryStateName}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <div>{sensor.value} {sensor.unit}</div>
                          {sensor.secondaryValue && (
                            <div className="text-muted-foreground">
                              {sensor.secondaryValue} {sensor.secondaryUnit}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(sensor.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}
          </div>

          {/* Bulk assign footer */}
          {selectedSensorIds.size > 0 && (
            <div className="flex items-center justify-between border-t pt-4 mt-2">
              <span className="text-sm text-muted-foreground">
                {selectedSensorIds.size} Zähler ausgewählt
              </span>
              <Button onClick={() => setShowAssignDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Zuordnen ({selectedSensorIds.size})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showAssignDialog && locationIntegration && selectedSensors.length > 0 && (
        <AssignMeterDialog
          open={showAssignDialog}
          onOpenChange={(o) => {
            if (!o) {
              setShowAssignDialog(false);
              setSelectedSensorIds(new Set());
            }
          }}
          sensors={selectedSensors.map((s) => ({ id: s.id, name: s.name, controlType: s.controlType, unit: s.unit }))}
          locationIntegrationId={locationIntegration.id}
          currentLocationId={effectiveLocationId}
        />
      )}
    </>
  );
}
