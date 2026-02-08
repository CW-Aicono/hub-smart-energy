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
import { Loader2, Thermometer, Droplets, Gauge, Lightbulb, Power, Activity } from "lucide-react";
import { Integration } from "@/hooks/useIntegrations";

interface Sensor {
  id: string;
  name: string;
  type: string;
  value: string;
  unit: string;
  status: "online" | "offline" | "warning";
  lastUpdate: string;
}

interface SensorsDialogProps {
  integration: Integration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock data - in real implementation this would come from the Loxone API
const getMockSensors = (integrationId: string): Sensor[] => [
  {
    id: "1",
    name: "Außentemperatur",
    type: "temperature",
    value: "12.5",
    unit: "°C",
    status: "online",
    lastUpdate: "vor 2 Min.",
  },
  {
    id: "2",
    name: "Raumtemperatur Büro",
    type: "temperature",
    value: "21.3",
    unit: "°C",
    status: "online",
    lastUpdate: "vor 1 Min.",
  },
  {
    id: "3",
    name: "Luftfeuchtigkeit",
    type: "humidity",
    value: "45",
    unit: "%",
    status: "online",
    lastUpdate: "vor 3 Min.",
  },
  {
    id: "4",
    name: "Stromverbrauch Gesamt",
    type: "power",
    value: "2.45",
    unit: "kW",
    status: "online",
    lastUpdate: "vor 1 Min.",
  },
  {
    id: "5",
    name: "Beleuchtung Flur",
    type: "light",
    value: "Ein",
    unit: "",
    status: "online",
    lastUpdate: "vor 5 Min.",
  },
  {
    id: "6",
    name: "Drucksensor Heizung",
    type: "pressure",
    value: "1.8",
    unit: "bar",
    status: "warning",
    lastUpdate: "vor 10 Min.",
  },
  {
    id: "7",
    name: "Bewegungsmelder EG",
    type: "motion",
    value: "Keine Bewegung",
    unit: "",
    status: "online",
    lastUpdate: "vor 30 Sek.",
  },
  {
    id: "8",
    name: "Wasserverbrauch",
    type: "water",
    value: "125",
    unit: "L/h",
    status: "offline",
    lastUpdate: "vor 2 Std.",
  },
];

const getSensorIcon = (type: string) => {
  switch (type) {
    case "temperature":
      return <Thermometer className="h-4 w-4" />;
    case "humidity":
    case "water":
      return <Droplets className="h-4 w-4" />;
    case "pressure":
      return <Gauge className="h-4 w-4" />;
    case "light":
      return <Lightbulb className="h-4 w-4" />;
    case "power":
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

  // Load sensors when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && integration) {
      setLoading(true);
      // Simulate API call
      setTimeout(() => {
        setSensors(getMockSensors(integration.id));
        setLoading(false);
      }, 1000);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Sensoren & Messgeräte – {integration?.name}
          </DialogTitle>
          <DialogDescription>
            Übersicht aller verfügbaren Sensoren und Messgeräte vom Gateway
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Lade Sensoren...</span>
            </div>
          ) : sensors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Sensoren gefunden
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Typ</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Wert</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Letzte Aktualisierung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sensors.map((sensor) => (
                  <TableRow key={sensor.id}>
                    <TableCell>
                      <div className="p-1.5 rounded bg-muted w-fit">
                        {getSensorIcon(sensor.type)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{sensor.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {sensor.value} {sensor.unit}
                    </TableCell>
                    <TableCell>{getStatusBadge(sensor.status)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {sensor.lastUpdate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
