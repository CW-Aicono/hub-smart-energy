import { useState, useMemo, useRef, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useCo2Factors } from "@/hooks/useCo2Factors";
import { useTenant } from "@/hooks/useTenant";
import { useLocationYearlyConsumption } from "@/hooks/useLocationYearlyConsumption";
import { useEnergyPrices } from "@/hooks/useEnergyPrices";
import { calculateCo2, formatCo2 } from "@/lib/co2Calculations";
import { formatCurrency, getActivePrice, calculateEnergyCost } from "@/lib/costCalculations";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { Leaf, Download, Settings2, FileText, Save, Sparkles, Loader2, Building2, Scale, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SONSTIGE_FRAMEWORKS, type SonstigeFrameworkCode, TENANT_TYPE_PROFILES } from "@/lib/report/tenantTypeProfiles";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const SonstigeReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locLoading } = useLocations();
  const { factors } = useCo2Factors();
  const { tenant } = useTenant();
  const { prices } = useEnergyPrices();
  const profile = TENANT_TYPE_PROFILES.sonstige;

  const [framework, setFramework] = useState<SonstigeFrameworkCode>("FREIWILLIG");
  const [reportYear, setReportYear] = useState(String(currentYear - 1));
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("config");
  const [aiTexts, setAiTexts] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const yearNum = parseInt(reportYear);
  const { data: consumption } = useLocationYearlyConsumption(selectedLocationIds, [yearNum]);

  const selectedLocations = useMemo(
    () => locations.filter((l) => selectedLocationIds.includes(l.id)),
    [locations, selectedLocationIds],
  );

  const toggleLocation = (id: string) =>
    setSelectedLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const totalConsumption = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!consumption?.[yearNum]) return totals;
    for (const locId of selectedLocationIds) {
      const data = consumption[yearNum]?.[locId];
      if (data) for (const [e, v] of Object.entries(data)) totals[e] = (totals[e] || 0) + v;
    }
    return totals;
  }, [consumption, yearNum, selectedLocationIds]);

  const totals = useMemo(() => {
    let co2 = 0;
    let cost = 0;
    let total = 0;
    for (const [e, kwh] of Object.entries(totalConsumption)) {
      total += kwh;
      co2 += calculateCo2(kwh, e, factors) ?? 0;
      for (const locId of selectedLocationIds) {
        const v = consumption?.[yearNum]?.[locId]?.[e];
        if (!v) continue;
        const p = getActivePrice(prices || [], locId, e, yearNum);
        if (p > 0) cost += calculateEnergyCost(v, p);
      }
    }
    return { total, co2, cost };
  }, [totalConsumption, consumption, yearNum, selectedLocationIds, prices, factors]);

  // Draft persistence
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("energy_report_drafts")
        .select("texts, profile_code")
        .eq("tenant_id", tenant.id)
        .eq("report_year", yearNum)
        .maybeSingle();
      if (cancelled) return;
      if (data?.texts && typeof data.texts === "object") setAiTexts(data.texts as Record<string, string>);
      else setAiTexts({});
      if (data?.profile_code && data.profile_code in SONSTIGE_FRAMEWORKS) {
        setFramework(data.profile_code as SonstigeFrameworkCode);
      }
      setDraftDirty(false);
    })();
    return () => { cancelled = true; };
  }, [tenant?.id, yearNum]);

  const saveDraft = async () => {
    if (!tenant?.id) return;
    setDraftSaving(true);
    try {
      const { error } = await supabase.from("energy_report_drafts").upsert(
        { tenant_id: tenant.id, report_year: yearNum, profile_code: framework, texts: aiTexts, updated_by: user?.id },
        { onConflict: "tenant_id,report_year" },
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

  const generateAiText = async (section: string) => {
    setAiLoading(section);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report-text", {
        body: {
          tenantType: "sonstige",
          section,
          framework: { code: framework, ...SONSTIGE_FRAMEWORKS[framework] },
          context: {
            tenantName: tenant?.name,
            reportYear: yearNum,
            locationCount: selectedLocations.length,
            totalKwh: Math.round(totals.total),
            totalCo2Tons: Math.round(totals.co2 / 1000),
            totalCostEur: Math.round(totals.cost),
            existingSections: aiTexts,
          },
        },
      });
      if (error) throw error;
      const html = (data as any)?.html;
      if (html) {
        setAiTexts((p) => ({ ...p, [section]: html }));
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

  const buildFullReportHtml = (): string | null => {
    if (!reportRef.current) return null;
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Bericht ${reportYear}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5}
  .page{padding:20mm}.page-break{page-break-before:always}
  h1{font-size:24pt;margin-bottom:8pt}h2{font-size:16pt;margin-bottom:6pt;border-bottom:2px solid #0d9488;padding-bottom:4pt}
  h3{font-size:13pt;margin:12pt 0 6pt}
  table{width:100%;border-collapse:collapse;margin:8pt 0}
  th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;font-size:10pt}
  th{background:#f3f4f6;font-weight:600}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:297mm}
  .cover h1{font-size:32pt;color:#0d9488}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12pt;margin:12pt 0}
  .kpi-box{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .kpi-box .value{font-size:18pt;font-weight:700;color:#0d9488}
  .kpi-box .label{font-size:9pt;color:#6b7280}
</style></head><body>${reportRef.current.innerHTML}</body></html>`;
  };

  const handlePrint = () => {
    const html = buildFullReportHtml();
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  if (authLoading || locLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6"><Skeleton className="h-96" /></main>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const fw = SONSTIGE_FRAMEWORKS[framework];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-display font-bold flex items-center gap-2">
            <Leaf className="h-6 w-6" />
            {profile.reportTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{profile.reportSubtitle}</p>
        </header>

        <div className="p-3 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="config" className="gap-2"><Settings2 className="h-4 w-4" />Konfiguration</TabsTrigger>
              <TabsTrigger value="preview" className="gap-2" disabled={selectedLocationIds.length === 0}>
                <FileText className="h-4 w-4" />Vorschau
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />Berichtsrahmen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={framework} onValueChange={(v) => setFramework(v as SonstigeFrameworkCode)}>
                    <SelectTrigger className="w-full md:w-[480px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.values(SONSTIGE_FRAMEWORKS).map((f) => (
                        <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Grundlage:</strong> {fw.legalBasis}</p>
                    <p>{fw.description}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Berichtsjahr</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={reportYear} onValueChange={setReportYear}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Liegenschaften / Objekte</CardTitle>
                  <CardDescription>{selectedLocationIds.length} / {locations.length} ausgewählt</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {locations.map((loc) => (
                      <label key={loc.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50">
                        <Checkbox checked={selectedLocationIds.includes(loc.id)} onCheckedChange={() => toggleLocation(loc.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{loc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{loc.city || ""}</p>
                        </div>
                        {loc.net_floor_area && (
                          <Badge variant="secondary" className="text-xs shrink-0">{loc.net_floor_area.toLocaleString("de-DE")} m²</Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button size="lg" disabled={selectedLocationIds.length === 0} onClick={() => setActiveTab("preview")} className="gap-2">
                  <FileText className="h-4 w-4" />Bericht erstellen
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-6 space-y-6">
              <div className="flex justify-end gap-2">
                <Button onClick={handlePrint} className="gap-2"><Download className="h-4 w-4" />Als PDF speichern</Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" />KI-Texte ({fw.label})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {profile.aiSections.map((s) => (
                      <Button key={s.key} size="sm" variant="outline" disabled={aiLoading === s.key}
                        onClick={() => generateAiText(s.key)} className="gap-2">
                        {aiLoading === s.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {aiTexts[s.key] ? `${s.label} neu generieren` : s.label}
                      </Button>
                    ))}
                    <div className="ml-auto">
                      <Button size="sm" onClick={saveDraft} disabled={draftSaving || !draftDirty} className="gap-2">
                        {draftSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Entwurf speichern
                      </Button>
                    </div>
                  </div>
                  {profile.aiSections.map((s) =>
                    aiTexts[s.key] ? (
                      <div key={s.key} className="space-y-1">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">{s.label}</div>
                        <RichTextEditor content={aiTexts[s.key]} onChange={(html) => { setAiTexts((p) => ({ ...p, [s.key]: html })); setDraftDirty(true); }} />
                      </div>
                    ) : null,
                  )}
                  <AiDisclaimer text="Diese Texte wurden mit KI generiert. Bitte vor Veröffentlichung redaktionell prüfen." />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{profile.reportTitle} {reportYear}</CardTitle>
                  <CardDescription>
                    {tenant?.name} · {fw.label} · {selectedLocations.length} Objekte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{Math.round(totals.total).toLocaleString("de-DE")}</p>
                      <p className="text-xs text-muted-foreground">Endenergie (kWh)</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{totals.co2 > 0 ? formatCo2(totals.co2) : "–"}</p>
                      <p className="text-xs text-muted-foreground">CO₂ (Scope 1+2)</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{totals.cost > 0 ? formatCurrency(totals.cost) : "–"}</p>
                      <p className="text-xs text-muted-foreground">Energiekosten</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div ref={reportRef} className="hidden">
                <div className="page cover">
                  <h1>{profile.reportTitle}</h1>
                  <p>{tenant?.name || ""}</p>
                  <p>Berichtsjahr {reportYear}</p>
                  <p style={{ marginTop: "12pt", fontSize: "11pt" }}>{fw.label}</p>
                  <p style={{ marginTop: "12pt", fontSize: "10pt", color: "#6b7280" }}>{fw.legalBasis}</p>
                  <p style={{ marginTop: "24pt", fontSize: "11pt", color: "#9ca3af" }}>Erstellt am {new Date().toLocaleDateString("de-DE")}</p>
                </div>

                {profile.aiSections.map((s) => aiTexts[s.key] ? (
                  <div key={s.key} className="page page-break">
                    <h2>{s.label}</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiTexts[s.key] }} />
                  </div>
                ) : null)}

                <div className="page page-break">
                  <h2>Energie- & Emissionsbilanz {reportYear}</h2>
                  <div className="kpi-grid">
                    <div className="kpi-box"><div className="value">{Math.round(totals.total).toLocaleString("de-DE")}</div><div className="label">Endenergie kWh</div></div>
                    <div className="kpi-box"><div className="value">{totals.co2 > 0 ? formatCo2(totals.co2) : "–"}</div><div className="label">CO₂ (Scope 1+2)</div></div>
                    <div className="kpi-box"><div className="value">{totals.cost > 0 ? formatCurrency(totals.cost) : "–"}</div><div className="label">Kosten</div></div>
                  </div>

                  <h3>Verbrauch nach Energieträger</h3>
                  <table>
                    <thead><tr><th>Energieträger</th><th>Verbrauch (kWh)</th><th>CO₂</th></tr></thead>
                    <tbody>
                      {Object.entries(totalConsumption).map(([e, kwh]) => {
                        const co2 = calculateCo2(kwh, e, factors);
                        return (
                          <tr key={e}>
                            <td style={{ textTransform: "capitalize" }}>{e}</td>
                            <td>{kwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                            <td>{co2 !== null ? formatCo2(co2) : "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <h3>Objektübersicht</h3>
                  <table>
                    <thead><tr><th>Objekt</th><th>Nutzung</th><th>Fläche (m²)</th></tr></thead>
                    <tbody>
                      {selectedLocations.map((loc) => (
                        <tr key={loc.id}>
                          <td>{loc.name}</td>
                          <td>{loc.usage_type || "–"}</td>
                          <td>{loc.net_floor_area?.toLocaleString("de-DE") || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <AiDisclaimer text="Die im Bericht dargestellten Kennwerte basieren auf den erfassten Verbrauchsdaten und hinterlegten Faktoren. Keine Gewähr für Vollständigkeit oder Richtigkeit." />
        </div>
      </main>
    </div>
  );
};

export default SonstigeReport;
