import { useState, useEffect } from "react";
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
import { Loader2, Thermometer, Droplets, Gauge, Lightbulb, Power, Activity, RefreshCw, AlertCircle, Zap } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface WebSocketControl {
  name: string;
  type: string;
  room: string;
  category: string;
  states: Record<string, number>;
}

interface SensorsDialogProps {
  locationIntegration: LocationIntegration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getSensorIcon = (type: string) => {
  switch (type) {
    case "temperature":
      return <Thermometer className="h-4 w-4" />;
    case "humidity":
    case "water":
      return <Droplets className="h-4 w-4" />;
    case "pressure":
    case "analog":
      return <Gauge className="h-4 w-4" />;
    case "light":
    case "dimmer":
      return <Lightbulb className="h-4 w-4" />;
    case "power":
    case "switch":
      return <Power className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
};

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

// Check if control is an energy monitor type
function isEnergyMonitor(controlType: string): boolean {
  const ct = controlType?.toLowerCase() || "";
  return ct.includes("meter") || ct.includes("zähler") || ct.includes("energymonitor") || ct.includes("fronius");
}

// Format a numeric value for display
function formatValue(value: number, type: string, stateName: string): string {
  if (type === "switch" || type === "digital") {
    return value > 0 ? "Ein" : "Aus";
  }
  if (stateName === "Pf" || stateName === "actual" || stateName === "power") {
    return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (stateName === "Mrc" || stateName === "Mrd" || stateName === "total") {
    return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  }
  if (type === "temperature") {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

// Determine sensor type from control type
function getSensorType(controlType: string): string {
  const ct = controlType?.toLowerCase() || "";
  
  if (ct.includes("temperature") || ct.includes("temp")) return "temperature";
  if (ct.includes("humidity") || ct.includes("feuchte")) return "humidity";
  if (isEnergyMonitor(controlType)) return "power";
  if (ct.includes("switch") || ct.includes("schalter")) return "switch";
  if (ct.includes("dimmer") || ct.includes("light")) return "light";
  if (ct.includes("jalousie") || ct.includes("blind")) return "blind";
  if (ct.includes("infoonlyanalog")) return "analog";
  if (ct.includes("infoonlydigital")) return "digital";
  if (ct.includes("pushbutton") || ct.includes("taster")) return "button";
  if (ct.includes("presence") || ct.includes("motion")) return "motion";
  
  return "unknown";
}

// Get unit for a state/type combination
function getUnit(stateName: string, sensorType: string): string {
  if (stateName === "Pf" || stateName === "actual" || stateName === "power") return "kW";
  if (stateName === "Mrc" || stateName === "Mrd" || stateName === "total") return "kWh";
  if (sensorType === "temperature") return "°C";
  if (sensorType === "humidity") return "%";
  if (sensorType === "light" || sensorType === "blind") return "%";
  return "";
}

export function SensorsDialog({ locationIntegration, open, onOpenChange }: SensorsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [wsLoading, setWsLoading] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const integrationName = locationIntegration?.integration?.name || "Integration";

  const fetchSensors = async (useWebSocket = false) => {
    if (!locationIntegration) return;

    if (useWebSocket) {
      setWsLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      console.log(`Fetching sensors via ${useWebSocket ? "WebSocket" : "REST API"}:`, locationIntegration.id);
      
      if (useWebSocket) {
        // Use WebSocket endpoint for live values
        const { data, error: fnError } = await supabase.functions.invoke("loxone-websocket", {
          body: {
            locationIntegrationId: locationIntegration.id,
            collectDuration: 4000, // Wait 4 seconds for value events
          },
        });

        if (fnError) {
          console.error("WebSocket edge function error:", fnError);
          throw new Error(fnError.message || "WebSocket-Verbindung fehlgeschlagen");
        }

        if (!data?.success) {
          throw new Error(data?.error || "Keine Werte empfangen");
        }

        console.log(`WebSocket: Received ${data.controlCount} controls with ${data.rawValueCount} values`);

        // Convert WebSocket data to Sensor format
        const wsControls = data.controls as Record<string, WebSocketControl>;
        const wsSensors: Sensor[] = [];

        for (const [controlUuid, control] of Object.entries(wsControls)) {
          const sensorType = getSensorType(control.type);
          const states = control.states || {};
          
          // Determine primary and secondary values based on available states
          let primaryValue = "-";
          let primaryStateName = "";
          let primaryUnit = "";
          let secondaryValue = "";
          let secondaryStateName = "";
          let secondaryUnit = "";

          // For energy monitors, prefer Pf as primary (power) and Mrc as secondary (meter reading)
          if (isEnergyMonitor(control.type)) {
            if (states["Pf"] !== undefined) {
              primaryStateName = "Pf";
              primaryValue = formatValue(states["Pf"], sensorType, "Pf");
              primaryUnit = "kW";
            }
            if (states["Mrc"] !== undefined) {
              if (primaryStateName) {
                secondaryStateName = "Mrc";
                secondaryValue = formatValue(states["Mrc"], sensorType, "Mrc");
                secondaryUnit = "kWh";
              } else {
                primaryStateName = "Mrc";
                primaryValue = formatValue(states["Mrc"], sensorType, "Mrc");
                primaryUnit = "kWh";
              }
            }
            // Fallback to actual/total if Pf/Mrc not available
            if (!primaryStateName && states["actual"] !== undefined) {
              primaryStateName = "actual";
              primaryValue = formatValue(states["actual"], sensorType, "actual");
              primaryUnit = "kW";
            }
            if (!primaryStateName && states["total"] !== undefined) {
              primaryStateName = "total";
              primaryValue = formatValue(states["total"], sensorType, "total");
              primaryUnit = "kWh";
            }
          } else {
            // For non-energy monitors, take first meaningful state
            const priorityStates = ["value", "actual", "position", "level", "brightness", "temperature"];
            for (const stateName of priorityStates) {
              if (states[stateName] !== undefined) {
                primaryStateName = stateName;
                primaryValue = formatValue(states[stateName], sensorType, stateName);
                primaryUnit = getUnit(stateName, sensorType);
                break;
              }
            }
            // Fallback to first state
            if (!primaryStateName) {
              const stateEntries = Object.entries(states);
              if (stateEntries.length > 0) {
                const [stateName, stateValue] = stateEntries[0];
                primaryStateName = stateName;
                primaryValue = formatValue(stateValue, sensorType, stateName);
                primaryUnit = getUnit(stateName, sensorType);
              }
            }
          }

          wsSensors.push({
            id: controlUuid,
            name: control.name,
            type: sensorType,
            controlType: control.type,
            room: control.room || "Unbekannt",
            category: control.category || "Sonstige",
            value: primaryValue,
            unit: primaryUnit,
            status: primaryValue !== "-" ? "online" : "offline",
            stateName: primaryStateName,
            secondaryValue,
            secondaryStateName,
            secondaryUnit,
          });
        }

        // Sort: those with values first, then by name
        wsSensors.sort((a, b) => {
          const aHasValue = a.value !== "-" || a.secondaryValue !== "";
          const bHasValue = b.value !== "-" || b.secondaryValue !== "";
          if (aHasValue && !bHasValue) return -1;
          if (!aHasValue && bHasValue) return 1;
          return a.name.localeCompare(b.name);
        });

        setSensors(wsSensors);
      } else {
        // Use REST API
        const { data, error: fnError } = await supabase.functions.invoke("loxone-api", {
          body: {
            locationIntegrationId: locationIntegration.id,
            action: "getSensors",
          },
        });

        if (fnError) {
          console.error("Edge function error:", fnError);
          throw new Error(fnError.message || "Fehler beim Abrufen der Sensoren");
        }

        if (!data?.success) {
          throw new Error(data?.error || "Unbekannter Fehler");
        }

        console.log("REST API: Received sensors:", data.sensors?.length);
        setSensors(data.sensors || []);
      }
    } catch (err) {
      console.error("Failed to fetch sensors:", err);
      setError(err instanceof Error ? err.message : "Verbindung zum Miniserver fehlgeschlagen");
      if (!useWebSocket) {
        setSensors([]);
      }
    } finally {
      setLoading(false);
      setWsLoading(false);
    }
  };

  // Auto-fetch sensors when dialog opens (REST API first)
  useEffect(() => {
    if (open && locationIntegration) {
      fetchSensors(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locationIntegration?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                Sensoren & Messgeräte – {integrationName}
              </DialogTitle>
              <DialogDescription>
                Übersicht aller verfügbaren Sensoren und Messgeräte vom Gateway
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSensors(true)}
                disabled={loading || wsLoading}
                title="Live-Werte über WebSocket abrufen (für Meter, Fronius, etc.)"
              >
                <Zap className={`h-4 w-4 mr-2 ${wsLoading ? "animate-pulse text-yellow-500" : ""}`} />
                {wsLoading ? "Verbinde..." : "Live-Werte"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSensors(false)}
                disabled={loading || wsLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Aktualisieren
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(loading || wsLoading) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                {wsLoading ? "WebSocket-Verbindung, sammle Live-Werte..." : "Lade Sensoren vom Miniserver..."}
              </span>
            </div>
          ) : sensors.length === 0 && !error ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Sensoren gefunden
            </div>
          ) : sensors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
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
                {sensors.map((sensor) => (
                  <TableRow key={sensor.id}>
                    <TableCell>
                      <div className="p-1.5 rounded bg-muted w-fit" title={sensor.controlType}>
                        {getSensorIcon(sensor.type)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{sensor.name}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
