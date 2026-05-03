import { useState, useMemo, useRef, useEffect } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Input } from "@/components/ui/input";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations, Location } from "@/hooks/useLocations";

import { useCo2Factors } from "@/hooks/useCo2Factors";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import { useLocationYearlyConsumption } from "@/hooks/useLocationYearlyConsumption";
import { useDataCompleteness } from "@/hooks/useDataCompleteness";
import { useEnergyMeasures } from "@/hooks/useEnergyMeasures";
import { useEnergyPrices } from "@/hooks/useEnergyPrices";
import { useReportArchive } from "@/hooks/useReportArchive";
import { calculateCo2, formatCo2 } from "@/lib/co2Calculations";
import { formatCurrency, getActivePrice, calculateEnergyCost } from "@/lib/costCalculations";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BenchmarkIndicator } from "@/components/report/BenchmarkIndicator";
import { Co2FactorSettings } from "@/components/settings/Co2FactorSettings";
import { PropertyProfile } from "@/components/report/PropertyProfile";
import { ConsumptionTrendTable } from "@/components/report/ConsumptionTrendTable";
import { ConsumptionTrendChart } from "@/components/report/ConsumptionTrendChart";
import { LocationRanking } from "@/components/report/LocationRanking";
import { DataCompletenessIndicator } from "@/components/report/DataCompletenessIndicator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Building2, Leaf, BarChart3, Settings2, Archive, TrendingUp, Save, ChevronRight, Sparkles, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { FEDERAL_STATES, getFederalStateName } from "@/lib/federalStates";
import { FEDERAL_STATE_REPORT_PROFILES, getReportProfile, type FederalStateReportProfile } from "@/lib/report/federalStateProfiles";
import { supabase } from "@/integrations/supabase/client";
import { CostAnalysisSection } from "@/components/report/CostAnalysisSection";
import { WeatherCorrectionSection } from "@/components/report/WeatherCorrectionSection";
import { HeatVsElectricitySection } from "@/components/report/HeatVsElectricitySection";
import { SavingsPotentialSection } from "@/components/report/SavingsPotentialSection";
import { RecommendationsSection } from "@/components/report/RecommendationsSection";
import { usePriorityRanking } from "@/hooks/usePriorityRanking";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const EnergyReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, hierarchicalLocations, loading: locLoading } = useLocations();
  const { factors } = useCo2Factors();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { prices } = useEnergyPrices();
  const { measures, addMeasure, deleteMeasure } = useEnergyMeasures();
  const { reports, saveReport, deleteReport, getDownloadUrl, loading: archiveLoading } = useReportArchive();

  const [reportYear, setReportYear] = useState(String(currentYear - 1));
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [compareYears, setCompareYears] = useState(2);
  const [activeTab, setActiveTab] = useState("config");
  const reportRef = useRef<HTMLDivElement>(null);

  // Federal-state aware report profile
  const mainLocation = useMemo(() => locations.find((l) => l.is_main_location), [locations]);
  const autoFederalState = (mainLocation as any)?.federal_state ?? null;
  const [profileCode, setProfileCode] = useState<string>("");
  const effectiveProfileCode = profileCode || autoFederalState || "NI";
  const profile: FederalStateReportProfile = useMemo(() => getReportProfile(effectiveProfileCode), [effectiveProfileCode]);

  // KI-generierte Texte (HTML), persistiert pro Sektion
  const [aiTexts, setAiTexts] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const yearNum = parseInt(reportYear);
  const trendYears = useMemo(() => {
    if (compareYears <= 0) return [yearNum];
    return Array.from({ length: compareYears + 1 }, (_, i) => yearNum - compareYears + i);
  }, [yearNum, compareYears]);

  // Data hooks
  const { data: consumption } = useLocationYearlyConsumption(selectedLocationIds, trendYears);
  const { data: completenessMap } = useDataCompleteness(selectedLocationIds, yearNum);

  // Get child IDs for a given parent
  const getChildIds = (parentId: string): string[] => {
    return locations.filter((l) => l.parent_id === parentId).map((l) => l.id);
  };

  const toggleLocation = (id: string) => {
    setSelectedLocationIds((prev) => {
      const childIds = getChildIds(id);
      if (prev.includes(id)) {
        // Deselect parent + all children
        const toRemove = new Set([id, ...childIds]);
        return prev.filter((x) => !toRemove.has(x));
      } else {
        // Select parent + all children
        const toAdd = [id, ...childIds];
        return [...new Set([...prev, ...toAdd])];
      }
    });
  };

  const toggleChild = (childId: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(childId) ? prev.filter((x) => x !== childId) : [...prev, childId]
    );
  };

  const selectAll = () => {
    if (selectedLocationIds.length === locations.length) {
      setSelectedLocationIds([]);
    } else {
      setSelectedLocationIds(locations.map((l) => l.id));
    }
  };

  const selectedLocations = useMemo(
    () => locations.filter((l) => selectedLocationIds.includes(l.id)),
    [locations, selectedLocationIds]
  );

  const priorityRows = usePriorityRanking(selectedLocations, consumption?.[yearNum], prices, yearNum);

  // Build hierarchical view of selected locations: parents with their selected children
  const selectedHierarchy = useMemo(() => {
    const selectedSet = new Set(selectedLocationIds);
    const result: { parent: Location; children: Location[] }[] = [];
    
    // Only iterate top-level (root) locations from hierarchy
    for (const root of hierarchicalLocations) {
      if (!selectedSet.has(root.id)) {
        // Parent not selected, but maybe children are selected as standalone
        const selectedChildren = (root.children || []).filter((c) => selectedSet.has(c.id));
        if (selectedChildren.length > 0) {
          result.push({ parent: root, children: selectedChildren });
        }
        continue;
      }
      const selectedChildren = (root.children || []).filter((c) => selectedSet.has(c.id));
      result.push({ parent: root, children: selectedChildren });
    }
    return result;
  }, [hierarchicalLocations, selectedLocationIds]);

  const handleGenerateReport = () => {
    setActiveTab("preview");
  };

  const buildFullReportHtml = (): string | null => {
    if (!reportRef.current) return null;

    const chartSvgs: Record<string, string> = {};
    const previewContainer = reportRef.current.parentElement;
    if (previewContainer) {
      const chartCards = previewContainer.querySelectorAll("[data-chart-location]");
      chartCards.forEach((el) => {
        const locId = el.getAttribute("data-chart-location");
        const svg = el.querySelector("svg");
        if (locId && svg) {
          const clone = svg.cloneNode(true) as SVGElement;
          clone.setAttribute("width", "100%");
          clone.setAttribute("height", "250");
          chartSvgs[locId] = clone.outerHTML;
        }
      });
    }

    // Capture other section charts (Kosten, Witterung, Strom-vs-Wärme) by data-chart key
    const sectionChartSvgs: Record<string, string> = {};
    if (previewContainer) {
      previewContainer.querySelectorAll("[data-chart]").forEach((el) => {
        const key = el.getAttribute("data-chart");
        const svg = el.querySelector("svg");
        if (key && svg) {
          const clone = svg.cloneNode(true) as SVGElement;
          clone.setAttribute("width", "100%");
          clone.setAttribute("height", "260");
          sectionChartSvgs[key] = clone.outerHTML;
        }
      });
    }

    // KI-Maßnahmen aus DOM einlesen
    const recHtml =
      previewContainer?.querySelector("[data-report-recommendations-html]")?.innerHTML ?? "";

    let contentHtml = reportRef.current.innerHTML;
    for (const [locId, svgHtml] of Object.entries(chartSvgs)) {
      const placeholder = `<!--chart-placeholder-${locId}-->`;
      contentHtml = contentHtml.replace(placeholder, svgHtml);
    }
    // Inject section charts at end of report (vor Per-Loc-Profilen wäre ideal, hier als Anhang Kostenanalyse)
    const chartsBlock = Object.entries(sectionChartSvgs)
      .map(([k, svg]) => `<div class="chart-container"><h3 style="font-size:11pt">${k}</h3>${svg}</div>`)
      .join("");
    if (chartsBlock) {
      contentHtml = contentHtml.replace(
        '<div data-print-recommendations-slot></div>',
        `${chartsBlock}<div>${recHtml || "<p style=\"color:#6b7280;font-style:italic\">Keine KI-Empfehlungen erstellt.</p>"}</div>`,
      );
    } else {
      contentHtml = contentHtml.replace(
        '<div data-print-recommendations-slot></div>',
        `<div>${recHtml || "<p style=\"color:#6b7280;font-style:italic\">Keine KI-Empfehlungen erstellt.</p>"}</div>`,
      );
    }

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Energiebericht ${reportYear}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
    .page { padding: 20mm; }
    .page-break { page-break-before: always; }
    h1 { font-size: 24pt; margin-bottom: 8pt; }
    h2 { font-size: 16pt; margin-bottom: 6pt; border-bottom: 2px solid #2563eb; padding-bottom: 4pt; }
    h3 { font-size: 13pt; margin: 12pt 0 6pt; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 10pt; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 297mm; }
    .cover h1 { font-size: 32pt; color: #2563eb; }
    .cover p { font-size: 14pt; color: #6b7280; margin-top: 8pt; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12pt; margin: 12pt 0; }
    .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi-box .value { font-size: 18pt; font-weight: 700; color: #2563eb; }
    .kpi-box .label { font-size: 9pt; color: #6b7280; }
    .rating-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
    .rating-green { background: #10b981; }
    .rating-yellow { background: #f59e0b; }
    .rating-red { background: #ef4444; }
    .profile-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12pt; }
    .profile-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
    .profile-meta dt { font-size: 9pt; color: #6b7280; }
    .profile-meta dd { font-weight: 500; margin-bottom: 4pt; }
    .chart-container { margin: 12pt 0; }
    .chart-container svg { max-width: 100%; height: auto; }
    .trend-row { display: flex; align-items: center; gap: 4px; }
    .trend-up { color: #dc2626; }
    .trend-down { color: #059669; }
    @media print { .page { padding: 15mm; } }
  </style>
</head>
<body>${contentHtml}</body>
</html>`;
  };

  const handleArchive = async () => {
    const fullHtml = buildFullReportHtml();
    if (!fullHtml) return;
    await saveReport({
      reportYear: yearNum,
      title: `Energiebericht ${reportYear}`,
      locationIds: selectedLocationIds,
      htmlContent: fullHtml,
      reportConfig: { selectedLocationIds },
    });
  };

  // Aggregate totals for summary
  const totalConsumption = useMemo(() => {
    if (!consumption?.[yearNum]) return {};
    const totals: Record<string, number> = {};
    for (const locId of selectedLocationIds) {
      const locData = consumption[yearNum]?.[locId];
      if (locData) {
        for (const [eType, val] of Object.entries(locData)) {
          totals[eType] = (totals[eType] || 0) + val;
        }
      }
    }
    return totals;
  }, [consumption, yearNum, selectedLocationIds]);

  const totalCo2 = useMemo(() => {
    return Object.entries(totalConsumption).reduce((sum, [eType, kwh]) => {
      const co2 = calculateCo2(kwh, eType, factors);
      return sum + (co2 || 0);
    }, 0);
  }, [totalConsumption, factors]);

  const totalCost = useMemo(() => {
    if (!prices || prices.length === 0) return 0;
    let cost = 0;
    for (const locId of selectedLocationIds) {
      const locData = consumption?.[yearNum]?.[locId];
      if (locData) {
        for (const [eType, kwh] of Object.entries(locData)) {
          const p = getActivePrice(prices, locId, eType, yearNum);
          if (p > 0) cost += calculateEnergyCost(kwh, p);
        }
      }
    }
    return cost;
  }, [consumption, yearNum, selectedLocationIds, prices]);

  const avgCompleteness = useMemo(() => {
    if (!completenessMap || selectedLocationIds.length === 0) return null;
    const vals = selectedLocationIds
      .map((id) => completenessMap[id]?.completenessPercent)
      .filter((v): v is number => v !== undefined);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [completenessMap, selectedLocationIds]);

  const handlePrint = () => {
    const fullHtml = buildFullReportHtml();
    if (!fullHtml) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const generateAiText = async (section: "vorwort" | "einleitung" | "ausblick") => {
    setAiLoading(section);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report-text", {
        body: {
          section,
          profile: {
            code: profile.code, name: profile.name,
            legalBasis: profile.legalBasis, reportingCycle: profile.reportingCycle,
            extraTopics: profile.extraTopics,
          },
          context: {
            tenantName: tenant?.name,
            reportYear: yearNum,
            locationCount: selectedLocations.length,
            totalArea: selectedLocations.reduce((s, l) => s + (l.net_floor_area || 0), 0),
            totalCo2Tons: Math.round(totalCo2 / 1000),
            totalCostEur: Math.round(totalCost),
            existingSections: aiTexts,
          },
        },
      });
      if (error) throw error;
      const html = (data as any)?.html;
      if (html) {
        setAiTexts((prev) => ({ ...prev, [section]: html }));
        setDraftDirty(true);
        toast.success(`${section} generiert`);
      } else {
        toast.error((data as any)?.error || "Keine Antwort vom KI-Dienst");
      }
    } catch (e: any) {
      toast.error(e?.message || "KI-Generierung fehlgeschlagen");
    } finally {
      setAiLoading(null);
    }
  };

  // Draft persistence
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("energy_report_drafts")
        .select("texts")
        .eq("tenant_id", tenant.id)
        .eq("report_year", yearNum)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.texts && typeof data.texts === "object") {
        setAiTexts(data.texts as Record<string, string>);
      } else {
        setAiTexts({});
      }
      setDraftDirty(false);
    })();
    return () => { cancelled = true; };
  }, [tenant?.id, yearNum]);

  const updateAiText = (section: string, html: string) => {
    setAiTexts((prev) => ({ ...prev, [section]: html }));
    setDraftDirty(true);
  };

  const saveDraft = async () => {
    if (!tenant?.id) return;
    setDraftSaving(true);
    try {
      const { error } = await supabase
        .from("energy_report_drafts")
        .upsert(
          {
            tenant_id: tenant.id,
            report_year: yearNum,
            profile_code: effectiveProfileCode,
            texts: aiTexts,
            updated_by: user?.id,
          },
          { onConflict: "tenant_id,report_year" }
        );
      if (error) throw error;
      setDraftDirty(false);
      toast.success("Entwurf gespeichert");
    } catch (e: any) {
      toast.error(e?.message || "Speichern fehlgeschlagen");
    } finally {
      setDraftSaving(false);
    }
  };

  if (authLoading || locLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
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
          <h1 className="text-xl md:text-2xl font-display font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            {t("energyReport.title" as any) || "Kommunaler Energiebericht"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("energyReport.subtitle" as any) || "Erstellen Sie umfassende Energieberichte mit Liegenschaftssteckbriefen, Benchmarking und CO₂-Bilanz"}
          </p>
        </header>

        <div className="p-3 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="config" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Konfiguration
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2" disabled={selectedLocationIds.length === 0}>
                <FileText className="h-4 w-4" />
                Vorschau
              </TabsTrigger>
              <TabsTrigger value="co2" className="gap-2">
                <Leaf className="h-4 w-4" />
                CO₂-Faktoren
              </TabsTrigger>
              <TabsTrigger value="drafts" className="gap-2">
                <Save className="h-4 w-4" />
                Entwürfe
              </TabsTrigger>
              <TabsTrigger value="archive" className="gap-2">
                <Archive className="h-4 w-4" />
                Archiv
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6 mt-6">
              {/* Federal-state profile */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    Bundesland-Profil
                  </CardTitle>
                  <CardDescription>
                    Bestimmt rechtliche Grundlage, Berichtsturnus und Pflichtinhalte. Wird automatisch aus dem Hauptstandort übernommen.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={effectiveProfileCode} onValueChange={setProfileCode}>
                      <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(FEDERAL_STATE_REPORT_PROFILES).map((p) => (
                          <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {autoFederalState && (
                      <Badge variant="secondary" className="text-xs">
                        Hauptstandort: {getFederalStateName(autoFederalState)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Rechtsgrundlage:</strong> {profile.legalBasis}</p>
                    <p><strong>Turnus:</strong> alle {profile.reportingCycle} Jahre · <strong>Witterungsbereinigung:</strong> {profile.weatherCorrection ? "ja" : "nein"} · <strong>Emissionsfaktoren:</strong> {profile.emissionFactors}</p>
                    {profile.extraTopics.length > 0 && (
                      <p><strong>Zusatzpflichten:</strong> {profile.extraTopics.join(", ")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Year selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Berichtseinstellungen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-medium">Berichtsjahr</label>
                      <Select value={reportYear} onValueChange={setReportYear}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEARS.map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-medium">Vergleichsjahre</label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={compareYears}
                        onChange={(e) => setCompareYears(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">
                        {compareYears === 0 ? "Kein Vergleich" : `${compareYears + 1} Jahre (${trendYears[0]}–${trendYears[trendYears.length - 1]})`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Location selection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Liegenschaften auswählen
                      </CardTitle>
                      <CardDescription>
                        {selectedLocationIds.length} / {locations.length} ausgewählt
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      {selectedLocationIds.length === locations.length ? "Alle abwählen" : "Alle auswählen"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {hierarchicalLocations.map((loc) => {
                      const hasChildren = loc.children && loc.children.length > 0;
                      return (
                        <div key={loc.id} className="rounded-lg border overflow-hidden">
                          {/* Parent location row */}
                          <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                            <Checkbox
                              checked={selectedLocationIds.includes(loc.id)}
                              onCheckedChange={() => toggleLocation(loc.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{loc.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {loc.address && `${loc.address}, `}{loc.city || ""}
                              </p>
                            </div>
                            {loc.net_floor_area && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {loc.net_floor_area.toLocaleString("de-DE")} m²
                              </Badge>
                            )}
                          </label>
                          {/* Child buildings inside the same card */}
                          {hasChildren && loc.children!.map((child) => (
                            <label
                              key={child.id}
                              className="flex items-center gap-3 border-t border-dashed px-3 py-2.5 pl-8 cursor-pointer hover:bg-accent/50 transition-colors"
                            >
                              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <Checkbox
                                checked={selectedLocationIds.includes(child.id)}
                                onCheckedChange={() => toggleChild(child.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{child.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {child.address && `${child.address}, `}{child.city || ""}
                                </p>
                              </div>
                              {child.net_floor_area && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {child.net_floor_area.toLocaleString("de-DE")} m²
                                </Badge>
                              )}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={selectedLocationIds.length === 0}
                  onClick={handleGenerateReport}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Bericht erstellen
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-6">
              <div className="flex justify-end gap-2 mb-4">
                <Button variant="outline" onClick={handleArchive} className="gap-2">
                  <Save className="h-4 w-4" />
                  Archivieren
                </Button>
                <Button onClick={handlePrint} className="gap-2">
                  <Download className="h-4 w-4" />
                  Als PDF speichern
                </Button>
              </div>

              {/* AI text generation panel */}
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" />
                    KI-Texte ({profile.name})
                  </CardTitle>
                  <CardDescription>
                    Vorwort, Einleitung und Ausblick werden auf Basis des Bundesland-Profils und Ihrer Daten generiert.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(["vorwort", "einleitung", "ausblick"] as const).map((s) => (
                      <Button key={s} size="sm" variant="outline" disabled={aiLoading === s}
                        onClick={() => generateAiText(s)} className="gap-2">
                        {aiLoading === s ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {(() => {
                          const label = s.charAt(0).toUpperCase() + s.slice(1);
                          return aiTexts[s] ? `${label} neu generieren` : label;
                        })()}
                      </Button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      {draftDirty && (
                        <span className="text-xs text-muted-foreground">Ungespeicherte Änderungen</span>
                      )}
                      <Button size="sm" onClick={saveDraft} disabled={draftSaving || !draftDirty} className="gap-2">
                        {draftSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Entwurf speichern
                      </Button>
                    </div>
                  </div>
                  {(["vorwort", "einleitung", "ausblick"] as const).map((key) =>
                    aiTexts[key] !== undefined && aiTexts[key] !== "" ? (
                      <div key={key} className="space-y-1">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </div>
                        <RichTextEditor
                          content={aiTexts[key] || ""}
                          onChange={(html) => updateAiText(key, html)}
                        />
                      </div>
                    ) : null
                  )}
                  <AiDisclaimer text="Diese Texte wurden mit KI generiert. Bitte vor Veröffentlichung redaktionell prüfen und ggf. anpassen." />
                </CardContent>
              </Card>

              {/* Hidden printable content */}
              <div ref={reportRef} className="hidden">
                {/* Cover page */}
                <div className="page cover">
                  <h1>Kommunaler Energiebericht</h1>
                  <p>{tenant?.name || ""}</p>
                  <p>Berichtsjahr {reportYear}</p>
                  <p style={{ marginTop: "12pt", fontSize: "11pt" }}>
                    {profile.name} · {profile.legalBasis}
                  </p>
                  <p style={{ marginTop: "24pt", fontSize: "11pt", color: "#9ca3af" }}>
                    Erstellt am {new Date().toLocaleDateString("de-DE")}
                  </p>
                </div>

                {aiTexts.vorwort && (
                  <div className="page page-break">
                    <h2>Vorwort</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiTexts.vorwort }} />
                  </div>
                )}
                {aiTexts.einleitung && (
                  <div className="page page-break">
                    <h2>Einleitung</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiTexts.einleitung }} />
                  </div>
                )}

                {/* Management Summary */}
                <div className="page page-break">
                  <h2>Management Summary</h2>
                  <div className="kpi-grid">
                    <div className="kpi-box">
                      <div className="value">{selectedLocations.length}</div>
                      <div className="label">Liegenschaften</div>
                    </div>
                    <div className="kpi-box">
                      <div className="value">
                        {selectedLocations.reduce((sum, l) => sum + (l.net_floor_area || 0), 0).toLocaleString("de-DE")}
                      </div>
                      <div className="label">Gesamtfläche (NGF m²)</div>
                    </div>
                    <div className="kpi-box">
                      <div className="value">{totalCo2 > 0 ? formatCo2(totalCo2) : "–"}</div>
                      <div className="label">CO₂-Emissionen gesamt</div>
                    </div>
                    <div className="kpi-box">
                      <div className="value">{totalCost > 0 ? formatCurrency(totalCost) : "–"}</div>
                      <div className="label">Energiekosten gesamt</div>
                    </div>
                  </div>

                  {avgCompleteness !== null && (
                    <p style={{ fontSize: "10pt", color: "#6b7280", marginBottom: "8pt" }}>
                      Durchschnittliche Datenqualität: {avgCompleteness}%
                    </p>
                  )}

                  <h3>Übersicht der Liegenschaften</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Liegenschaft</th>
                        <th>Typ</th>
                        <th>Baujahr</th>
                        <th>NGF (m²)</th>
                        <th>Heizungsart</th>
                        <th>Energieträger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLocations.map((loc) => (
                        <tr key={loc.id}>
                          <td>{loc.name}</td>
                          <td>{loc.usage_type || "–"}</td>
                          <td>{loc.construction_year || "–"}</td>
                          <td>{loc.net_floor_area?.toLocaleString("de-DE") || "–"}</td>
                          <td>{loc.heating_type || "–"}</td>
                          <td>{(loc.energy_sources || []).join(", ") || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3>CO₂-Emissionsfaktoren</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Energieträger</th>
                        <th>kg CO₂/kWh</th>
                        <th>Quelle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factors.map((f) => (
                        <tr key={f.id}>
                          <td style={{ textTransform: "capitalize" }}>{f.energy_type}</td>
                          <td>{f.factor_kg_per_kwh}</td>
                          <td>{f.source || "–"}</td>
                        </tr>
                      ))}
                      {factors.length === 0 && (
                        <tr><td colSpan={3}>Keine CO₂-Faktoren hinterlegt</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Einsparpotenzial & Priorisierung – Druckseite */}
                {priorityRows.length > 0 && (
                  <div className="page page-break">
                    <h2>Einsparpotenzial &amp; Priorisierungsranking</h2>
                    <p style={{ fontSize: "10pt", color: "#6b7280" }}>
                      Theoretisches Potenzial bei Erreichen der Zielwerte (BMWi/BMUB 2015) – sortiert nach Dringlichkeit.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Liegenschaft</th>
                          <th>Energieträger</th>
                          <th style={{ textAlign: "right" }}>kWh/m²a</th>
                          <th style={{ textAlign: "right" }}>Ø-BM</th>
                          <th style={{ textAlign: "right" }}>Potenzial kWh/a</th>
                          <th style={{ textAlign: "right" }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priorityRows.map((r, i) => (
                          <tr key={`${r.locationId}-${r.energyType}`}>
                            <td>{i + 1}</td>
                            <td>{r.locationName}</td>
                            <td style={{ textTransform: "capitalize" }}>{r.energyType}</td>
                            <td style={{ textAlign: "right" }}>
                              <span className={`rating-dot rating-${r.rating}`}></span>
                              {r.specific.toFixed(1)}
                            </td>
                            <td style={{ textAlign: "right" }}>{r.benchmarkAvg.toFixed(0)}</td>
                            <td style={{ textAlign: "right" }}>
                              {Math.round(r.estSavingsKwh).toLocaleString("de-DE")}
                            </td>
                            <td style={{ textAlign: "right" }}>{r.priorityScore.toLocaleString("de-DE")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Maßnahmenempfehlungen (KI) – Druckseite */}
                <div className="page page-break" data-print-recommendations>
                  <h2>Maßnahmenempfehlungen</h2>
                  <p style={{ fontSize: "10pt", color: "#6b7280" }}>
                    KI-generierte Empfehlungen werden beim Druck eingefügt.
                  </p>
                  <div data-print-recommendations-slot></div>
                </div>

                {/* Individual property profiles with charts */}
                {selectedLocations.map((loc) => {
                  const locConsumption = consumption?.[yearNum]?.[loc.id] || {};
                  // Build trend table data for print
                  const energyTypes = new Set<string>();
                  for (const y of trendYears) {
                    const locData = consumption?.[y]?.[loc.id];
                    if (locData) Object.keys(locData).forEach((t) => energyTypes.add(t));
                  }
                  const sortedYears = [...trendYears].sort((a, b) => a - b);
                  const latestYear = sortedYears[sortedYears.length - 1];
                  const prevYear = sortedYears.length > 1 ? sortedYears[sortedYears.length - 2] : null;

                  return (
                    <div key={loc.id} className="page page-break">
                      <h2>Liegenschaftssteckbrief: {loc.name}</h2>
                      <div className="profile-meta">
                        <div><dt>Adresse</dt><dd>{loc.address ? `${loc.address}, ${loc.postal_code || ""} ${loc.city || ""}` : "–"}</dd></div>
                        <div><dt>Nutzungsart</dt><dd style={{ textTransform: "capitalize" }}>{loc.usage_type || "–"}</dd></div>
                        <div><dt>Baujahr</dt><dd>{loc.construction_year || "–"}</dd></div>
                        <div><dt>Letzte Sanierung</dt><dd>{loc.renovation_year || "–"}</dd></div>
                        <div><dt>Nettogrundfläche (NGF)</dt><dd>{loc.net_floor_area ? `${loc.net_floor_area.toLocaleString("de-DE")} m²` : "–"}</dd></div>
                        <div><dt>Bruttogrundfläche (BGF)</dt><dd>{loc.gross_floor_area ? `${loc.gross_floor_area.toLocaleString("de-DE")} m²` : "–"}</dd></div>
                        <div><dt>Heizungsart</dt><dd>{loc.heating_type || "–"}</dd></div>
                        <div><dt>Energieträger</dt><dd>{(loc.energy_sources || []).join(", ") || "–"}</dd></div>
                      </div>

                      {Object.keys(locConsumption).length > 0 ? (
                        <>
                          <h3>Verbrauchsdaten {reportYear}</h3>
                          <table>
                            <thead>
                              <tr>
                                <th>Energieträger</th>
                                <th>Verbrauch (kWh)</th>
                                {loc.net_floor_area && <th>kWh/m²a</th>}
                                <th>CO₂</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(locConsumption).map(([eType, kwh]) => {
                                const co2 = calculateCo2(kwh, eType, factors);
                                const specific = loc.net_floor_area ? kwh / loc.net_floor_area : null;
                                return (
                                  <tr key={eType}>
                                    <td style={{ textTransform: "capitalize" }}>{eType}</td>
                                    <td>{kwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                                    {loc.net_floor_area && <td>{specific?.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td>}
                                    <td>{co2 !== null ? formatCo2(co2) : "–"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      ) : (
                        <p style={{ marginTop: "16pt", color: "#6b7280", fontStyle: "italic" }}>
                          Keine Verbrauchsdaten für {reportYear} vorhanden.
                        </p>
                      )}

                      {/* Chart placeholder – replaced with SVG at print time */}
                      {energyTypes.size > 0 && trendYears.length > 1 && (
                        <>
                          <h3>Mehrjahresvergleich</h3>
                          <div className="chart-container" dangerouslySetInnerHTML={{ __html: `<!--chart-placeholder-${loc.id}-->` }} />

                          {/* Trend table for print */}
                          <table>
                            <thead>
                              <tr>
                                <th>Energieträger</th>
                                {sortedYears.map((y) => (
                                  <th key={y} style={{ textAlign: "right" }}>{y}</th>
                                ))}
                                <th style={{ textAlign: "right" }}>Trend</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from(energyTypes).sort().map((eType) => {
                                const latestVal = consumption?.[latestYear]?.[loc.id]?.[eType] || 0;
                                const prevVal = prevYear ? (consumption?.[prevYear]?.[loc.id]?.[eType] || 0) : 0;
                                const trendPct = prevVal > 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;
                                return (
                                  <tr key={eType}>
                                    <td style={{ textTransform: "capitalize" }}>{eType}</td>
                                    {sortedYears.map((y) => (
                                      <td key={y} style={{ textAlign: "right" }}>
                                        {consumption?.[y]?.[loc.id]?.[eType]
                                          ? `${consumption[y][loc.id][eType].toLocaleString("de-DE", { maximumFractionDigits: 0 })} kWh`
                                          : "–"}
                                      </td>
                                    ))}
                                    <td style={{ textAlign: "right" }}>
                                      {prevVal > 0 ? (
                                        <span className={trendPct > 2 ? "trend-up" : trendPct < -2 ? "trend-down" : ""}>
                                          {trendPct > 0 ? "↑ +" : trendPct < -2 ? "↓ " : ""}
                                          {trendPct.toFixed(1)}%
                                        </span>
                                      ) : "–"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      )}

                      <h3>Ansprechpartner</h3>
                      <p>{loc.contact_person || "–"}{loc.contact_email ? ` · ${loc.contact_email}` : ""}{loc.contact_phone ? ` · ${loc.contact_phone}` : ""}</p>
                    </div>
                  );
                })}

                {aiTexts.ausblick && (
                  <div className="page page-break">
                    <h2>Ausblick</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiTexts.ausblick }} />
                  </div>
                )}
              </div>

              {/* On-screen preview */}
              <div className="space-y-6">
                {/* Summary card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Kommunaler Energiebericht {reportYear}</CardTitle>
                    <CardDescription>
                      {tenant?.name} · {selectedLocations.length} Liegenschaften · Erstellt am {new Date().toLocaleDateString("de-DE")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border p-4 text-center">
                        <p className="text-3xl font-bold text-primary">{selectedLocations.length}</p>
                        <p className="text-sm text-muted-foreground">Liegenschaften</p>
                      </div>
                      <div className="rounded-lg border p-4 text-center">
                        <p className="text-3xl font-bold text-primary">
                          {selectedLocations.reduce((s, l) => s + (l.net_floor_area || 0), 0).toLocaleString("de-DE")}
                        </p>
                        <p className="text-sm text-muted-foreground">NGF (m²)</p>
                      </div>
                      <div className="rounded-lg border p-4 text-center">
                        <p className="text-3xl font-bold text-primary">
                          {totalCo2 > 0 ? formatCo2(totalCo2) : "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">CO₂-Emissionen</p>
                      </div>
                      <div className="rounded-lg border p-4 text-center">
                        <p className="text-3xl font-bold text-primary">
                          {totalCost > 0 ? formatCurrency(totalCost) : "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">Energiekosten</p>
                      </div>
                    </div>
                    {avgCompleteness !== null && (
                      <p className="text-sm text-muted-foreground mt-3">
                        Durchschnittliche Datenqualität: <span className="font-medium">{avgCompleteness}%</span>
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Ranking */}
                {consumption?.[yearNum] && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Liegenschafts-Ranking (Strom kWh/m²a)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <LocationRanking
                        locations={selectedLocations}
                        consumption={consumption[yearNum]}
                        energyType="strom"
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Trend charts per location (used for PDF capture) */}
                {consumption && selectedLocations.map((loc) => (
                  <Card key={loc.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Mehrjahresvergleich – {loc.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div data-chart-location={loc.id}>
                        <ConsumptionTrendChart
                          locationId={loc.id}
                          consumption={consumption}
                          years={trendYears}
                        />
                      </div>
                      <ConsumptionTrendTable
                        locationId={loc.id}
                        consumption={consumption}
                        years={trendYears}
                      />
                    </CardContent>
                  </Card>
                ))}

                {/* Kostenanalyse */}
                <CostAnalysisSection
                  locations={selectedLocations}
                  consumption={consumption}
                  prices={prices}
                  years={trendYears}
                />

                {/* Witterungsbereinigung – nur wenn Profil dies vorsieht */}
                {profile.weatherCorrection && (
                  <WeatherCorrectionSection
                    locations={selectedLocations}
                    consumption={consumption}
                    years={trendYears}
                  />
                )}

                {/* Strom vs. Wärme */}
                <HeatVsElectricitySection
                  locations={selectedLocations}
                  consumption={consumption}
                  years={trendYears}
                />

                {/* Einsparpotenzial / Priorisierung */}
                <SavingsPotentialSection rows={priorityRows} />

                {/* Maßnahmenempfehlungen (KI) */}
                <RecommendationsSection
                  profile={profile}
                  tenantName={tenant?.name}
                  reportYear={yearNum}
                  rows={priorityRows}
                />

                {/* Property profiles – grouped by parent */}
                {selectedHierarchy.map(({ parent, children }) => (
                  <div key={parent.id} className="space-y-4">
                    <PropertyProfile
                      location={parent}
                      reportYear={yearNum}
                      factors={factors}
                      consumption={consumption?.[yearNum]?.[parent.id]}
                      completeness={completenessMap?.[parent.id]}
                      measures={measures.filter((m) => m.location_id === parent.id)}
                      prices={prices}
                      onAddMeasure={(m) => addMeasure(m)}
                      onDeleteMeasure={deleteMeasure}
                    />
                    {children.length > 0 && (
                      <div className="ml-6 space-y-4 border-l-2 border-primary/20 pl-4">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          Gebäude in {parent.name}
                        </p>
                        {children.map((child) => (
                          <PropertyProfile
                            key={child.id}
                            location={child}
                            reportYear={yearNum}
                            factors={factors}
                            consumption={consumption?.[yearNum]?.[child.id]}
                            completeness={completenessMap?.[child.id]}
                            measures={measures.filter((m) => m.location_id === child.id)}
                            prices={prices}
                            onAddMeasure={(m) => addMeasure(m)}
                            onDeleteMeasure={deleteMeasure}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="co2" className="mt-6">
              <Co2FactorSettings />
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
              <DraftsList
                tenantId={tenant?.id}
                onOpen={(year) => {
                  setReportYear(String(year));
                  setActiveTab("preview");
                }}
              />
            </TabsContent>

            <TabsContent value="archive" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Archive className="h-5 w-5" />
                    Archivierte Berichte
                  </CardTitle>
                  <CardDescription>
                    Gespeicherte Energieberichte zum erneuten Download
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {reports.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Noch keine Berichte archiviert. Erstellen Sie einen Bericht und klicken Sie auf "Archivieren".
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border p-4">
                          <div>
                            <p className="font-medium">{r.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(r.generated_at).toLocaleDateString("de-DE")} · {r.location_ids.length} Liegenschaften
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {r.pdf_storage_path && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const url = await getDownloadUrl(r.pdf_storage_path!);
                                  if (!url) return;
                                  try {
                                    const res = await fetch(url);
                                    const html = await res.text();
                                    const blob = new Blob([html], { type: "text/html" });
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, "_blank");
                                  } catch {
                                    window.open(url, "_blank");
                                  }
                                }}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Öffnen
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => deleteReport(r.id, r.pdf_storage_path)}
                            >
                              Löschen
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <AiDisclaimer text="Die im Energiebericht dargestellten Kennwerte und CO₂-Bilanzen basieren auf den erfassten Verbrauchsdaten und hinterlegten Faktoren. Keine Gewähr für Vollständigkeit oder Richtigkeit. Ergebnisse ersetzen keine fachliche Prüfung." />
        </div>
      </main>
    </div>
  );
};

export default EnergyReport;
