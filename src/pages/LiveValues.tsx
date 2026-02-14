import { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, RefreshCw, Search, Gauge, Zap, Flame, Droplets, Thermometer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEnergy, formatGasDual } from "@/lib/formatEnergy";
import { cn } from "@/lib/utils";

const ENERGY_TYPE_CONFIG: Record<string, { label: string; icon: typeof Zap; colorClass: string }> = {
  strom: { label: "Strom", icon: Zap, colorClass: "text-[hsl(var(--energy-strom))]" },
  gas: { label: "Gas", icon: Flame, colorClass: "text-[hsl(var(--energy-gas))]" },
  waerme: { label: "Wärme", icon: Thermometer, colorClass: "text-[hsl(var(--energy-waerme))]" },
  wasser: { label: "Wasser", icon: Droplets, colorClass: "text-[hsl(var(--energy-wasser))]" },
};

interface MeterLiveValue {
  meterId: string;
  value: number | null;
  totalDay: number | null;
  loading: boolean;
}

const LiveValues = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locationsLoading } = useLocations();
  const { meters, loading: metersLoading } = useMeters();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedEnergyType, setSelectedEnergyType] = useState<string>("all");
  const [selectedCaptureType, setSelectedCaptureType] = useState<string>("all");
  const [liveValues, setLiveValues] = useState<Map<string, { value: number; totalDay: number | null }>>(new Map());
  const [manualValues, setManualValues] = useState<Map<string, { value: number; date: string }>>(new Map());
  const [manualDailyTotals, setManualDailyTotals] = useState<Map<string, number>>(new Map());
  const [virtualSources, setVirtualSources] = useState<{ virtual_meter_id: string; source_meter_id: string; operator: string; sort_order: number }[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch virtual meter sources
  useEffect(() => {
    if (!user) return;
    const fetchVirtualSources = async () => {
      const { data } = await supabase
        .from("virtual_meter_sources")
        .select("virtual_meter_id, source_meter_id, operator, sort_order")
        .order("sort_order");
      if (data) setVirtualSources(data);
    };
    fetchVirtualSources();
  }, [user]);

  // Fetch latest manual readings + compute daily totals for manual meters
  useEffect(() => {
    if (!user) return;
    const fetchLatestReadings = async () => {
      const { data } = await supabase
        .from("meter_readings")
        .select("meter_id, value, reading_date")
        .order("reading_date", { ascending: false });

      if (data) {
        const map = new Map<string, { value: number; date: string }>();
        data.forEach((r: any) => {
          if (!map.has(r.meter_id)) {
            map.set(r.meter_id, { value: r.value, date: r.reading_date });
          }
        });
        setManualValues(map);

        // Compute daily consumption: latest reading - previous reading for each meter
        const dailyMap = new Map<string, number>();
        const byMeter = new Map<string, { value: number; reading_date: string }[]>();
        data.forEach((r: any) => {
          const arr = byMeter.get(r.meter_id) || [];
          arr.push({ value: r.value, reading_date: r.reading_date });
          byMeter.set(r.meter_id, arr);
        });
        for (const [meterId, readings] of byMeter) {
          // readings are sorted desc by date already
          if (readings.length >= 2) {
            const latest = readings[0];
            const previous = readings[1];
            const diff = latest.value - previous.value;
            if (diff >= 0) {
              dailyMap.set(meterId, diff);
            }
          }
        }
        setManualDailyTotals(dailyMap);
      }
    };
    fetchLatestReadings();
  }, [user]);

  // Fetch live values for automatic meters
  const fetchLiveValues = useCallback(async () => {
    const autoMeters = meters.filter(
      (m) => !m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (autoMeters.length === 0) return;

    setLoadingLive(true);
    const newValues = new Map<string, { value: number; totalDay: number | null }>();

    // Group by integration
    const byIntegration = new Map<string, typeof autoMeters>();
    autoMeters.forEach((m) => {
      const key = m.location_integration_id!;
      const arr = byIntegration.get(key) || [];
      arr.push(m);
      byIntegration.set(key, arr);
    });

    for (const [integrationId, intMeters] of byIntegration) {
      try {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: { locationIntegrationId: integrationId, action: "getSensors" },
        });
        if (error || !data?.success) continue;

        for (const meter of intMeters) {
          const sensor = data.sensors?.find((s: any) => s.id === meter.sensor_uuid);
          if (sensor) {
            // Use rawValue (numeric) instead of formatted value string
            const numVal = typeof sensor.rawValue === "number"
              ? sensor.rawValue
              : (sensor.rawValue != null ? parseFloat(String(sensor.rawValue)) : NaN);
            const totalDay = typeof sensor.totalDay === "number"
              ? sensor.totalDay
              : (sensor.totalDay != null ? parseFloat(String(sensor.totalDay)) : null);
            if (!isNaN(numVal)) {
              newValues.set(meter.id, { value: numVal, totalDay: totalDay !== null && !isNaN(totalDay) ? totalDay : null });
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch live sensors for integration ${integrationId}:`, err);
      }
    }

    setLiveValues(newValues);
    setLastRefresh(new Date());
    setLoadingLive(false);
  }, [meters]);

  useEffect(() => {
    if (meters.length > 0) {
      fetchLiveValues();
      const interval = setInterval(fetchLiveValues, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchLiveValues, meters.length]);

  // Filter meters
  const filteredMeters = useMemo(() => {
    return meters
      .filter((m) => !m.is_archived)
      .filter((m) => {
        if (selectedLocationId !== "all" && m.location_id !== selectedLocationId) return false;
        if (selectedEnergyType !== "all" && m.energy_type !== selectedEnergyType) return false;
        if (selectedCaptureType !== "all" && m.capture_type !== selectedCaptureType) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const loc = locations.find((l) => l.id === m.location_id);
          return (
            m.name.toLowerCase().includes(q) ||
            (m.meter_number || "").toLowerCase().includes(q) ||
            (loc?.name || "").toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [meters, selectedLocationId, selectedEnergyType, selectedCaptureType, searchQuery, locations]);

  // Helper to get a source meter's current value (live or manual)
  const getSourceValue = useCallback((meterId: string): number | null => {
    if (liveValues.has(meterId)) return liveValues.get(meterId)!.value;
    const manual = manualValues.get(meterId);
    if (manual) return manual.value;
    return null;
  }, [liveValues, manualValues]);

  // Compute virtual meter values
  const virtualValues = useMemo(() => {
    const map = new Map<string, number>();
    const virtualMeterIds = new Set(virtualSources.map((s) => s.virtual_meter_id));

    for (const vmId of virtualMeterIds) {
      const sources = virtualSources
        .filter((s) => s.virtual_meter_id === vmId)
        .sort((a, b) => a.sort_order - b.sort_order);

      let total: number | null = null;
      let allResolved = true;

      for (const src of sources) {
        const val = getSourceValue(src.source_meter_id);
        if (val === null) {
          allResolved = false;
          break;
        }
        if (total === null) {
          total = src.operator === "-" ? -val : val;
        } else {
          total = src.operator === "-" ? total - val : total + val;
        }
      }

      if (allResolved && total !== null) {
        map.set(vmId, total);
      }
    }
    return map;
  }, [virtualSources, getSourceValue]);

  const getValue = (meter: typeof meters[0]): { value: number | null; totalDay: number | null; source: "live" | "manual" | "virtual" | "none"; date?: string } => {
    if (meter.capture_type === "virtual" && virtualValues.has(meter.id)) {
      return { value: virtualValues.get(meter.id)!, totalDay: null, source: "virtual" };
    }
    if (meter.capture_type === "automatic" && liveValues.has(meter.id)) {
      const live = liveValues.get(meter.id)!;
      return { value: live.value, totalDay: live.totalDay, source: "live" };
    }
    const manual = manualValues.get(meter.id);
    if (manual) {
      const dailyTotal = manualDailyTotals.get(meter.id) ?? null;
      return { value: manual.value, totalDay: dailyTotal, source: "manual", date: manual.date };
    }
    return { value: null, totalDay: null, source: "none" };
  };

  if (authLoading || locationsLoading || metersLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                Aktuelle Werte
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Live-Übersicht aller Messstellen und deren aktuelle Werte
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-muted-foreground">
                  Aktualisiert: {lastRefresh.toLocaleTimeString("de-DE")}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={fetchLiveValues} disabled={loadingLive}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loadingLive && "animate-spin")} />
                Aktualisieren
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zähler suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Standort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Standorte</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedEnergyType} onValueChange={setSelectedEnergyType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Energieart" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Energiearten</SelectItem>
                {Object.entries(ENERGY_TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCaptureType} onValueChange={setSelectedCaptureType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Erfassung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="automatic">Automatisch</SelectItem>
                <SelectItem value="manual">Manuell</SelectItem>
                <SelectItem value="virtual">Virtuell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="h-4 w-4" />
            <span>{filteredMeters.length} Messstelle{filteredMeters.length !== 1 ? "n" : ""}</span>
          </div>

          {/* Meter Cards */}
          {filteredMeters.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Keine Messstellen gefunden.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMeters.map((meter) => {
                const { value, totalDay, source, date } = getValue(meter);
                const config = ENERGY_TYPE_CONFIG[meter.energy_type] || ENERGY_TYPE_CONFIG.strom;
                const Icon = config.icon;
                const location = locations.find((l) => l.id === meter.location_id);
                const isFlowType = meter.energy_type === "wasser" || meter.energy_type === "gas";

                return (
                  <Card key={meter.id} className="relative overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={cn("h-4 w-4 shrink-0", config.colorClass)} />
                          <CardTitle className="text-sm font-medium truncate">{meter.name}</CardTitle>
                        </div>
                        <Badge variant={source === "live" ? "default" : source === "virtual" ? "outline" : "secondary"} className="shrink-0 text-[10px] px-1.5 py-0">
                          {source === "live" ? "Live" : source === "virtual" ? "Virtuell" : source === "manual" ? "Manuell" : "–"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-2xl font-bold tracking-tight">
                          {value !== null ? (
                            <>
                              {meter.energy_type === "gas" ? (
                                <>
                                  {value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                  {isFlowType && (
                                    <span className="text-sm font-normal text-muted-foreground ml-1">Durchfluss</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {meter.unit}
                                  {isFlowType && (
                                    <span className="text-sm font-normal text-muted-foreground ml-1">Durchfluss</span>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground text-lg">Kein Wert</span>
                          )}
                        </div>
                        {/* Gas: show kWh equivalent */}
                        {meter.energy_type === "gas" && value !== null && (
                          <div className="text-sm text-muted-foreground font-medium">
                            ≈ {formatGasDual(value, (meter as any).gas_type, (meter as any).brennwert, (meter as any).zustandszahl).kwhStr}
                          </div>
                        )}
                        {totalDay != null && totalDay !== undefined && (
                          <div className="text-sm text-muted-foreground font-medium">
                            {meter.energy_type === "gas" ? (
                              <>
                                {Number(totalDay).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                <span className="ml-1 font-normal">{source === "manual" ? "Verbrauch" : "Gesamt heute"}</span>
                                <span className="ml-2 text-xs">
                                  (≈ {formatGasDual(Number(totalDay), (meter as any).gas_type, (meter as any).brennwert, (meter as any).zustandszahl).kwhStr})
                                </span>
                              </>
                            ) : meter.energy_type === "wasser" ? (
                              <>
                                {Number(totalDay).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                <span className="ml-1 font-normal">{source === "manual" ? "Verbrauch" : "Gesamt heute"}</span>
                              </>
                            ) : (
                              <>
                                {source === "manual"
                                  ? formatEnergy(Number(totalDay) * (meter.unit === "kWh" ? 1000 : 1))
                                  : formatEnergy(Number(totalDay))
                                }
                                <span className="ml-1 font-normal">{source === "manual" ? "Verbrauch" : "Gesamt heute"}</span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground truncate">
                            {location?.name || "–"}
                          </p>
                          {meter.meter_number && (
                            <p className="text-xs text-muted-foreground">
                              Nr. {meter.meter_number}
                            </p>
                          )}
                          {source === "manual" && date && (
                            <p className="text-xs text-muted-foreground">
                              Stand: {new Date(date).toLocaleDateString("de-DE")}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LiveValues;
