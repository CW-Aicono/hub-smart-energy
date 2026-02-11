import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
} from "lucide-react";

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

interface LocationAutomationProps {
  locationId: string;
}

export const LocationAutomation = ({ locationId }: LocationAutomationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState(DEMO_SCENARIOS);

  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalSavings = scenarios
    .filter((s) => s.isActive && s.savingsPercent)
    .reduce((sum, s) => sum + (s.savingsPercent ?? 0), 0);

  const toggleScenario = (id: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
    );
  };

  return (
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

            <Button variant="outline" size="sm" className="w-full gap-2 mt-2" disabled>
              <Plus className="h-4 w-4" />
              Automation hinzufügen
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
