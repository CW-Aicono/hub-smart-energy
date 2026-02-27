import { useState, useEffect } from "react";
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
import { Download, Database, Filter, Calendar, FileText } from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportUtils";
import ReportSchedulesList from "@/components/energy-data/ReportSchedulesList";
import { supabase } from "@/integrations/supabase/client";

interface ReadingExportRow {
  meter_id: string;
  value: number;
  reading_date: string;
  capture_method: string;
}

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
  const [readingsCount, setReadingsCount] = useState(0);
  const [loadingReadings, setLoadingReadings] = useState(false);

  const ENERGY_TYPE_KEYS: Record<string, string> = {
    strom: "energyData.strom",
    gas: "energyData.gas",
    waerme: "energyData.waerme",
    wasser: "energyData.wasser",
  };

  // Fetch reading count for badge
  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("meter_readings")
        .select("*", { count: "exact", head: true });
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

  const buildExportRows = async () => {
    const rows: Record<string, string | number>[] = [];

    if (includeReadings) {
      setLoadingReadings(true);
      const meterIds = filteredMeters.map((m) => m.id);
      if (meterIds.length > 0) {
        let query = supabase
          .from("meter_readings")
          .select("meter_id, value, reading_date, capture_method")
          .in("meter_id", meterIds)
          .order("reading_date", { ascending: true });

        if (dateFrom) query = query.gte("reading_date", dateFrom);
        if (dateTo) query = query.lte("reading_date", dateTo);

        const { data } = await query;
        const readingRows = (data ?? []) as ReadingExportRow[];

        readingRows.forEach((r) => {
          const meter = meters.find((m) => m.id === r.meter_id);
          const loc = locations.find((l) => l.id === meter?.location_id);
          rows.push({
            Quelle: t("energyData.meterReadings" as any),
            Standort: loc?.name || "",
            Zähler: meter?.name || "",
            Zählernummer: meter?.meter_number || "",
            Energieart: t((ENERGY_TYPE_KEYS[meter?.energy_type || ""] || meter?.energy_type || "") as any),
            Datum: r.reading_date,
            Wert: r.value,
            Einheit: meter?.unit || "kWh",
            Erfassung: r.capture_method === "manual" ? "Manual" : r.capture_method === "ai" ? "AI-OCR" : r.capture_method,
          });
        });
      }
      setLoadingReadings(false);
    }

    if (includeMeters && filteredMeters.length > 0) {
      filteredMeters.forEach((m) => {
        const loc = locations.find((l) => l.id === m.location_id);
        rows.push({
          Quelle: t("energyData.meters" as any),
          Standort: loc?.name || "",
          Name: m.name,
          Zählernummer: m.meter_number || "",
          Energieart: t((ENERGY_TYPE_KEYS[m.energy_type] || m.energy_type) as any),
          Einheit: m.unit,
          Erfassung: m.capture_type === "automatic" ? "Automatic" : "Manual",
        });
      });
    }

    return rows;
  };

  const getHeaders = (rows: Record<string, string | number>[]) => {
    const allKeys = Array.from(new Set(rows.flatMap(Object.keys)));
    const headers: Record<string, string> = {};
    allKeys.forEach((k) => (headers[k] = k));
    return headers;
  };

  const handleExport = async () => {
    const rows = await buildExportRows();
    if (rows.length === 0) return;
    downloadCSV(rows, "energiedaten-export", getHeaders(rows));
  };

  const handlePdfExport = async () => {
    const rows = await buildExportRows();
    if (rows.length === 0) return;
    downloadPDF(rows, "energiedaten-export", getHeaders(rows), t("energyData.title" as any), {
      logoUrl: tenant?.logo_url,
      tenantName: tenant?.name,
    });
  };

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

        <div className="p-3 md:p-6 space-y-6">
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
            </CardContent>
          </Card>

          {/* Export Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePdfExport}
              disabled={(!includeReadings && !includeMeters) || loadingReadings}
            >
              <FileText className="h-4 w-4 mr-2" />
              {t("energyData.exportPdf" as any)}
            </Button>
            <Button
              size="lg"
              onClick={handleExport}
              disabled={(!includeReadings && !includeMeters) || loadingReadings}
            >
              <Download className="h-4 w-4 mr-2" />
              {t("energyData.exportCsv" as any)}
            </Button>
          </div>

          {/* Automated Reports */}
          <ReportSchedulesList />
        </div>
      </main>
    </div>
  );
};

export default EnergyData;