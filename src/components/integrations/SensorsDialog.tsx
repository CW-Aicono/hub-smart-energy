import { useState } from "react";
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
import { Integration } from "@/hooks/useIntegrations";
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
}

interface SensorsDialogProps {
  integration: Integration | null;
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

export function SensorsDialog({ integration, open, onOpenChange }: SensorsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchSensors = async () => {
    if (!integration) return;

    setLoading(true);
    setError(null);

    try {
      console.log("Fetching sensors for integration:", integration.id);
      
      const { data, error: fnError } = await supabase.functions.invoke("loxone-api", {
        body: {
          integrationId: integration.id,
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

      console.log("Received sensors:", data.sensors?.length);
      setSensors(data.sensors || []);
    } catch (err) {
      console.error("Failed to fetch sensors:", err);
      setError(err instanceof Error ? err.message : "Verbindung zum Miniserver fehlgeschlagen");
      setSensors([]);
    } finally {
      setLoading(false);
    }
  };

  // Load sensors when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && integration) {
      fetchSensors();
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                Sensoren & Messgeräte – {integration?.name}
              </DialogTitle>
              <DialogDescription>
                Übersicht aller verfügbaren Sensoren und Messgeräte vom Gateway
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSensors}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
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
              <span className="ml-2 text-muted-foreground">Lade Sensoren vom Miniserver...</span>
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
                    <TableCell className="text-right font-mono">
                      {sensor.value} {sensor.unit}
                    </TableCell>
                    <TableCell>{getStatusBadge(sensor.status)}</TableCell>
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
