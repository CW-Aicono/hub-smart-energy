import { useState, useEffect, lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Database, Filter, Calendar, FileText, Upload, Info, FileSpreadsheet, CheckCircle2, ArrowRight, Receipt } from "lucide-react";
import { downloadCSV, downloadPDF, downloadCsvZip, downloadXlsxMulti } from "@/lib/exportUtils";
import { toast } from "sonner";
import ReportSchedulesList from "@/components/energy-data/ReportSchedulesList";
import { supabase } from "@/integrations/supabase/client";
import { powerUnitForMeter, energyUnitForMeter } from "@/lib/meterUnits";

const DataImportDialog = lazy(() => import("@/components/energy-data/DataImportDialog"));
const InvoicesList = lazy(() => import("@/components/energy-data/InvoicesList"));

interface ReadingExportRow {
  meter_id: string;
  value: number;
  reading_date: string;
  capture_method: string;
}

interface PeriodTotalRow {
  meter_id: string;
  period_type: string;
  period_start: string;
  total_value: number;
  energy_type: string;
  source: string | null;
}

interface PowerReadingRow {
  meter_id: string;
  bucket: string;
  power_avg: number;
}

const PAGE = 1000;
const ZIP_THRESHOLD = 200_000;

const EnergyData = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locationsLoading } = useLocations();
  const { meters, loading: metersLoading } = useMeters();
  const { tenant } = useTenant();
  const { t } = useTranslation();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedEnergyTypes, setSelectedEnergyTypes] = useState<string[]>(["strom", "gas", "waerme", "wasser"]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeReadings, setIncludeReadings] = useState(true);
  const [includeMeters, setIncludeMeters] = useState(true);
  const [includeDailyTotals, setIncludeDailyTotals] = useState(true);
  const [includeMonthlyTotals, setIncludeMonthlyTotals] = useState(false);
  const [includePower5min, setIncludePower5min] = useState(false);
  const [readingsCount, setReadingsCount] = useState(0);
  const [loadingReadings, setLoadingReadings] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const ENERGY_TYPE_KEYS: Record<string, string> = {
    strom: "energyData.strom",
    gas: "energyData.gas",
    waerme: "energyData.waerme",
    wasser: "energyData.wasser",
  };

  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("meter_readings")
        .select("*", { count: "estimated", head: true });
      setReadingsCount(count || 0);
    };
    fetchCount();
  }, [user]);

  if (authLoading || locationsLoading) {
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

  const toggleEnergyType = (type: string) => {
    setSelectedEnergyTypes((prev) =>
      prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]
    );
  };

  const filteredMeters = meters.filter((m) => {
    if (selectedLocationId !== "all" && m.location_id !== selectedLocationId) return false;
    if (!selectedEnergyTypes.includes(m.energy_type)) return false;
    return true;
  });

  // Helper: paginated fetch (Supabase 1k row limit)
  const fetchAllPages = async <T,>(
    builder: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> => {
    const all: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await builder(from, from + PAGE - 1);
      if (error || !data) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (all.length > 1_000_000) break; // hard safety cap
    }
    return all;
  };

  type Block = { name: string; rows: Record<string, string | number>[] };

  const buildExportBlocks = async (): Promise<Block[]> => {
    const blocks: Block[] = [];
    const meterIds = filteredMeters.map((m) => m.id);
    const labelEnergy = (et: string) => t((ENERGY_TYPE_KEYS[et] || et) as any);
    const meterById = new Map(meters.map((m) => [m.id, m]));
    const locById = new Map(locations.map((l) => [l.id, l]));

    setLoadingReadings(true);
    try {
      // Stammdaten
      if (includeMeters && filteredMeters.length > 0) {
        const rows = filteredMeters.map((m) => {
          const loc = locById.get(m.location_id ?? "");
          return {
            Quelle: "Stammdaten",
            Standort: loc?.name || "",
            Zähler: m.name,
            Zählernummer: m.meter_number || "",
            Energieart: labelEnergy(m.energy_type),
            Einheit: m.unit,
            Erfassung: m.capture_type === "automatic" ? "Automatic" : "Manual",
          };
        });
        blocks.push({ name: "Stammdaten", rows });
      }

      // Manuelle Ablesungen
      if (includeReadings && meterIds.length > 0) {
        const rows = await fetchAllPages<ReadingExportRow>(async (from, to) => {
          let q = supabase
            .from("meter_readings")
            .select("meter_id, value, reading_date, capture_method")
            .in("meter_id", meterIds)
            .order("reading_date", { ascending: true })
            .range(from, to);
          if (dateFrom) q = q.gte("reading_date", dateFrom);
          if (dateTo) q = q.lte("reading_date", dateTo);
          const res = await q;
          return { data: res.data as ReadingExportRow[] | null, error: res.error };
        });
        const out = rows.map((r) => {
          const m = meterById.get(r.meter_id);
          const loc = m ? locById.get(m.location_id ?? "") : undefined;
          return {
            Quelle: "Ablesung",
            Standort: loc?.name || "",
            Zähler: m?.name || "",
            Zählernummer: m?.meter_number || "",
            Energieart: labelEnergy(m?.energy_type || ""),
            Datum: r.reading_date,
            Wert: r.value,
            Einheit: energyUnitForMeter(m),
            Erfassung: r.capture_method === "manual" ? "Manual" : r.capture_method === "ai" ? "AI-OCR" : r.capture_method,
          };
        });
        blocks.push({ name: "Ablesungen", rows: out });
      }

      // Tages- / Monatsverbräuche aus meter_period_totals
      if ((includeDailyTotals || includeMonthlyTotals) && meterIds.length > 0) {
        const wanted: string[] = [];
        if (includeDailyTotals) wanted.push("day");
        if (includeMonthlyTotals) wanted.push("month");
        const rows = await fetchAllPages<PeriodTotalRow>(async (from, to) => {
          let q = supabase
            .from("meter_period_totals")
            .select("meter_id, period_type, period_start, total_value, energy_type, source")
            .in("meter_id", meterIds)
            .in("period_type", wanted)
            .order("period_start", { ascending: true })
            .range(from, to);
          if (dateFrom) q = q.gte("period_start", dateFrom);
          if (dateTo) q = q.lte("period_start", dateTo);
          const res = await q;
          return { data: res.data as PeriodTotalRow[] | null, error: res.error };
        });
        const dayRows: Record<string, string | number>[] = [];
        const monthRows: Record<string, string | number>[] = [];
        rows.forEach((r) => {
          const m = meterById.get(r.meter_id);
          const loc = m ? locById.get(m.location_id ?? "") : undefined;
          const out = {
            Quelle: r.period_type === "month" ? "Verbrauch (Monat)" : "Verbrauch (Tag)",
            Standort: loc?.name || "",
            Zähler: m?.name || "",
            Zählernummer: m?.meter_number || "",
            Energieart: labelEnergy(r.energy_type || m?.energy_type || ""),
            Datum: r.period_start,
            Wert: r.total_value,
            Einheit: energyUnitForMeter(m, r.energy_type === "wasser" || r.energy_type === "gas" ? "m³" : "kWh"),
            Quellsystem: r.source || "",
          };
          (r.period_type === "month" ? monthRows : dayRows).push(out);
        });
        if (dayRows.length) blocks.push({ name: "Tagesverbrauch", rows: dayRows });
        if (monthRows.length) blocks.push({ name: "Monatsverbrauch", rows: monthRows });
      }

      // 5-Min-Leistungswerte
      if (includePower5min && meterIds.length > 0) {
        const fromTs = dateFrom ? `${dateFrom}T00:00:00Z` : null;
        const toTs = dateTo ? `${dateTo}T23:59:59Z` : null;
        const rows = await fetchAllPages<PowerReadingRow>(async (from, to) => {
          let q = supabase
            .from("meter_power_readings_5min")
            .select("meter_id, bucket, power_avg")
            .in("meter_id", meterIds)
            .order("bucket", { ascending: true })
            .range(from, to);
          if (fromTs) q = q.gte("bucket", fromTs);
          if (toTs) q = q.lte("bucket", toTs);
          const res = await q;
          return { data: res.data as PowerReadingRow[] | null, error: res.error };
        });
        const out = rows.map((r) => {
          const m = meterById.get(r.meter_id);
          const loc = m ? locById.get(m.location_id ?? "") : undefined;
          const d = new Date(r.bucket);
          const datePart = d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).split(".").reverse().join("-");
          const timePart = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });
          return {
            Quelle: "Leistung 5min",
            Standort: loc?.name || "",
            Zähler: m?.name || "",
            Zählernummer: m?.meter_number || "",
            Energieart: labelEnergy(m?.energy_type || ""),
            Datum: datePart,
            Zeit: timePart,
            Wert: r.power_avg,
            Einheit: powerUnitForMeter(m),
          };
        });
        blocks.push({ name: "Leistung 5min", rows: out });
      }
    } finally {
      setLoadingReadings(false);
    }

    return blocks;
  };

  const getHeaders = (rows: Record<string, string | number>[]) => {
    const allKeys = Array.from(new Set(rows.flatMap(Object.keys)));
    const headers: Record<string, string> = {};
    allKeys.forEach((k) => (headers[k] = k));
    return headers;
  };

  const handleExport = async () => {
    toast.loading("Export wird vorbereitet …", { id: "exp" });
    const blocks = await buildExportBlocks();
    const totalRows = blocks.reduce((s, b) => s + b.rows.length, 0);
    if (totalRows === 0) {
      toast.error("Keine Daten zum Exportieren", { id: "exp" });
      return;
    }
    if (totalRows > ZIP_THRESHOLD || blocks.length > 1) {
      // ZIP mit einer CSV pro Block (Excel-sicher, klare Trennung)
      await downloadCsvZip(
        blocks.map((b) => ({ name: b.name, data: b.rows, headers: getHeaders(b.rows) })),
        "energiedaten-export"
      );
    } else {
      const rows = blocks[0].rows;
      downloadCSV(rows, "energiedaten-export", getHeaders(rows));
    }
    toast.success(`Export fertig: ${totalRows.toLocaleString("de-DE")} Zeilen`, { id: "exp" });
  };

  const handleXlsxExport = async () => {
    toast.loading("Excel-Export wird vorbereitet …", { id: "xlsx" });
    const blocks = await buildExportBlocks();
    const totalRows = blocks.reduce((s, b) => s + b.rows.length, 0);
    if (totalRows === 0) {
      toast.error("Keine Daten zum Exportieren", { id: "xlsx" });
      return;
    }
    downloadXlsxMulti(
      blocks.map((b) => ({ name: b.name, data: b.rows, headers: getHeaders(b.rows) })),
      "energiedaten-export"
    );
    toast.success(`Excel-Export fertig: ${totalRows.toLocaleString("de-DE")} Zeilen`, { id: "xlsx" });
  };

  const handlePdfExport = async () => {
    const blocks = await buildExportBlocks();
    const rows = blocks.flatMap((b) => b.rows);
    if (rows.length === 0) return;
    downloadPDF(rows, "energiedaten-export", getHeaders(rows), t("energyData.title" as any), {
      logoUrl: tenant?.logo_url,
      tenantName: tenant?.name,
    });
  };

  const anySource = includeReadings || includeMeters || includeDailyTotals || includeMonthlyTotals || includePower5min;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            {t("energyData.title" as any)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("energyData.subtitle" as any)}
          </p>
        </header>

        <div className="p-3 md:p-6">
          <Tabs defaultValue="export" className="space-y-6">
            <TabsList>
              <TabsTrigger value="export" className="gap-2">
                <Download className="h-4 w-4" />
                {t("energyData.tabExport" as any)}
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-2">
                <Upload className="h-4 w-4" />
                {t("energyData.tabImport" as any)}
              </TabsTrigger>
              <TabsTrigger value="invoices" className="gap-2">
                <Receipt className="h-4 w-4" />
                {t("energyData.tabInvoices" as any)}
              </TabsTrigger>
            </TabsList>

            {/* === Export Tab === */}
            <TabsContent value="export" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-3">
                {/* Filter: Location */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      {t("energyData.location" as any)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("energyData.selectLocation" as any)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("energyData.allLocations" as any)}</SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Filter: Energy Types */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t("energyData.energyTypes" as any)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(ENERGY_TYPE_KEYS).map(([key, tKey]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`energy-${key}`}
                          checked={selectedEnergyTypes.includes(key)}
                          onCheckedChange={() => toggleEnergyType(key)}
                        />
                        <Label htmlFor={`energy-${key}`} className="text-sm cursor-pointer">{t(tKey as any)}</Label>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Filter: Date Range */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {t("energyData.dateRange" as any)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs">{t("energyData.from" as any)}</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("energyData.to" as any)}</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Data Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("energyData.dataSources" as any)}</CardTitle>
                  <CardDescription>{t("energyData.dataSourcesDesc" as any)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="source-readings"
                          checked={includeReadings}
                          onCheckedChange={(c) => setIncludeReadings(!!c)}
                        />
                        <Label htmlFor="source-readings" className="cursor-pointer font-medium">
                          {t("energyData.meterReadings" as any)}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">{t("energyData.meterReadingsDesc" as any)}</p>
                    </div>
                    <Badge variant="secondary">{readingsCount} {t("energyData.readings" as any)}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="source-meters"
                          checked={includeMeters}
                          onCheckedChange={(c) => setIncludeMeters(!!c)}
                        />
                        <Label htmlFor="source-meters" className="cursor-pointer font-medium">
                          {t("energyData.meters" as any)}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">{t("energyData.metersDesc" as any)}</p>
                    </div>
                    <Badge variant="secondary">{filteredMeters.length} {t("energyData.metersCount" as any)}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="source-daily"
                          checked={includeDailyTotals}
                          onCheckedChange={(c) => setIncludeDailyTotals(!!c)}
                        />
                        <Label htmlFor="source-daily" className="cursor-pointer font-medium">Tagesverbräuche</Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">Tageswerte aus automatischen Zählern (kWh, m³)</p>
                    </div>
                    <Badge variant="secondary">empfohlen</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="source-monthly"
                          checked={includeMonthlyTotals}
                          onCheckedChange={(c) => setIncludeMonthlyTotals(!!c)}
                        />
                        <Label htmlFor="source-monthly" className="cursor-pointer font-medium">Monatsverbräuche</Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">Aggregierte Monatswerte für Reporting</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="source-power5"
                          checked={includePower5min}
                          onCheckedChange={(c) => setIncludePower5min(!!c)}
                        />
                        <Label htmlFor="source-power5" className="cursor-pointer font-medium">5-Minuten-Leistung</Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Lastprofile in kW – kann sehr groß werden, wird automatisch in ZIP/Excel verpackt
                      </p>
                    </div>
                    <Badge variant="outline">groß</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Export Buttons */}
              <div className="flex justify-end gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handlePdfExport}
                  disabled={!anySource || loadingReadings}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {t("energyData.exportPdf" as any)}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleXlsxExport}
                  disabled={!anySource || loadingReadings}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (XLSX)
                </Button>
                <Button
                  size="lg"
                  onClick={handleExport}
                  disabled={!anySource || loadingReadings}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("energyData.exportCsv" as any)}
                </Button>
              </div>

              {/* Automated Reports */}
              <ReportSchedulesList />
            </TabsContent>

            {/* === Import Tab === */}
            <TabsContent value="import" className="space-y-6">
              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    {t("energyData.tabImport" as any)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("energyData.importDescription" as any)}
                  </p>
                </CardContent>
              </Card>

              {/* Import types */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      {t("energyData.importReadingsTitle" as any)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t("energyData.importReadingsDesc" as any)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      {t("energyData.importConsumptionTitle" as any)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t("energyData.importConsumptionDesc" as any)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Requirements */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("energyData.importRequirements" as any)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {t("energyData.importReq1" as any)}
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {t("energyData.importReq2" as any)}
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {t("energyData.importReq3" as any)}
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Import Button */}
              <div className="flex justify-end">
                <Button size="lg" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t("import.title" as any)}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </TabsContent>
            {/* === Invoices Tab === */}
            <TabsContent value="invoices" className="space-y-6">
              <Suspense fallback={<Skeleton className="h-64" />}>
                <InvoicesList />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>

        <Suspense fallback={null}>
          <DataImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
        </Suspense>
      </main>
    </div>
  );
};

export default EnergyData;
