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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { Home, Download, Settings2, FileText, Save, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BDEW_HOUSEHOLD_ELECTRICITY, TENANT_TYPE_PROFILES } from "@/lib/report/tenantTypeProfiles";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const bdewBand = (persons: number) => {
  const clamped = Math.max(1, Math.min(5, persons));
  return BDEW_HOUSEHOLD_ELECTRICITY[clamped];
};

const PrivatReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locLoading } = useLocations();
  const { factors } = useCo2Factors();
  const { tenant } = useTenant();
  const { prices } = useEnergyPrices();
  const profile = TENANT_TYPE_PROFILES.privat;

  const [reportYear, setReportYear] = useState(String(currentYear - 1));
  const [persons, setPersons] = useState("2");
  const [livingArea, setLivingArea] = useState("");
  const [constructionYear, setConstructionYear] = useState("");
  const [heatingType, setHeatingType] = useState("");
  const [activeTab, setActiveTab] = useState("config");
  const [aiTexts, setAiTexts] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const yearNum = parseInt(reportYear);
  const mainLocation = useMemo(() => locations.find((l) => l.is_main_location) || locations[0], [locations]);
  const locationIds = useMemo(() => (mainLocation ? [mainLocation.id] : []), [mainLocation]);

  const { data: consumption } = useLocationYearlyConsumption(locationIds, [yearNum]);

  // Prefill aus Hauptstandort
  useEffect(() => {
    if (!mainLocation) return;
    if (!livingArea && mainLocation.net_floor_area) setLivingArea(String(mainLocation.net_floor_area));
    if (!constructionYear && mainLocation.construction_year) setConstructionYear(String(mainLocation.construction_year));
    if (!heatingType && mainLocation.heating_type) setHeatingType(mainLocation.heating_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLocation?.id]);

  const totals = useMemo(() => {
    if (!mainLocation) return { byType: {} as Record<string, number>, total: 0, co2: 0, cost: 0 };
    const byType = (consumption?.[yearNum]?.[mainLocation.id] || {}) as Record<string, number>;
    let total = 0;
    let co2 = 0;
    let cost = 0;
    for (const [e, kwh] of Object.entries(byType)) {
      total += kwh;
      co2 += calculateCo2(kwh, e, factors) ?? 0;
      const p = getActivePrice(prices || [], mainLocation.id, e, yearNum);
      if (p > 0) cost += calculateEnergyCost(kwh, p);
    }
    return { byType, total, co2, cost };
  }, [consumption, yearNum, factors, prices, mainLocation]);

  const personsNum = parseInt(persons) || 1;
  const areaNum = parseFloat(livingArea) || 0;
  const electricityKwh = totals.byType.strom || 0;
  const bdew = bdewBand(personsNum);
  const electricityRating: "green" | "yellow" | "red" = electricityKwh === 0 ? "yellow"
    : electricityKwh <= bdew.avg ? "green"
    : electricityKwh <= bdew.max ? "yellow" : "red";

  const heatingKwh = Object.entries(totals.byType)
    .filter(([e]) => ["gas", "oel", "heizoel", "fernwaerme", "fernwarme", "waerme", "biomasse"].includes(e.toLowerCase()))
    .reduce((s, [, v]) => s + v, 0);
  const heatingPerM2 = areaNum > 0 ? heatingKwh / areaNum : null;

  // Draft persistence
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("energy_report_drafts")
        .select("texts")
        .eq("tenant_id", tenant.id)
        .eq("report_year", yearNum)
        .maybeSingle();
      if (cancelled) return;
      if (data?.texts && typeof data.texts === "object") setAiTexts(data.texts as Record<string, string>);
      else setAiTexts({});
      setDraftDirty(false);
    })();
    return () => { cancelled = true; };
  }, [tenant?.id, yearNum]);

  const saveDraft = async () => {
    if (!tenant?.id) return;
    setDraftSaving(true);
    try {
      const { error } = await supabase.from("energy_report_drafts").upsert(
        { tenant_id: tenant.id, report_year: yearNum, profile_code: "BDEW", texts: aiTexts, updated_by: user?.id },
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
          tenantType: "privat",
          section,
          context: {
            tenantName: tenant?.name,
            reportYear: yearNum,
            persons: personsNum,
            livingArea: areaNum,
            constructionYear: constructionYear ? parseInt(constructionYear) : undefined,
            heatingType,
            electricityKwh,
            heatingKwh,
            heatingPerM2: heatingPerM2 ? Math.round(heatingPerM2) : undefined,
            bdewAvg: bdew.avg,
            bdewMin: bdew.min,
            bdewMax: bdew.max,
            totalCo2Kg: Math.round(totals.co2),
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
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Energiebericht ${reportYear}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5}
  .page{padding:20mm}.page-break{page-break-before:always}
  h1{font-size:24pt;margin-bottom:8pt}h2{font-size:16pt;margin-bottom:6pt;border-bottom:2px solid #10b981;padding-bottom:4pt}
  h3{font-size:13pt;margin:12pt 0 6pt}
  table{width:100%;border-collapse:collapse;margin:8pt 0}
  th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;font-size:10pt}
  th{background:#f3f4f6;font-weight:600}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:297mm}
  .cover h1{font-size:32pt;color:#10b981}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12pt;margin:12pt 0}
  .kpi-box{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .kpi-box .value{font-size:18pt;font-weight:700;color:#10b981}
  .kpi-box .label{font-size:9pt;color:#6b7280}
  .badge-green{background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:9pt}
  .badge-yellow{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:9pt}
  .badge-red{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:9pt}
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

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-display font-bold flex items-center gap-2">
            <Home className="h-6 w-6" />
            {profile.reportTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{profile.reportSubtitle}</p>
        </header>

        <div className="p-3 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="config" className="gap-2"><Settings2 className="h-4 w-4" />Konfiguration</TabsTrigger>
              <TabsTrigger value="preview" className="gap-2"><FileText className="h-4 w-4" />Vorschau</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Haushaltsangaben</CardTitle>
                  <CardDescription>
                    Werden einmalig für diesen Bericht eingegeben und nicht dauerhaft gespeichert (z. B. Auszug/Anbau können sich ändern).
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Berichtsjahr</label>
                    <Select value={reportYear} onValueChange={setReportYear}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Personen im Haushalt</label>
                    <Input type="number" min={1} max={10} value={persons} onChange={(e) => setPersons(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Wohnfläche (m²)</label>
                    <Input type="number" value={livingArea} onChange={(e) => setLivingArea(e.target.value)} placeholder="z. B. 120" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Baujahr</label>
                    <Input type="number" value={constructionYear} onChange={(e) => setConstructionYear(e.target.value)} placeholder="z. B. 1995" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground">Heizungsart</label>
                    <Input value={heatingType} onChange={(e) => setHeatingType(e.target.value)} placeholder="z. B. Gasbrennwert, Wärmepumpe …" />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button size="lg" onClick={() => setActiveTab("preview")} className="gap-2">
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
                    <Sparkles className="h-4 w-4" />KI-Texte
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
                  <AiDisclaimer text="Diese Texte wurden mit KI generiert. Bitte vor Veröffentlichung prüfen." />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{profile.reportTitle} {reportYear}</CardTitle>
                  <CardDescription>
                    {personsNum}-Personen-Haushalt{areaNum > 0 ? ` · ${areaNum.toLocaleString("de-DE")} m²` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{electricityKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted-foreground">Strom kWh</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{heatingKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted-foreground">Wärme kWh</p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{totals.co2 > 0 ? formatCo2(totals.co2) : "–"}</p>
                      <p className="text-xs text-muted-foreground">CO₂-Fußabdruck</p>
                    </div>
                  </div>

                  <h3 className="text-base font-semibold mt-6 mb-2">Vergleich mit Durchschnittshaushalt (BDEW)</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b"><th className="text-left py-2">Kennzahl</th><th className="text-right">Ihr Haushalt</th><th className="text-right">Ø {personsNum} P.</th><th className="text-right">Bewertung</th></tr></thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">Strom (kWh/a)</td>
                        <td className="text-right">{electricityKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                        <td className="text-right">{bdew.min.toLocaleString("de-DE")}–{bdew.max.toLocaleString("de-DE")}</td>
                        <td className="text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${electricityRating === "green" ? "bg-green-100 text-green-800" : electricityRating === "yellow" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                            {electricityRating === "green" ? "gut" : electricityRating === "yellow" ? "mittel" : "hoch"}
                          </span>
                        </td>
                      </tr>
                      {heatingPerM2 !== null && (
                        <tr><td className="py-2">Wärme spez. (kWh/m²)</td><td className="text-right">{heatingPerM2.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td><td className="text-right">100–150</td><td className="text-right text-muted-foreground text-xs">GEG-Orientierung</td></tr>
                      )}
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
                  <p style={{ marginTop: "12pt", fontSize: "10pt", color: "#6b7280" }}>{profile.defaultLegalBasis}</p>
                  <p style={{ marginTop: "24pt", fontSize: "11pt", color: "#9ca3af" }}>Erstellt am {new Date().toLocaleDateString("de-DE")}</p>
                </div>

                {profile.aiSections.map((s) => aiTexts[s.key] ? (
                  <div key={s.key} className="page page-break">
                    <h2>{s.label}</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiTexts[s.key] }} />
                  </div>
                ) : null)}

                <div className="page page-break">
                  <h2>Haushaltsprofil</h2>
                  <table>
                    <tbody>
                      <tr><th>Personen</th><td>{personsNum}</td></tr>
                      <tr><th>Wohnfläche</th><td>{areaNum > 0 ? `${areaNum.toLocaleString("de-DE")} m²` : "–"}</td></tr>
                      <tr><th>Baujahr</th><td>{constructionYear || "–"}</td></tr>
                      <tr><th>Heizungsart</th><td>{heatingType || "–"}</td></tr>
                    </tbody>
                  </table>

                  <h3>Verbrauchsübersicht {reportYear}</h3>
                  <div className="kpi-grid">
                    <div className="kpi-box"><div className="value">{electricityKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</div><div className="label">Strom kWh</div></div>
                    <div className="kpi-box"><div className="value">{heatingKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</div><div className="label">Wärme kWh</div></div>
                    <div className="kpi-box"><div className="value">{totals.co2 > 0 ? formatCo2(totals.co2) : "–"}</div><div className="label">CO₂</div></div>
                  </div>

                  <table>
                    <thead><tr><th>Energieträger</th><th>Verbrauch (kWh)</th><th>CO₂</th><th>Kosten</th></tr></thead>
                    <tbody>
                      {Object.entries(totals.byType).map(([e, kwh]) => {
                        const co2 = calculateCo2(kwh, e, factors);
                        const p = getActivePrice(prices || [], mainLocation?.id || "", e, yearNum);
                        const cost = p > 0 ? calculateEnergyCost(kwh, p) : 0;
                        return (
                          <tr key={e}>
                            <td style={{ textTransform: "capitalize" }}>{e}</td>
                            <td>{kwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                            <td>{co2 !== null ? formatCo2(co2) : "–"}</td>
                            <td>{cost > 0 ? formatCurrency(cost) : "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <h3>Vergleich mit BDEW-Durchschnittshaushalt</h3>
                  <table>
                    <thead><tr><th>Kennzahl</th><th>Ihr Haushalt</th><th>Ø {personsNum} P.</th><th>Bewertung</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>Strom (kWh/a)</td>
                        <td>{electricityKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td>
                        <td>{bdew.min.toLocaleString("de-DE")}–{bdew.max.toLocaleString("de-DE")}</td>
                        <td><span className={`badge-${electricityRating}`}>{electricityRating === "green" ? "gut" : electricityRating === "yellow" ? "mittel" : "hoch"}</span></td>
                      </tr>
                      {heatingPerM2 !== null && (
                        <tr><td>Wärme spez. (kWh/m²a)</td><td>{heatingPerM2.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</td><td>100–150</td><td>GEG-Orientierung</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <AiDisclaimer text="Die im Bericht dargestellten Kennwerte basieren auf den erfassten Verbrauchsdaten und hinterlegten Faktoren. Keine Gewähr für Vollständigkeit oder Richtigkeit. Ersetzt keinen Energieausweis." />
        </div>
      </main>
    </div>
  );
};

export default PrivatReport;
