import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Cpu,
  Zap,
  BrainCircuit,
  Thermometer,
  Lightbulb,
  Wind,
  Timer,
  TrendingDown,
  ArrowRight,
  Plus,
  Settings2,
  Activity,
  Server,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  MapPin,
  Building2,
  Layers,
  DoorOpen,
  ChevronRight,
} from "lucide-react";

// Mock data for the vision page
const MOCK_AUTOMATIONS = [
  {
    id: "1",
    name: "Nachtabsenkung Heizung",
    description: "Heizung automatisch auf 18°C reduzieren zwischen 22:00 und 06:00 Uhr",
    icon: Thermometer,
    type: "schedule",
    gateway: "Loxone Miniserver",
    status: "active",
    lastRun: "Heute, 22:00",
    savings: "~12% Heizkosten",
    color: "#ef4444",
    scope: { location: "Hauptgebäude", floor: null, room: null },
  },
  {
    id: "2",
    name: "Beleuchtung nach Präsenz",
    description: "Licht in Besprechungsräumen nur bei Anwesenheit aktivieren",
    icon: Lightbulb,
    type: "sensor",
    gateway: "Loxone Miniserver",
    status: "active",
    lastRun: "Vor 15 Min.",
    savings: "~25% Stromkosten",
    color: "#f59e0b",
    scope: { location: "Hauptgebäude", floor: "2. OG", room: "Besprechungsraum A" },
  },
  {
    id: "3",
    name: "Lüftung CO₂-gesteuert",
    description: "Lüftungsstufe automatisch anpassen basierend auf CO₂-Konzentration",
    icon: Wind,
    type: "threshold",
    gateway: "Loxone Miniserver",
    status: "active",
    lastRun: "Vor 3 Min.",
    savings: "~8% Energieverbrauch",
    color: "#06b6d4",
    scope: { location: "Hauptgebäude", floor: "1. OG", room: null },
  },
  {
    id: "4",
    name: "Peak-Shaving Lastspitzen",
    description: "Nicht-kritische Verbraucher temporär reduzieren bei Überschreitung des Leistungslimits",
    icon: TrendingDown,
    type: "ai",
    gateway: "Loxone Miniserver",
    status: "paused",
    lastRun: "Gestern, 14:32",
    savings: "~15% Spitzenlastkosten",
    color: "#8b5cf6",
    scope: { location: "Nebengebäude", floor: null, room: null },
  },
  {
    id: "5",
    name: "Raumtemperatur Einzelsteuerung",
    description: "Temperatur im Serverraum konstant auf 21°C halten, unabhängig von Gebäudeautomatik",
    icon: Thermometer,
    type: "threshold",
    gateway: "Loxone Miniserver",
    status: "active",
    lastRun: "Vor 1 Min.",
    savings: "~5% Kühlkosten",
    color: "#10b981",
    scope: { location: "Hauptgebäude", floor: "UG", room: "Serverraum" },
  },
];

const MOCK_AI_RECOMMENDATIONS = [
  {
    id: "r1",
    title: "Heizungsvorlauftemperatur optimieren",
    description: "Basierend auf der Wettervorhersage und dem Gebäudemasse-Modell könnte die Vorlauftemperatur morgens 30 Minuten früher gesenkt werden.",
    impact: "~180 kWh/Monat Einsparung",
    confidence: 92,
    category: "heating",
  },
  {
    id: "r2",
    title: "Beleuchtungszeitplan anpassen",
    description: "Die Außenbeleuchtung wird aktuell 45 Minuten vor Sonnenuntergang aktiviert. Eine Anpassung auf 15 Minuten vor Sonnenuntergang spart Energie ohne Komfortverlust.",
    impact: "~65 kWh/Monat Einsparung",
    confidence: 88,
    category: "lighting",
  },
  {
    id: "r3",
    title: "Wochenend-Betriebsmodus",
    description: "Am Wochenende werden Büroetagen voll klimatisiert, obwohl keine Anwesenheit erkannt wird. Ein Wochenend-Absenkprofil wird empfohlen.",
    impact: "~420 kWh/Monat Einsparung",
    confidence: 95,
    category: "hvac",
  },
];

const MOCK_GATEWAYS = [
  {
    id: "g1",
    name: "Loxone Miniserver",
    type: "loxone",
    location: "Hauptgebäude",
    status: "online",
    devices: 24,
    lastSync: "Vor 2 Min.",
  },
  {
    id: "g2",
    name: "KNX IP Gateway",
    type: "knx",
    location: "Nebengebäude",
    status: "coming_soon",
    devices: 0,
    lastSync: "–",
  },
  {
    id: "g3",
    name: "Modbus TCP Gateway",
    type: "modbus",
    location: "Technikraum",
    status: "coming_soon",
    devices: 0,
    lastSync: "–",
  },
];

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  schedule: { label: "Zeitplan", color: "bg-blue-500/10 text-blue-600" },
  sensor: { label: "Sensorgesteuert", color: "bg-amber-500/10 text-amber-600" },
  threshold: { label: "Schwellwert", color: "bg-cyan-500/10 text-cyan-600" },
  ai: { label: "KI-gesteuert", color: "bg-violet-500/10 text-violet-600" },
};

const Automation = () => {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("automations");

  if (authLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96" />
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Cpu className="h-6 w-6 text-primary" />
                Multi-Location Automation (MLA)
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Intelligente standortübergreifende Gebäudesteuerung mit Automatismen und KI-Empfehlungen
              </p>
            </div>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Neue Automation
              <Badge variant="secondary" className="ml-2 text-[10px]">Bald verfügbar</Badge>
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">4</p>
                  <p className="text-xs text-muted-foreground">Automationen</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">3</p>
                  <p className="text-xs text-muted-foreground">Aktiv</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <BrainCircuit className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">3</p>
                  <p className="text-xs text-muted-foreground">KI-Empfehlungen</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Server className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">1</p>
                  <p className="text-xs text-muted-foreground">Gateway online</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="automations" className="gap-1.5">
                <Zap className="h-4 w-4" /> Automationen
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5">
                <BrainCircuit className="h-4 w-4" /> KI-Empfehlungen
              </TabsTrigger>
              <TabsTrigger value="gateways" className="gap-1.5">
                <Server className="h-4 w-4" /> Gateways
              </TabsTrigger>
            </TabsList>

            {/* Automations Tab */}
            <TabsContent value="automations" className="space-y-4 mt-4">
              {MOCK_AUTOMATIONS.map((auto) => (
                <Card key={auto.id} className="overflow-hidden">
                  <div className="flex">
                    <div className="w-1.5 shrink-0" style={{ backgroundColor: auto.color }} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${auto.color}15` }}
                          >
                            <auto.icon className="h-5 w-5" style={{ color: auto.color }} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{auto.name}</h3>
                              <Badge variant="outline" className={TYPE_LABELS[auto.type]?.color}>
                                {TYPE_LABELS[auto.type]?.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{auto.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Server className="h-3 w-3" /> {auto.gateway}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {auto.lastRun}
                              </span>
                              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                <TrendingDown className="h-3 w-3" /> {auto.savings}
                              </span>
                            </div>
                            {/* Scope: Gebäude / Etage / Raum */}
                            <div className="flex items-center gap-1 mt-2 text-xs">
                              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">{auto.scope.location}</span>
                              {auto.scope.floor && (
                                <>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-foreground">{auto.scope.floor}</span>
                                </>
                              )}
                              {auto.scope.room && (
                                <>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  <DoorOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-foreground">{auto.scope.room}</span>
                                </>
                              )}
                              {!auto.scope.floor && !auto.scope.room && (
                                <span className="text-muted-foreground ml-1">(gesamtes Gebäude)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch checked={auto.status === "active"} disabled />
                          <Button size="icon" variant="ghost" disabled>
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              <div className="flex justify-center pt-4">
                <div className="text-center space-y-2 max-w-md">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Erstellen Sie eigene Automationen mit Zeitplänen, Sensor-Triggern oder KI-basierten Regeln,
                    um Energiekosten zu senken und den Komfort zu optimieren.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* AI Recommendations Tab */}
            <TabsContent value="ai" className="space-y-4 mt-4">
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="p-4 flex items-center gap-3">
                  <BrainCircuit className="h-5 w-5 text-violet-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">KI-Analyse aktiv</p>
                    <p className="text-xs text-muted-foreground">
                      Ihre Verbrauchsdaten werden kontinuierlich analysiert. Die KI identifiziert Einsparpotenziale und schlägt Automationen vor.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {MOCK_AI_RECOMMENDATIONS.map((rec) => (
                <Card key={rec.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-violet-500" />
                          <h3 className="font-semibold">{rec.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.description}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            {rec.impact}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Konfidenz: {rec.confidence}%
                          </span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" disabled className="shrink-0 ml-4">
                        Automation erstellen
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="flex justify-center pt-4">
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-sm font-medium text-violet-600">Geschätztes Gesamtpotenzial</p>
                  <p className="text-3xl font-bold">~665 kWh/Monat</p>
                  <p className="text-xs text-muted-foreground">
                    Die KI lernt kontinuierlich aus Ihren Verbrauchsmustern und optimiert die Empfehlungen.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Gateways Tab */}
            <TabsContent value="gateways" className="space-y-4 mt-4">
              {MOCK_GATEWAYS.map((gw) => (
                <Card key={gw.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          gw.status === "online" ? "bg-emerald-500/10" : "bg-muted"
                        }`}>
                          <Server className={`h-5 w-5 ${
                            gw.status === "online" ? "text-emerald-600" : "text-muted-foreground"
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{gw.name}</h3>
                            {gw.status === "online" ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                <Activity className="h-3 w-3 mr-1" /> Online
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Timer className="h-3 w-3 mr-1" /> In Planung
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span><MapPin className="h-3 w-3 inline mr-1" />{gw.location}</span>
                            {gw.devices > 0 && <span>{gw.devices} Geräte</span>}
                            <span>Letzte Sync: {gw.lastSync}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant={gw.status === "online" ? "outline" : "secondary"}
                        size="sm"
                        disabled={gw.status !== "online"}
                      >
                        {gw.status === "online" ? (
                          <>
                            <Settings2 className="h-4 w-4 mr-1" /> Konfigurieren
                          </>
                        ) : (
                          "Bald verfügbar"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Card className="border-dashed">
                <CardContent className="p-6 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Weitere Gateways</p>
                    <p className="text-sm text-muted-foreground">
                      Zukünftig werden weitere Protokolle unterstützt: KNX, Modbus TCP, BACnet, MQTT und mehr.
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Gateway hinzufügen
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};


export default Automation;
