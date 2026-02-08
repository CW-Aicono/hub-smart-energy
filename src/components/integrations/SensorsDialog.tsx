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
import { Loader2, Thermometer, Droplets, Gauge, Lightbulb, Power, Activity, RefreshCw, AlertCircle } from "lucide-react";
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


export function SensorsDialog({ locationIntegration, open, onOpenChange }: SensorsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const integrationName = locationIntegration?.integration?.name || "Integration";

  const fetchSensors = async () => {
    if (!locationIntegration) return;

    setLoading(true);
    setError(null);

    try {
      console.log("Fetching sensors via REST API:", locationIntegration.id);
      
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
    } catch (err) {
      console.error("Failed to fetch sensors:", err);
      setError(err instanceof Error ? err.message : "Verbindung zum Miniserver fehlgeschlagen");
      setSensors([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch sensors when dialog opens
  useEffect(() => {
    if (open && locationIntegration) {
      fetchSensors();
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
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                Lade Sensoren vom Miniserver...
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
