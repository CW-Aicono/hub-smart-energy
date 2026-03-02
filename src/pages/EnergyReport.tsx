import { useState, useMemo, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations, Location } from "@/hooks/useLocations";
import { useCo2Factors } from "@/hooks/useCo2Factors";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BenchmarkIndicator } from "@/components/report/BenchmarkIndicator";
import { Co2FactorSettings } from "@/components/settings/Co2FactorSettings";
import { calculateCo2, formatCo2 } from "@/lib/co2Calculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Building2, Leaf, BarChart3, Settings2 } from "lucide-react";
import { PropertyProfile } from "@/components/report/PropertyProfile";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const EnergyReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locLoading } = useLocations();
  const { factors } = useCo2Factors();
  const { t } = useTranslation();
  const { tenant } = useTenant();

  const [reportYear, setReportYear] = useState(String(currentYear - 1));
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("config");
  const reportRef = useRef<HTMLDivElement>(null);

  const toggleLocation = (id: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
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

  const handleGenerateReport = () => {
    setActiveTab("preview");
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !reportRef.current) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <title>Energiebericht ${reportYear}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
          .page { page-break-after: always; padding: 20mm; min-height: 297mm; }
          .page:last-child { page-break-after: auto; }
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
          .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12pt; margin: 12pt 0; }
          .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
          .kpi-box .value { font-size: 20pt; font-weight: 700; color: #2563eb; }
          .kpi-box .label { font-size: 9pt; color: #6b7280; }
          .rating-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
          .rating-green { background: #10b981; }
          .rating-yellow { background: #f59e0b; }
          .rating-red { background: #ef4444; }
          .profile-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12pt; }
          .profile-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
          .profile-meta dt { font-size: 9pt; color: #6b7280; }
          .profile-meta dd { font-weight: 500; margin-bottom: 4pt; }
          @media print { .page { padding: 15mm; } }
        </style>
      </head>
      <body>${reportRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
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
                {t("energyReport.configuration" as any) || "Konfiguration"}
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2" disabled={selectedLocationIds.length === 0}>
                <FileText className="h-4 w-4" />
                {t("energyReport.preview" as any) || "Vorschau"}
              </TabsTrigger>
              <TabsTrigger value="co2" className="gap-2">
                <Leaf className="h-4 w-4" />
                {t("co2.title" as any) || "CO₂-Faktoren"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6 mt-6">
              {/* Year selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t("energyReport.reportSettings" as any) || "Berichtseinstellungen"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium">
                      {t("energyReport.reportYear" as any) || "Berichtsjahr"}
                    </label>
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
                </CardContent>
              </Card>

              {/* Location selection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {t("energyReport.selectLocations" as any) || "Liegenschaften auswählen"}
                      </CardTitle>
                      <CardDescription>
                        {selectedLocationIds.length} / {locations.length} {t("energyReport.selected" as any) || "ausgewählt"}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      {selectedLocationIds.length === locations.length
                        ? (t("energyReport.deselectAll" as any) || "Alle abwählen")
                        : (t("energyReport.selectAll" as any) || "Alle auswählen")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {locations.map((loc) => (
                      <label
                        key={loc.id}
                        className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                      >
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
                            {loc.net_floor_area} m²
                          </Badge>
                        )}
                      </label>
                    ))}
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
                  {t("energyReport.generate" as any) || "Bericht erstellen"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-6">
              <div className="flex justify-end mb-4">
                <Button onClick={handlePrint} className="gap-2">
                  <Download className="h-4 w-4" />
                  {t("energyReport.downloadPdf" as any) || "Als PDF speichern"}
                </Button>
              </div>

              {/* Hidden printable content */}
              <div ref={reportRef} className="hidden">
                {/* Cover page */}
                <div className="page cover">
                  <h1>Kommunaler Energiebericht</h1>
                  <p>{tenant?.name || ""}</p>
                  <p>Berichtsjahr {reportYear}</p>
                  <p style={{ marginTop: "24pt", fontSize: "11pt", color: "#9ca3af" }}>
                    Erstellt am {new Date().toLocaleDateString("de-DE")}
                  </p>
                </div>

                {/* Management Summary */}
                <div className="page">
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
                      <div className="value">
                        {factors.length > 0 ? "✓" : "–"}
                      </div>
                      <div className="label">CO₂-Faktoren hinterlegt</div>
                    </div>
                  </div>

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

                {/* Individual property profiles */}
                {selectedLocations.map((loc) => (
                  <div key={loc.id} className="page">
                    <h2>Liegenschaftssteckbrief: {loc.name}</h2>
                    <div className="profile-meta">
                      <div>
                        <dt>Adresse</dt>
                        <dd>{loc.address ? `${loc.address}, ${loc.postal_code || ""} ${loc.city || ""}` : "–"}</dd>
                      </div>
                      <div>
                        <dt>Nutzungsart</dt>
                        <dd style={{ textTransform: "capitalize" }}>{loc.usage_type || "–"}</dd>
                      </div>
                      <div>
                        <dt>Baujahr</dt>
                        <dd>{loc.construction_year || "–"}</dd>
                      </div>
                      <div>
                        <dt>Letzte Sanierung</dt>
                        <dd>{loc.renovation_year || "–"}</dd>
                      </div>
                      <div>
                        <dt>Nettogrundfläche (NGF)</dt>
                        <dd>{loc.net_floor_area ? `${loc.net_floor_area.toLocaleString("de-DE")} m²` : "–"}</dd>
                      </div>
                      <div>
                        <dt>Bruttogrundfläche (BGF)</dt>
                        <dd>{loc.gross_floor_area ? `${loc.gross_floor_area.toLocaleString("de-DE")} m²` : "–"}</dd>
                      </div>
                      <div>
                        <dt>Heizungsart</dt>
                        <dd>{loc.heating_type || "–"}</dd>
                      </div>
                      <div>
                        <dt>Energieträger</dt>
                        <dd>{(loc.energy_sources || []).join(", ") || "–"}</dd>
                      </div>
                    </div>

                    <h3>Ansprechpartner</h3>
                    <p>{loc.contact_person || "–"}{loc.contact_email ? ` · ${loc.contact_email}` : ""}{loc.contact_phone ? ` · ${loc.contact_phone}` : ""}</p>

                    <p style={{ marginTop: "16pt", color: "#6b7280", fontStyle: "italic" }}>
                      Hinweis: Verbrauchsdaten und Kennwerte werden automatisch aus den hinterlegten Messstellen berechnet, sobald Daten für das Berichtsjahr {reportYear} vorliegen.
                    </p>
                  </div>
                ))}
              </div>

              {/* On-screen preview */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Kommunaler Energiebericht {reportYear}</CardTitle>
                    <CardDescription>
                      {tenant?.name} · {selectedLocations.length} Liegenschaften · Erstellt am {new Date().toLocaleDateString("de-DE")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
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
                          {factors.length > 0 ? `${factors.length} Faktoren` : "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">CO₂-Faktoren</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {selectedLocations.map((loc) => (
                  <PropertyProfile key={loc.id} location={loc} reportYear={parseInt(reportYear)} factors={factors} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="co2" className="mt-6">
              <Co2FactorSettings />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default EnergyReport;
