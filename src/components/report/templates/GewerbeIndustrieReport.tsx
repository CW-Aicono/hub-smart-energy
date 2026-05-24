import { useState, useMemo, useRef, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useCo2Factors } from "@/hooks/useCo2Factors";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import { useLocationYearlyConsumption } from "@/hooks/useLocationYearlyConsumption";
import { useEnergyPrices } from "@/hooks/useEnergyPrices";
import { calculateCo2, formatCo2 } from "@/lib/co2Calculations";
import { formatCurrency, getActivePrice, calculateEnergyCost } from "@/lib/costCalculations";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { FileText, Download, Building2, Factory, Scale, Settings2, Save, Sparkles, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GEWERBE_FRAMEWORKS, type GewerbeFrameworkCode, TENANT_TYPE_PROFILES } from "@/lib/report/tenantTypeProfiles";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const GewerbeIndustrieReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locLoading } = useLocations();
  const { factors } = useCo2Factors();
  const { tenant } = useTenant();
  const { prices } = useEnergyPrices();
  const { t } = useTranslation();
  const profile = TENANT_TYPE_PROFILES.gewerbe_industrie;

  const [framework, setFramework] = useState<GewerbeFrameworkCode>("EnEfG");
  const [reportYear, setReportYear] = useState(String(currentYear - 1));
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("config");
  const [productionUnit, setProductionUnit] = useState<string>("");
  const [productionVolume, setProductionVolume] = useState<string>("");
  const [revenueEur, setRevenueEur] = useState<string>("");
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

  const selectAll = () =>
    setSelectedLocationIds(selectedLocationIds.length === locations.length ? [] : locations.map((l) => l.id));

  const totalConsumption = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!consumption?.[yearNum]) return totals;
    for (const locId of selectedLocationIds) {
      const data = consumption[yearNum]?.[locId];
      if (data) for (const [e, v] of Object.entries(data)) totals[e] = (totals[e] || 0) + v;
    }
    return totals;
  }, [consumption, yearNum, selectedLocationIds]);

  const totalArea = useMemo(
    () => selectedLocations.reduce((s, l) => s + (l.net_floor_area || 0), 0),
    [selectedLocations],
  );

  /** Scope 1 = direkte Emissionen (Brennstoffe), Scope 2 = Strom/Fernwärme */
  const scope1Types = new Set(["gas", "oel", "heizoel", "biomasse", "fluessiggas", "wasserstoff", "kraftstoff"]);
  const scope2Types = new Set(["strom", "fernwaerme", "fernwarme", "nahwaerme"]);

  const scopes = useMemo(() => {
    let s1 = 0;
    let s2 = 0;
    let totalKwh = 0;
    for (const [eType, kwh] of Object.entries(totalConsumption)) {
      const co2 = calculateCo2(kwh, eType, factors) ?? 0;
      totalKwh += kwh;
      const et = eType.toLowerCase();
      if (scope1Types.has(et)) s1 += co2;
      else if (scope2Types.has(et)) s2 += co2;
    }
    return { s1, s2, total: s1 + s2, totalKwh };
  }, [totalConsumption, factors]);

  const totalCost = useMemo(() => {
    if (!prices?.length) return 0;
    let cost = 0;
    for (const locId of selectedLocationIds) {
      const data = consumption?.[yearNum]?.[locId];
      if (!data) continue;
      for (const [e, kwh] of Object.entries(data)) {
        const p = getActivePrice(prices, locId, e, yearNum);
        if (p > 0) cost += calculateEnergyCost(kwh, p);
      }
    }
    return cost;
  }, [consumption, yearNum, selectedLocationIds, prices]);

  const enPiPerM2 = totalArea > 0 ? scopes.totalKwh / totalArea : null;
  const enPiPerUnit =
    productionVolume && parseFloat(productionVolume) > 0
      ? scopes.totalKwh / parseFloat(productionVolume)
      : null;
  const enPiPerEur =
    revenueEur && parseFloat(revenueEur) > 0 ? scopes.totalKwh / parseFloat(revenueEur) : null;

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
      if (data?.profile_code && data.profile_code in GEWERBE_FRAMEWORKS) {
        setFramework(data.profile_code as GewerbeFrameworkCode);
      }
      setDraftDirty(false);
    })();
    return () => { cancelled = true; };
  }, [tenant?.id, yearNum]);

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
            profile_code: framework,
            texts: aiTexts,
            updated_by: user?.id,
          },
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
          tenantType: "gewerbe_industrie",
          section,
          framework: { code: framework, ...GEWERBE_FRAMEWORKS[framework] },
          context: {
            tenantName: tenant?.name,
            reportYear: yearNum,
            locationCount: selectedLocations.length,
            totalArea,
            totalKwh: Math.round(scopes.totalKwh),
            scope1Co2Tons: Math.round(scopes.s1 / 1000),
            scope2Co2Tons: Math.round(scopes.s2 / 1000),
            totalCostEur: Math.round(totalCost),
            productionUnit: productionUnit || undefined,
            productionVolume: productionVolume ? parseFloat(productionVolume) : undefined,
            revenueEur: revenueEur ? parseFloat(revenueEur) : undefined,
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
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Energiebericht ${reportYear}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5}
  .page{padding:20mm}.page-break{page-break-before:always}
  h1{font-size:24pt;margin-bottom:8pt}h2{font-size:16pt;margin-bottom:6pt;border-bottom:2px solid #2563eb;padding-bottom:4pt}
  h3{font-size:13pt;margin:12pt 0 6pt}
  table{width:100%;border-collapse:collapse;margin:8pt 0}
  th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;font-size:10pt}
  th{background:#f3f4f6;font-weight:600}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:297mm}
  .cover h1{font-size:32pt;color:#2563eb}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12pt;margin:12pt 0}
  .kpi-box{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .kpi-box .value{font-size:18pt;font-weight:700;color:#2563eb}
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
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96" />
        </main>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const fw = GEWERBE_FRAMEWORKS[framework];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-display font-bold flex items-center gap-2">
            <Factory className="h-6 w-6" />
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
                  <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />Rechtsrahmen</CardTitle>
                  <CardDescription>
                    Bestimmt Pflichtinhalte, Bilanzraum und KI-Textbausteine.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={framework} onValueChange={(v) => setFramework(v as GewerbeFrameworkCode)}>
                    <SelectTrigger className="w-full md:w-[480px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.values(GEWERBE_FRAMEWORKS).map((f) => (
                        <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Rechtsgrundlage:</strong> {fw.legalBasis}</p>
                    <p>{fw.description}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Berichtseinstellungen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="text-sm font-medium">Berichtsjahr</label>
                    <Select value={reportYear} onValueChange={setReportYear}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Bezugsgröße (z. B. Stück, t, m³)</label>
                      <Input value={productionUnit} onChange={(e) => setProductionUnit(e.target.value)} placeholder="z. B. Stück" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Produktionsmenge / Jahr</label>
                      <Input type="number" value={productionVolume} onChange={(e) => setProductionVolume(e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Jahresumsatz (€)</label>
                      <Input type="number" value={revenueEur} onChange={(e) => setRevenueEur(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Standorte auswählen</CardTitle>
                      <CardDescription>{selectedLocationIds.length} / {locations.length} ausgewählt</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      {selectedLocationIds.length === locations.length ? "Alle abwählen" : "Alle auswählen"}
                    </Button>
                  </div>
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
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {loc.net_floor_area.toLocaleString("de-DE")} m²
                          </Badge>
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
                    {tenant?.name} · {fw.label} · {selectedLocations.length} Standorte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{Math.round(scopes.totalKwh).toLocaleString("de-DE")}</p>
                      <p className="text-xs text-muted-foreground">Endenergie (kWh)</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{formatCo2(scopes.s1) || "–"}</p>
                      <p className="text-xs text-muted-foreground">Scope 1 (direkt)</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{formatCo2(scopes.s2) || "–"}</p>
                      <p className="text-xs text-muted-foreground">Scope 2 (Strom/Wärme)</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{totalCost > 0 ? formatCurrency(totalCost) : "–"}</p>
                      <p className="text-xs text-muted-foreground">Energiekosten</p>
                    </div>
                  </div>

                  <h3 className="text-base font-semibold mt-6 mb-2">EnPI – Energieleistungskennzahlen</h3>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      <tr className="border-b"><td className="py-2">kWh pro m² NGF</td><td className="text-right font-medium">{enPiPerM2 ? enPiPerM2.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–"}</td></tr>
                      {productionUnit && (
                        <tr className="border-b"><td className="py-2">kWh pro {productionUnit}</td><td className="text-right font-medium">{enPiPerUnit ? enPiPerUnit.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "–"}</td></tr>
                      )}
                      <tr><td className="py-2">kWh pro € Umsatz</td><td className="text-right font-medium">{enPiPerEur ? enPiPerEur.toLocaleString("de-DE", { maximumFractionDigits: 3 }) : "–"}</td></tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Druckansicht */}
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
                  <h2>Energie- und Emissionsbilanz {reportYear}</h2>
                  <div className="kpi-grid">
                    <div className="kpi-box"><div className="value">{Math.round(scopes.totalKwh).toLocaleString("de-DE")}</div><div className="label">Endenergie kWh</div></div>
                    <div className="kpi-box"><div className="value">{formatCo2(scopes.s1) || "–"}</div><div className="label">Scope 1</div></div>
                    <div className="kpi-box"><div className="value">{formatCo2(scopes.s2) || "–"}</div><div className="label">Scope 2</div></div>
                    <div className="kpi-box"><div className="value">{totalCost > 0 ? formatCurrency(totalCost) : "–"}</div><div className="label">Energiekosten</div></div>
                  </div>

                  <h3>Verbrauch nach Energieträger</h3>
                  <table>
                    <thead><tr><th>Energieträger</th><th>Verbrauch (kWh)</th><th>CO₂</th><th>Scope</th></tr></thead>
                    <tbody>
                      {Object.entries(totalConsumption).map(([e, kwh]) => {
                        const co2 = calculateCo2(kwh, e, factors);
                        const et = e.toLowerCase();
                        const scope = scope1Types.has(et) ? "1" : scope2Types.has(et) ? "2" : "–";
                        return (
                          <tr key={e}>
                            <td style={{ textTransform: "capitalize" }}>{e}</td>
                            <td>{kwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                            <td>{co2 !== null ? formatCo2(co2) : "–"}</td>
                            <td>{scope}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <h3>EnPI</h3>
                  <table>
                    <tbody>
                      <tr><td>kWh pro m² NGF</td><td>{enPiPerM2 ? enPiPerM2.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–"}</td></tr>
                      {productionUnit && <tr><td>kWh pro {productionUnit}</td><td>{enPiPerUnit ? enPiPerUnit.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "–"}</td></tr>}
                      <tr><td>kWh pro € Umsatz</td><td>{enPiPerEur ? enPiPerEur.toLocaleString("de-DE", { maximumFractionDigits: 3 }) : "–"}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="page page-break">
                  <h2>Standortübersicht</h2>
                  <table>
                    <thead><tr><th>Standort</th><th>Nutzungsart</th><th>NGF (m²)</th><th>Endenergie (kWh)</th></tr></thead>
                    <tbody>
                      {selectedLocations.map((loc) => {
                        const sum = Object.values(consumption?.[yearNum]?.[loc.id] || {}).reduce((s: number, v: any) => s + (v || 0), 0);
                        return (
                          <tr key={loc.id}>
                            <td>{loc.name}</td>
                            <td>{loc.usage_type || "–"}</td>
                            <td>{loc.net_floor_area?.toLocaleString("de-DE") || "–"}</td>
                            <td>{sum > 0 ? sum.toLocaleString("de-DE", { maximumFractionDigits: 0 }) : "–"}</td>
                          </tr>
                        );
                      })}
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

export default GewerbeIndustrieReport;
