import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocations } from "@/hooks/useLocations";
import { useCopilotAnalysis, CopilotAnalysisResult } from "@/hooks/useCopilotAnalysis";
import { useCopilotProjects } from "@/hooks/useCopilotProjects";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, TrendingUp, Landmark, FolderKanban, History, Loader2, Sun, Battery, Flame, Zap, Shield, ArrowRight, ExternalLink } from "lucide-react";
import { useDemoMode } from "@/contexts/DemoMode";

const TECH_ICONS: Record<string, typeof Sun> = {
  pv: Sun,
  battery: Battery,
  heat_pump: Flame,
  load_management: Zap,
  ev_charging: Zap,
  insulation: Shield,
};

const TECH_LABELS: Record<string, string> = {
  pv: "Photovoltaik",
  battery: "Batteriespeicher",
  heat_pump: "Wärmepumpe",
  load_management: "Lastmanagement",
  ev_charging: "Ladeinfrastruktur",
  insulation: "Gebäudedämmung",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const LEVEL_LABELS: Record<string, string> = {
  bund: "Bund",
  land: "Land",
  kommune: "Kommune",
};

function formatEur(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

const Copilot = () => {
  const { t } = useTranslation();
  const isDemo = useDemoMode();
  const { locations = [] } = useLocations();
  const { analyses, isLoadingHistory, runAnalysis, isAnalyzing } = useCopilotAnalysis();
  const { projects, createProject, updateProjectStatus } = useCopilotProjects();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [roofArea, setRoofArea] = useState("");
  const [gridConnection, setGridConnection] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [result, setResult] = useState<CopilotAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState("analysis");

  const handleAnalyze = async () => {
    if (!selectedLocationId) return;
    const input_params: Record<string, number> = {};
    if (roofArea) input_params.roof_area_sqm = Number(roofArea);
    if (gridConnection) input_params.grid_connection_kva = Number(gridConnection);
    if (budgetLimit) input_params.budget_limit = Number(budgetLimit);

    const res = await runAnalysis.mutateAsync({
      location_id: selectedLocationId,
      input_params,
    });
    setResult(res);
    setActiveTab("analysis");
  };

  const handleAddProject = (rec: any, analysisId: string) => {
    createProject.mutate({
      analysis_id: analysisId,
      location_id: selectedLocationId || null,
      title: rec.title,
      technology: rec.technology,
      priority: 1,
      estimated_investment: rec.estimated_cost_eur,
      estimated_funding: 0,
      estimated_roi_years: rec.estimated_cost_eur / (rec.estimated_savings_year_eur || 1),
      estimated_savings_year: rec.estimated_savings_year_eur,
      status: "planned",
      target_year: new Date().getFullYear() + 1,
      notes: rec.description,
    });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">EMS-Copilot</h1>
            <p className="text-sm text-muted-foreground">
              KI-gestützter Investitionsberater für Energieprojekte
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Panel */}
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Standort & Parameter</CardTitle>
                <CardDescription>Wählen Sie einen Standort und geben Sie optionale Parameter ein</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Standort</Label>
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Standort wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc: any) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Verfügbare Dachfläche (m²)</Label>
                  <Input
                    type="number"
                    placeholder="z.B. 500"
                    value={roofArea}
                    onChange={(e) => setRoofArea(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Netzanschlussleistung (kVA)</Label>
                  <Input
                    type="number"
                    placeholder="z.B. 400"
                    value={gridConnection}
                    onChange={(e) => setGridConnection(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Budget-Obergrenze (€)</Label>
                  <Input
                    type="number"
                    placeholder="optional"
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!selectedLocationId || isAnalyzing}
                  onClick={handleAnalyze}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyse läuft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Analyse starten
                    </>
                  )}
                </Button>

                <AiDisclaimer text="Die Ergebnisse basieren auf KI-Berechnungen und ersetzen keine professionelle Energieberatung. Alle Angaben ohne Gewähr." />
              </CardContent>
            </Card>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-8">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="analysis" className="gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Analyse</span>
                </TabsTrigger>
                <TabsTrigger value="funding" className="gap-1">
                  <Landmark className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Förderung</span>
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="gap-1">
                  <FolderKanban className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Pipeline</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1">
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Historie</span>
                </TabsTrigger>
              </TabsList>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="space-y-4 mt-4">
                {!result && !isAnalyzing && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Wählen Sie einen Standort und starten Sie die Analyse.</p>
                      <p className="text-sm mt-1">Der Copilot analysiert Ihre Betriebsdaten und empfiehlt optimale Investitionen.</p>
                    </CardContent>
                  </Card>
                )}

                {isAnalyzing && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                      <p className="font-medium">KI-Analyse wird durchgeführt...</p>
                      <p className="text-sm text-muted-foreground mt-1">Betriebsdaten, Marktdaten und Förderprogramme werden ausgewertet.</p>
                    </CardContent>
                  </Card>
                )}

                {result && !isAnalyzing && (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card>
                        <CardContent className="pt-4 pb-3 px-4">
                          <p className="text-xs text-muted-foreground">Investition</p>
                          <p className="text-lg font-bold text-foreground">{formatEur(result.summary.total_investment_eur)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-3 px-4">
                          <p className="text-xs text-muted-foreground">Förderung</p>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatEur(result.summary.total_funding_eur)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-3 px-4">
                          <p className="text-xs text-muted-foreground">Einsparung/Jahr</p>
                          <p className="text-lg font-bold text-foreground">{formatEur(result.summary.annual_savings_eur)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-3 px-4">
                          <p className="text-xs text-muted-foreground">Bester ROI</p>
                          <p className="text-lg font-bold text-primary">{result.summary.best_roi_years} Jahre</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Key Insight */}
                    {result.summary.key_insight && (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="py-3 px-4 flex items-start gap-2">
                          <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          <p className="text-sm text-foreground">{result.summary.key_insight}</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Recommendations */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground">Empfehlungen</h3>
                      {result.recommendations.map((rec, i) => {
                        const Icon = TECH_ICONS[rec.technology] || Zap;
                        return (
                          <Card key={i}>
                            <CardContent className="py-4 px-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1">
                                  <div className="p-2 rounded-md bg-muted">
                                    <Icon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-medium text-foreground">{rec.title}</h4>
                                      <Badge variant="outline" className={CONFIDENCE_COLORS[rec.confidence]}>
                                        {rec.confidence === "high" ? "Hohe" : rec.confidence === "medium" ? "Mittlere" : "Niedrige"} Konfidenz
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                                    <div className="flex flex-wrap gap-4 mt-2 text-sm">
                                      <span><strong>Kapazität:</strong> {rec.capacity}</span>
                                      <span><strong>Kosten:</strong> {formatEur(rec.estimated_cost_eur)}</span>
                                      <span><strong>Einsparung/Jahr:</strong> {formatEur(rec.estimated_savings_year_eur)}</span>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddProject(rec, result.analysis.id)}
                                >
                                  <ArrowRight className="h-3.5 w-3.5 mr-1" />
                                  Pipeline
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {/* ROI Scenarios */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground">ROI-Szenarien</h3>
                      <Card>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Szenario</TableHead>
                              <TableHead className="text-right">Investition</TableHead>
                              <TableHead className="text-right">Förderung</TableHead>
                              <TableHead className="text-right">Einsparung/Jahr</TableHead>
                              <TableHead className="text-right">ROI</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.roi_scenarios.map((sc, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{sc.name}</TableCell>
                                <TableCell className="text-right">{formatEur(sc.total_investment_eur)}</TableCell>
                                <TableCell className="text-right text-green-600 dark:text-green-400">{formatEur(sc.total_funding_eur)}</TableCell>
                                <TableCell className="text-right">{formatEur(sc.annual_savings_eur)}</TableCell>
                                <TableCell className="text-right font-semibold">{sc.roi_years} J.</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Funding Tab */}
              <TabsContent value="funding" className="space-y-4 mt-4">
                {result?.funding_matches && result.funding_matches.length > 0 ? (
                  <>
                    {/* Funding by level */}
                    {(["bund", "land", "kommune"] as const).map((level) => {
                      const matches = result.funding_matches.filter((f) => f.level === level);
                      if (matches.length === 0) return null;
                      const totalLevel = matches.reduce((s, f) => s + f.estimated_amount_eur, 0);
                      return (
                        <div key={level} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-foreground">{LEVEL_LABELS[level]}</h3>
                            <Badge variant="secondary">{formatEur(totalLevel)}</Badge>
                          </div>
                          {matches.map((fm, i) => (
                            <Card key={i}>
                              <CardContent className="py-3 px-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h4 className="font-medium text-foreground">{fm.program_name}</h4>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                      Für: {fm.applicable_technologies.map((t) => TECH_LABELS[t] || t).join(", ")}
                                    </p>
                                    {fm.notes && <p className="text-xs text-muted-foreground mt-1">{fm.notes}</p>}
                                  </div>
                                  <span className="font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                                    {formatEur(fm.estimated_amount_eur)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Landmark className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Führen Sie zuerst eine Analyse durch, um passende Förderprogramme zu sehen.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Pipeline Tab */}
              <TabsContent value="pipeline" className="space-y-4 mt-4">
                {projects.length > 0 ? (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Projekt</TableHead>
                          <TableHead>Technologie</TableHead>
                          <TableHead className="text-right">Investition</TableHead>
                          <TableHead className="text-right">ROI</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.map((proj, i) => (
                          <TableRow key={proj.id}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell className="font-medium">{proj.title}</TableCell>
                            <TableCell>{TECH_LABELS[proj.technology || ""] || proj.technology}</TableCell>
                            <TableCell className="text-right">{formatEur(proj.estimated_investment)}</TableCell>
                            <TableCell className="text-right">{proj.estimated_roi_years ? `${proj.estimated_roi_years.toFixed(1)} J.` : "–"}</TableCell>
                            <TableCell>
                              <Select
                                value={proj.status}
                                onValueChange={(v) => updateProjectStatus.mutate({ id: proj.id, status: v })}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="planned">Geplant</SelectItem>
                                  <SelectItem value="approved">Genehmigt</SelectItem>
                                  <SelectItem value="in_progress">In Umsetzung</SelectItem>
                                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Noch keine Projekte in der Pipeline.</p>
                      <p className="text-sm mt-1">Fügen Sie Empfehlungen aus der Analyse hinzu.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="space-y-4 mt-4">
                {analyses.length > 0 ? (
                  <div className="space-y-3">
                    {analyses.map((a: any) => (
                      <Card
                        key={a.id}
                        className="cursor-pointer hover:border-primary/30 transition-colors"
                        onClick={() => {
                          setResult({
                            analysis: a,
                            summary: {
                              total_investment_eur: a.total_investment || 0,
                              total_funding_eur: a.total_funding || 0,
                              best_roi_years: a.best_roi_years || 0,
                              annual_savings_eur: 0,
                              key_insight: "",
                            },
                            recommendations: a.recommendations || [],
                            roi_scenarios: a.roi_scenarios || [],
                            funding_matches: a.funding_matches || [],
                          });
                          setActiveTab("analysis");
                        }}
                      >
                        <CardContent className="py-3 px-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">
                              {a.analysis_type === "portfolio" ? "Portfolio-Analyse" : "Standort-Analyse"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(a.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">{formatEur(a.total_investment || 0)}</p>
                            <p className="text-sm text-green-600 dark:text-green-400">{a.best_roi_years ? `ROI: ${a.best_roi_years} J.` : ""}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Noch keine Analysen durchgeführt.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Copilot;
