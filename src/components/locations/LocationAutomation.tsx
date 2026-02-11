import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Cpu,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  Lightbulb,
  Thermometer,
  Wind,
  Zap,
  TrendingDown,
  Clock,
  Plus,
  Settings2,
  Server,
  ToggleLeft,
  Gauge,
  DoorOpen,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useLoxoneSensors, LoxoneSensor } from "@/hooks/useLoxoneSensors";
import { Input } from "@/components/ui/input";

// ... keep existing code (AutomationScenario interface and DEMO_SCENARIOS)
interface AutomationScenario {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  isActive: boolean;
  savingsPercent: number | null;
  schedule: string | null;
  scope: string;
}

const DEMO_SCENARIOS: AutomationScenario[] = [
  {
    id: "night-setback",
    name: "Nachtabsenkung Heizung",
    description: "Reduzierung der Raumtemperatur außerhalb der Nutzungszeiten auf 16°C",
    icon: Moon,
    isActive: true,
    savingsPercent: 12,
    schedule: "Mo–Fr 20:00–06:00, Sa–So ganztägig",
    scope: "Gesamtes Gebäude",
  },
  {
    id: "presence-light",
    name: "Präsenzabhängige Beleuchtung",
    description: "Automatische Abschaltung der Beleuchtung bei Abwesenheit nach 10 Minuten",
    icon: Lightbulb,
    isActive: true,
    savingsPercent: 18,
    schedule: "Permanent aktiv",
    scope: "Alle Räume mit Präsenzmelder",
  },
  {
    id: "summer-ventilation",
    name: "Sommerliche Nachtlüftung",
    description: "Automatische Fensterlüftung bei Außentemperatur < Innentemperatur (nachts)",
    icon: Wind,
    isActive: false,
    savingsPercent: 8,
    schedule: "Jun–Sep, 22:00–06:00",
    scope: "Gesamtes Gebäude",
  },
  {
    id: "peak-shaving",
    name: "Lastspitzenvermeidung",
    description: "Automatische Reduktion nicht-kritischer Verbraucher bei Überschreitung der Leistungsgrenze",
    icon: Zap,
    isActive: false,
    savingsPercent: null,
    schedule: "Permanent aktiv",
    scope: "Hauptzähler",
  },
  {
    id: "holiday-mode",
    name: "Ferienbetrieb",
    description: "Reduzierter Betrieb während Schulferien und Feiertagen",
    icon: Sun,
    isActive: false,
    savingsPercent: 15,
    schedule: "Laut Ferienkalender NRW",
    scope: "Gesamtes Gebäude",
  },
];

// Icon mapping for sensor types
function getSensorIcon(type: string) {
  switch (type) {
    case "temperature": return Thermometer;
    case "switch":
    case "digital":
    case "button": return ToggleLeft;
    case "light": return Lightbulb;
    case "blind": return DoorOpen;
    case "power": return Gauge;
    case "motion": return Activity;
    default: return Server;
  }
}

// Check if a sensor is an actuator (can be controlled)
function isActuator(sensor: LoxoneSensor): boolean {
  const actuatorTypes = ["switch", "light", "blind", "button", "digital"];
  const actuatorControlTypes = [
    "Switch", "Dimmer", "Jalousie", "LightController", "LightControllerV2",
    "Pushbutton", "IRoomController", "IRoomControllerV2", "Gate", "Ventilation",
    "Daytimer", "Alarm", "CentralAlarm", "Intercom", "AalSmartAlarm",
    "Sauna", "Pool", "Hourcounter",
  ];
  return actuatorTypes.includes(sensor.type) || actuatorControlTypes.includes(sensor.controlType);
}

interface LocationAutomationProps {
  locationId: string;
}

export const LocationAutomation = ({ locationId }: LocationAutomationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [scenarios, setScenarios] = useState(DEMO_SCENARIOS);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch connected integrations for this location
  const { locationIntegrations, loading: intLoading } = useLocationIntegrations(locationId);
  const loxoneIntegration = locationIntegrations.find(
    (li) => li.integration?.type?.startsWith("loxone") && li.is_enabled
  );
  const { data: sensors, isLoading: sensorsLoading } = useLoxoneSensors(loxoneIntegration?.id);

  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalSavings = scenarios
    .filter((s) => s.isActive && s.savingsPercent)
    .reduce((sum, s) => sum + (s.savingsPercent ?? 0), 0);

  const toggleScenario = (id: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
    );
  };

  // Filter sensors to actuators (controllable devices)
  const allSensors = sensors || [];
  const actuators = allSensors.filter(isActuator);
  const readOnly = allSensors.filter((s) => !isActuator(s));

  const filteredActuators = searchTerm
    ? actuators.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.controlType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : actuators;

  const filteredReadOnly = searchTerm
    ? readOnly.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.controlType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : readOnly;

  // Group by room
  const groupByRoom = (items: LoxoneSensor[]) => {
    const grouped: Record<string, LoxoneSensor[]> = {};
    items.forEach((s) => {
      const room = s.room || "Unbekannt";
      if (!grouped[room]) grouped[room] = [];
      grouped[room].push(s);
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-left group">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      Automation
                      {activeCount > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {activeCount} aktiv
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Automatisierte Steuerungsszenarien für diesen Standort
                    </CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
              {totalSavings > 0 && (
                <Badge variant="outline" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
                  <TrendingDown className="h-3 w-3" />
                  ~{totalSavings}% Einsparung
                </Badge>
              )}
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-3">
              {scenarios.map((scenario) => {
                const Icon = scenario.icon;
                return (
                  <div
                    key={scenario.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                      scenario.isActive
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    <div
                      className={`mt-0.5 rounded-lg p-2 ${
                        scenario.isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{scenario.name}</p>
                        {scenario.isActive && scenario.savingsPercent && (
                          <Badge variant="outline" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
                            <TrendingDown className="h-3 w-3" />
                            ~{scenario.savingsPercent}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {scenario.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {scenario.schedule && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {scenario.schedule}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Thermometer className="h-3 w-3" />
                          {scenario.scope}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={scenario.isActive}
                      onCheckedChange={() => toggleScenario(scenario.id)}
                      className="mt-1"
                    />
                  </div>
                );
              })}

              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setConfigOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  Konfiguration
                  {!intLoading && loxoneIntegration && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {actuators.length} Aktoren
                    </Badge>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-2" disabled>
                  <Plus className="h-4 w-4" />
                  Automation hinzufügen
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Konfiguration Dialog – Live Loxone Endpoints */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Verfügbare Aktoren – Loxone Miniserver
            </DialogTitle>
            <DialogDescription>
              Steuerbare Aktoren des verbundenen Miniservers, die für Automationen genutzt werden können.
            </DialogDescription>
          </DialogHeader>

          {!loxoneIntegration ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Kein Loxone Miniserver mit diesem Standort verbunden.<br />
                Verbinden Sie einen Miniserver unter „Integrationen".
              </p>
            </div>
          ) : sensorsLoading || intLoading ? (
            <div className="space-y-3 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {/* Search */}
              <Input
                placeholder="Suche nach Name, Raum oder Typ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />

              {/* Stats */}
              <Badge variant="secondary" className="gap-1">
                <ToggleLeft className="h-3 w-3" />
                {actuators.length} Aktoren (steuerbar)
              </Badge>

              {/* Actuators */}
              {filteredActuators.length > 0 ? (
                <div className="space-y-2">
                  {groupByRoom(filteredActuators).map(([room, items]) => (
                    <div key={room} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-1">{room}</p>
                      {items.map((sensor) => {
                        const Icon = getSensorIcon(sensor.type);
                        return (
                          <div
                            key={sensor.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20"
                          >
                            <div className="rounded-lg p-2 bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{sensor.name}</p>
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {sensor.controlType}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {sensor.category}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-mono font-medium">
                                {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ""}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{sensor.status}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  {searchTerm ? "Keine Ergebnisse für diese Suche." : "Keine steuerbaren Aktoren gefunden."}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
